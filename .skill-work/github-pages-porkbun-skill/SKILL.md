---
name: github-pages-porkbun-skill
description: >-
  Deploy a static site to GitHub Pages with a custom domain, where DNS is managed
  by Porkbun. Activates on requests to deploy a static site, publish a page to
  GitHub Pages, set up a custom domain, create a CNAME, provision HTTPS, fix a
  broken HTTPS cert on GitHub Pages, point a subdomain at GitHub Pages, or add a
  DNS record via Porkbun. Covers the full end-to-end flow: repo + CNAME file +
  .nojekyll, enable Pages, create the Porkbun CNAME, and provision the Let's
  Encrypt cert. Includes the non-obvious fix for the most common failure: cert
  stuck at null because GitHub never started ACME issuance.
license: MIT
metadata:
  author: agent-skill-creator
  version: 1.0.0
  created: 2026-06-23
  last_reviewed: 2026-06-23
  review_interval_days: 180
  dependencies:
    - url: https://api.porkbun.com/api/json/v3
      name: Porkbun API
      type: api
    - url: https://api.github.com
      name: GitHub REST API (Pages)
      type: api
---

# /github-pages-porkbun-skill — Deploy a static site to GitHub Pages with a Porkbun DNS custom domain

You are a site-deployment expert. Your job is to take a static site (single
`index.html` or a directory of static assets) and ship it to a custom domain
on GitHub Pages, where DNS is managed by Porkbun — end to end, including the
HTTPS certificate.

This skill exists because the obvious steps are easy and the one step that
actually breaks is invisible. Read this whole file before acting; the
"Critical insight" section below is the difference between a 5-minute deploy
and a 3-hour deploy that never finishes.

## Trigger

User invokes `/github-pages-porkbun-skill` followed by their input:

```
/github-pages-porkbun-skill deploy ./site/ to todo.javagrant.ac.nz
/github-pages-porkbun-skill the site is live over HTTP but https gives a cert error
/github-pages-porkbun-skill add a CNAME for blog.mysite.com pointing at GitHub Pages
/github-pages-porkbun-skill set up tools.mysite.ac.nz like tools.javagrant.ac.nz
/github-pages-porkbun-skill my https_certificate is stuck at null
```

Also activates on natural language: "deploy this static site", "publish to
GitHub Pages with a custom domain", "set up HTTPS on my Pages site", "the cert
won't provision", "add the DNS record on Porkbun".

## What this skill handles

1. **Full deploy** — repo, `CNAME` file, `.nojekyll`, push, enable Pages, create
   Porkbun CNAME, provision cert, enable HTTPS enforcement.
2. **DNS-only** — just add/fix the Porkbun CNAME for an existing Pages site.
3. **Cert debugging** — the site works over HTTP but HTTPS fails, or
   `https_certificate` is `null` / stuck.
4. **Mirror an existing setup** — "set up X like the working Y subdomain."

## Prerequisites

Before doing anything, confirm these exist. Ask once, compactly, if missing:

- **Porkbun API key + secret** in `~/.secrets/porkbun.env` (dotenv format)
  as `PORKBUN_API_KEY` and `PORKBUN_SECRET_KEY`. (Env vars with the same
  names take precedence — harnesses may inject them without touching disk.)
  If the file is absent or the keys are rejected by `POST /api/json/v3/ping`
  (Porkbun returns `INVALID_API_KEYS_001`), the user must regenerate keys at
  https://porkbun.com/account/api and save them. Do NOT proceed with DNS
  until `/ping` returns `"status":"SUCCESS"`.
- **`gh` CLI** authenticated (`gh auth status`) with `repo` scope.
- **A built static site** — an `index.html` (and assets) on disk. No build step
  here; if the user has a framework, they build first.

## Critical insight (read before debugging HTTPS)

This is the single most important thing in this skill. Do not skip it.

**GitHub does not provision the Let's Encrypt certificate until it successfully
verifies the custom domain. And GitHub only attempts verification when the
custom domain is (re)submitted via the API or UI *while the DNS already
resolves correctly*.**

Consequence: if Pages was enabled, or the CNAME file was committed, *before*
the DNS record existed, GitHub recorded the domain but the verification
silently failed and was **never retried**. The `https_certificate` field then
stays `null` forever, no matter how long you wait. Polling is useless — you
are waiting on a process that will never start.

### The fix (this is the move)

Once DNS resolves correctly (confirm with `dig` first), force GitHub to retry
verification + issuance by clearing and re-adding the CNAME through the Pages
API:

```bash
# 1. Confirm DNS is actually correct at the authoritative nameserver
dig +short @maceio.porkbun.com <subdomain>.<domain> CNAME
# must return javagrant.github.io. (or the relevant <user>.github.io.)

# 2. Clear the custom domain
gh api repos/<USER>/<REPO>/pages -X PUT -f cname=""

# 3. Wait a beat, then re-add it — this re-triggers verification + ACME issuance
sleep 5
gh api repos/<USER>/<REPO>/pages -X PUT -f cname="<subdomain>.<domain>"
```

Within ~20 seconds the cert state goes from `null` →
`authorization_created` → `approved`. That transition (`null` →
`authorization_created`) is the signal that issuance has actually started. If
you do not see it leave `null`, the fix did not take — re-check DNS at the
authoritative server and repeat.

**Do not** waste time on these red herrings (the previous agent spent ~30
minutes on them):

- ❌ Repeatedly polling `https_certificate` when it is `null`. If it's `null`
  after the first re-add, the process hasn't been triggered — re-trigger, don't
  wait longer.
- ❌ Setting `https_enforced=true` to "force" cert provisioning. Enforcement
  requires a cert to already exist; setting it when `https_certificate` is
  `null` does nothing. Set it **after** the cert reaches `approved`.
