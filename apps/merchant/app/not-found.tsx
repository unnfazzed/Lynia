"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { legacyHref } from "./lib/routes";

/**
 * Any address with no page behind it (Cloudflare serves this as the site's 404, docs/MERCHANT-WEB.md).
 * An old path-style link (`/queue/<id>`, `/h/<token>` …) goes on to the same page at its new address;
 * anything else goes to the dashboard's home. Nothing is drawn: the next page is a moment away.
 */
export default function NotFound() {
  const router = useRouter();
  useEffect(() => {
    router.replace(legacyHref(window.location.pathname) ?? "/");
  }, [router]);
  return null;
}
