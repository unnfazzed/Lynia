#!/usr/bin/env python3
"""Render the multi-container (API + OTel Collector sidecar) Cloud Run manifest
from the LIVE service, instead of hand-filling service.yaml.template.

Why: the template requires reproducing every --set-env-vars / --set-secrets entry
from release.yml by hand — drift-prone, and a missed secret bricks the revision.
The live service already carries the exact env/secret set the release workflow
deployed, so this script describes it, strips the server-generated fields, grafts
in the sidecar (mirroring service.yaml.template), and emits a manifest for
`gcloud run services replace`. Review the output before applying.

Usage (Cloud Shell):
    python3 infra/otel-collector/render-service.py \
        --project lynia-500911 --region africa-south1 > infra/otel-collector/service.yaml
    gcloud run services replace infra/otel-collector/service.yaml \
        --region africa-south1 --project lynia-500911

    # offline/testing: render from a saved `gcloud run services describe --format=yaml`
    python3 infra/otel-collector/render-service.py --from-file live.yaml

Rollback: re-run the release workflow — it redeploys the single-container form
(and drops the sidecar; that drift is documented in docs/OBSERVABILITY.md).
"""

import argparse
import subprocess
import sys

import yaml

COLLECTOR_IMAGE = "otel/opentelemetry-collector-contrib:0.116.0"  # pinned — never :latest
CONFIG_SECRET = "otel-collector-config"


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def describe_live(service: str, project: str, region: str) -> dict:
    out = subprocess.run(
        ["gcloud", "run", "services", "describe", service,
         "--project", project, "--region", region, "--format", "yaml"],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        die(f"gcloud describe failed:\n{out.stderr}")
    return yaml.safe_load(out.stdout)


def set_env(container: dict, name: str, value: str) -> None:
    env = container.setdefault("env", [])
    for entry in env:
        if entry.get("name") == name:
            entry.pop("valueFrom", None)
            entry["value"] = value
            return
    env.append({"name": name, "value": value})


def render(live: dict) -> dict:
    tmpl = live.get("spec", {}).get("template", {})
    containers = tmpl.get("spec", {}).get("containers", [])
    if len(containers) != 1:
        die(f"expected exactly 1 container on the live service, found {len(containers)} "
            "(sidecar already applied? re-render from a fresh single-container deploy)")
    api = containers[0]
    if not any(p.get("containerPort") == 3000 for p in api.get("ports", [])):
        die("live container does not listen on 3000 — refusing to guess the ingress container")

    # The API container: keep everything the release deploy set, add the OTLP endpoint.
    # The endpoint lives HERE (coupled to the sidecar) so "endpoint set" ⇔ "collector present".
    api["name"] = "api"
    set_env(api, "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    set_env(api, "OTEL_SERVICE_NAME", "lynia-api")

    sidecar = {
        "name": "otel-collector",
        "image": COLLECTOR_IMAGE,
        "args": ["--config=/etc/otelcol/config.yaml"],
        "resources": {"limits": {"cpu": "1", "memory": "256Mi"}},
        "volumeMounts": [{"name": "otel-config", "mountPath": "/etc/otelcol"}],
    }

    # Revision template annotations: keep the deploy-shaped ones, drop gcloud bookkeeping,
    # force gen2 (multi-container requirement per service.yaml.template).
    rev_ann = {
        k: v for k, v in (tmpl.get("metadata", {}).get("annotations") or {}).items()
        if not k.startswith("run.googleapis.com/client-")
        and k != "run.googleapis.com/operation-id"
    }
    rev_ann["run.googleapis.com/execution-environment"] = "gen2"

    spec = dict(tmpl.get("spec", {}))
    spec["containers"] = [api, sidecar]
    volumes = [v for v in (spec.get("volumes") or []) if v.get("name") != "otel-config"]
    volumes.append({
        "name": "otel-config",
        "secret": {"secretName": CONFIG_SECRET, "items": [{"key": "latest", "path": "config.yaml"}]},
    })
    spec["volumes"] = volumes

    return {
        "apiVersion": "serving.knative.dev/v1",
        "kind": "Service",
        "metadata": {
            "name": live["metadata"]["name"],
            "labels": {
                "cloud.googleapis.com/location":
                    live["metadata"]["labels"]["cloud.googleapis.com/location"],
            },
            "annotations": {
                "run.googleapis.com/ingress":
                    live["metadata"]["annotations"]["run.googleapis.com/ingress"],
            },
        },
        "spec": {
            # No revision name: the server generates one (a fixed name collides on re-apply).
            "template": {"metadata": {"annotations": rev_ann}, "spec": spec},
            "traffic": [{"latestRevision": True, "percent": 100}],
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--service", default="lynia-api")
    ap.add_argument("--project")
    ap.add_argument("--region")
    ap.add_argument("--from-file", help="render from a saved describe --format=yaml instead of gcloud")
    args = ap.parse_args()

    if args.from_file:
        with open(args.from_file) as fh:
            live = yaml.safe_load(fh)
    else:
        if not (args.project and args.region):
            die("--project and --region are required (or use --from-file)")
        live = describe_live(args.service, args.project, args.region)

    yaml.safe_dump(render(live), sys.stdout, sort_keys=False, default_flow_style=False)


if __name__ == "__main__":
    main()