- ❌ Triggering Pages rebuilds (`POST /pages/builds`). Build status is about
  site content, not cert issuance. A `built` site with `null` cert is the
  exact failure state this section describes.
- ❌ Blaming the `*.<domain>` wildcard record or Cloudflare proxy. Verify at
  the **authoritative** nameserver (`dig @maceio.porkbun.com ...`). If the
  explicit CNAME is correct there, the wildcard is not the problem — local
  resolver cache or a proxy IP seen by `curl` is a red herring. Confirm with
  DoH (`curl --doh-url https://1.1.1.1/dns-query ...`) to bypass local DNS.
- ❌ Deleting the wildcard record, toggling the Cloudflare proxy, or other
  DNS surgery *before* doing the clear-and-re-add CNAME dance. The dance is
  the fix; try it first.

## Full deploy procedure

### 1. Repository

Create the repo locally with the site contents and two files:

- `CNAME` — contains exactly the custom domain, e.g. `todo.javagrant.ac.nz`
  (no trailing dot, no scheme). Required so GitHub knows the custom domain
  across pushes.
- `.nojekyll` — empty file. Disables Jekyll so files starting with `_` and the
  verbatim directory structure are served as-is. Almost always wanted for
  hand-built static sites.

```bash
git init && git add -A && git commit -m "feat: initial site"
gh repo create <USER>/<REPO> --public --source=. --push
```

### 2. Enable GitHub Pages (legacy, root)

Mirror the proven `tools.javagrant.ac.nz` setup unless the user has reason
otherwise: **legacy** build type, **`main`** branch, **`/`** path.

```bash
gh api repos/<USER>/<REPO>/pages -X POST \
  -f build_type=legacy -f source[branch]=main -f source[path]=/
```

The `CNAME` file in the repo sets the custom domain automatically; the Pages
config will reflect `cname: <subdomain>.<domain>` after the first build.

### 3. Porkbun DNS record

Create a CNAME: name `<subdomain>`, content `<user>.github.io`, TTL 600. Match
an existing working subdomain record exactly if one exists (see
`references/porkbun-dns.md`).

**Porkbun API gotcha (2025+):** the secret field is named `secretapikey` in the
JSON body — **not** `secret`, **not** `secretkey`. Many integrations break here.
The key field is `apikey`. See `references/porkbun-dns.md` for the exact
request shapes.

```bash
# Create the CNAME (correct endpoint is /dns/create/<domain>, NOT /dns/create/<domain>/CNAME)
curl -s -X POST "https://api.porkbun.com/api/json/v3/dns/create/<domain>" \
  -H 'Content-Type: application/json' \
  -d '{"secretapikey":"<SECRET>","apikey":"<KEY>","name":"<subdomain>","type":"CNAME","content":"<user>.github.io","ttl":600}'
```

Then verify the authoritative nameserver returns the CNAME:

```bash
dig +short @maceio.porkbun.com <subdomain>.<domain> CNAME   # -> <user>.github.io.
```

### 4. Provision the HTTPS certificate

If you just created a fresh Pages site, run the clear-and-re-add dance from the
"Critical insight" section proactively — it skips the multi-minute ambiguity.
Then poll for `approved` (this usually takes 20–90 seconds once triggered):

```bash
gh api repos/<USER>/<REPO>/pages | python3 -c \
  "import sys,json; d=json.load(sys.stdin); c=d.get('https_certificate'); print(c.get('state') if c else 'None')"
```

States: `None` → `authorization_created` → `authorization_pending` →
`authorized` → `issued` → `approved`. Seeing `authorization_created` means it
worked. Stop polling once `approved`.

### 5. Enable HTTPS enforcement

Only after the cert is `approved`:

```bash
gh api repos/<USER>/<REPO>/pages -X PUT -F https_enforced=true
```

### 6. Verify end-to-end

```bash
curl -sI --doh-url https://1.1.1.1/dns-query https://<subdomain>.<domain>/ | head -5
# Expect: HTTP/2 200, subject: CN=<subdomain>.<domain>, issuer: Let's Encrypt
```

Use `--doh-url` for verification so local DNS cache / ISP interception does not
produce false negatives. If the cert shows `CN=*.github.io`, the edge node
hasn't picked up the new cert yet — wait a few minutes and retry; this is
normal propagation, not a failure.

## Helper scripts

- `scripts/porkbun.py` — Porkbun API wrapper (`ping`, `list-records`,
  `create-cname`, `delete-record`, `get-record`). Reads credentials from
  `~/.secrets/porkbun.env` (or `PORKBUN_API_KEY`/`PORKBUN_SECRET_KEY` env vars).
- `scripts/pages.py` — GitHub Pages wrapper (`status`, `enable`, `set-cname`,
  `clear-cname`, `force-verify` (the clear+re-add dance), `cert`, `enforce-https`).
- `scripts/deploy.py` — end-to-end: repo + CNAME + .nojekyll + Pages + DNS + cert + enforce.

See `references/` for deep dives: `porkbun-dns.md` (full API), `github-pages.md`
(Pages API, cert lifecycle, the verification mechanism), `troubleshooting.md`
(decision tree for every common failure).

## Anti-goals

- Does not build framework sites (React/Vue/Next). Build first, then deploy the
  output directory.
- Does not manage DNS providers other than Porkbun. The clear-and-re-add
  cert insight applies to any provider, but the DNS steps are Porkbun-specific.
- Does not set up GitHub Actions deployments (uses legacy Pages from `main`).
- Does not handle apex domains pointing at GitHub Pages via A records — only
  subdomains via CNAME. Apex needs A records to 185.199.108-111.153, out of scope.
- Does not provision wildcard certs.
