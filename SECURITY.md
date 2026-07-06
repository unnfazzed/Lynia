# Security Policy

Lynia handles sensitive personal data — phone numbers, national-ID / KYC records, addresses,
and live location. We take security seriously and welcome responsible disclosure.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately, one of:

- Use GitHub's **[Private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)**
  (Security tab → *Report a vulnerability*).
- Email the maintainers at the address in the repository profile.

Include, where you can:

- A description of the issue and its impact.
- Steps to reproduce (a proof of concept, affected endpoint/flow, or request).
- Any suggested remediation.

## What to expect

- **Acknowledgement** within 3 business days.
- An initial assessment and severity triage within 7 business days.
- Progress updates until resolution, and credit in the fix notes if you would like it.

## Scope

In scope: the API (`apps/api`), mobile app (`apps/mobile`), admin console (`apps/admin`),
shared packages, and the deployment/infra configuration in this repository.

Out of scope: denial-of-service testing against production, social engineering of staff or
users, physical attacks, and reports from automated scanners without a demonstrated,
exploitable impact.

## Safe harbor

We will not pursue or support legal action against researchers who act in good faith, follow
this policy, avoid privacy violations and service degradation, and give us reasonable time to
remediate before any public disclosure.

## Our security posture

Our engineering security plan and threat model live in
[`docs/SECURITY.md`](docs/SECURITY.md).
