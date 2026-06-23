# GitHub Pages — API, cert lifecycle, and the verification mechanism

## Enable Pages (legacy, root of main)

```bash
gh api repos/<USER>/<REPO>/pages -X POST \
  -f build_type=legacy -f source[branch]=main -f source[path]=/
```

- `build_type=legacy` serves files from the repo directly (no Actions build).
  Use this for hand-built static sites. Use `workflow` only if you have a
  GitHub Actions build pipeline (out of scope for this skill).
- `source[branch]=main`, `source[path]=/` mirrors the proven
  `tools.javagrant.ac.nz` setup.
- The `CNAME` file in the repo root sets the custom domain on the next build;
  you do not strictly need to set it via the API, but doing so is harmless and
  can speed things up.

## Get Pages config + cert state

```bash
gh api repos/<USER>/<REPO>/pages
```

Key fields:
- `status` — `building` | `built` (site content build status; **unrelated to cert**)
- `cname` — the custom domain, e.g. `todo.javagrant.ac.nz`
- `https_enforced` — boolean; only meaningful once a cert exists
- `https_certificate` — object whose `state` field tracks issuance:
  - `None`/null — **issuance has not started**. This is the failure state.
    See "The verification mechanism" below. Not a transient state to poll.
  - `authorization_created` — ACME flow started. The fix worked.
  - `authorization_pending` — challenge in progress.
  - `authorized` — domain verified.
  - `issued` — cert issued.
  - `approved` — cert live. Done.
- `pending_domain_unverified_at` — if set, GitHub is waiting on verification.
- `protected_domain_state` — domain verification state (mostly for verified
  org domains; usually null for personal repos).

## Trigger a rebuild (content only)

```bash
gh api repos/<USER>/<REPO>/pages/builds -X POST
```

⚠️ This rebuilds the **site content**. It has **nothing to do with the TLS
cert**. A `built` site with `https_certificate: null` is the canonical failure
state this skill fixes. Do not attempt to fix a `null` cert by triggering
builds — they don't help.

## The verification mechanism (why certs get stuck)

GitHub provisions a Let's Encrypt cert via the **ACME HTTP-01 challenge**:
GitHub places a token at
`http://<custom-domain>/.well-known/acme-challenge/<token>` and Let's Encrypt
fetches it. For this to work, at the moment GitHub attempts verification, the
custom domain must resolve to GitHub Pages and serve that challenge.

**The trap:** GitHub only attempts verification when the custom domain is
submitted (via API or UI) **while DNS is already correct**. If you enable
Pages or commit the `CNAME` file *before* the DNS record exists, verification
silently fails on the first attempt — and GitHub **does not retry on its
own**. The cert state stays `null` indefinitely.

This is why "just wait longer" never works: there is no pending process to
complete. You must re-trigger verification.

### The fix: clear and re-add the CNAME

```bash
# 0. Confirm DNS is correct first (otherwise the re-add fails the same way)
dig +short @maceio.porkbun.com <subdomain>.<domain> CNAME
# must return <user>.github.io.

# 1. Clear the custom domain
gh api repos/<USER>/<REPO>/pages -X PUT -f cname=""

# 2. Wait briefly so GitHub processes the clear
sleep 5

# 3. Re-add the custom domain — this triggers fresh verification + ACME issuance
gh api repos/<USER>/<REPO>/pages -X PUT -f cname="<subdomain>.<domain>"

# 4. Confirm issuance started (expect non-null within ~20s)
gh api repos/<USER>/<REPO>/pages | python3 -c \
  "import sys,json; d=json.load(sys.stdin); c=d.get('https_certificate'); print(c.get('state') if c else 'None')"
```

The transition `null` → `authorization_created` within ~20 seconds confirms
the fix took. If it stays `null`, DNS is still wrong at the authoritative
nameserver — go back to step 0.

## Enable HTTPS enforcement

Only after `https_certificate.state == "approved"`:

```bash
gh api repos/<USER>/<REPO>/pages -X PUT -F https_enforced=true
```

Setting `https_enforced=true` before the cert exists does nothing useful and
can occasionally interfere with the re-add dance. Set it last.

## Mirror an existing working subdomain

To copy a known-good setup (e.g. "set up X like tools.javagrant.ac.nz"):

1. Inspect the reference record:
   ```bash
   # via Porkbun API:
   POST /dns/retrieveByNameType/<domain>/CNAME/<reference-subdomain>
   ```
2. Create the new record with identical `type`, `content`, and `ttl`.
3. Enable Pages with the same `build_type`/`source` as the reference repo.
4. Run the clear-and-re-add CNAME dance to provision the cert.

The DNS records for `tools` and `todo` (CNAME → `<user>.github.io`, TTL 600)
are byte-identical; the only difference is cert issuance state, which the
dance resolves.

## Set CNAME via API (alternative to the repo file)

```bash
gh api repos/<USER>/<REPO>/pages -X PUT -f cname="<subdomain>.<domain>"
```

Setting it via the API writes/updates the `CNAME` file in the repo on the next
build. Keeping the `CNAME` file in the repo is the canonical approach; setting
via API is useful for the clear-and-re-add dance.

## Verify end-to-end

```bash
curl -sI --doh-url https://1.1.1.1/dns-query https://<subdomain>.<domain>/ | head -5
```

Expected on success:
- `HTTP/2 200`
- (with `-v`) `subject: CN=<subdomain>.<domain>`
- `issuer: C=US; O=Let's Encrypt`

If `subject: CN=*.github.io`, the specific edge node hasn't loaded the new
cert yet — wait 1–5 minutes and retry. This is normal edge propagation, not a
failure. Confirm the cert state is `approved` via the API in the meantime.

Always use `--doh-url https://1.1.1.1/dns-query` for verification so local
resolver cache or ISP interception does not produce false negatives (curl may
otherwise connect to a stale or intercepted IP like a home-server wildcard).
