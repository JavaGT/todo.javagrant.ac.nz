# Troubleshooting — decision tree

Work top to bottom. Each branch ends with the action that fixes it.

## Start here: classify the failure

```
What does the user report?
├── "Deploy from scratch" → see A
├── "Site works over HTTP but HTTPS fails" → see B
├── "https_certificate is null / stuck" → see C   ← most common, most mishandled
├── "DNS record creation fails" → see D
├── "Porkbun API rejects my keys" → see E
└── "curl connects to a weird IP (not GitHub)" → see F
```

---

## A. Deploy from scratch

1. Build the site (if framework). Confirm `index.html` exists on disk.
2. Create repo with site + `CNAME` file (custom domain) + `.nojekyll`.
3. `gh repo create --public --source=. --push`.
4. Enable Pages: `gh api repos/<U>/<R>/pages -X POST -f build_type=legacy -f source[branch]=main -f source[path]=/`.
5. Create Porkbun CNAME (see `porkbun-dns.md`).
6. Verify DNS at authoritative NS: `dig +short @maceio.porkbun.com <sub>.<domain> CNAME` → must be `<user>.github.io.`
7. Run the clear-and-re-add CNAME dance (see `github-pages.md`) to provision cert.
8. Poll for `approved`, then enable HTTPS enforcement.
9. Verify with `curl --doh-url https://1.1.1.1/dns-query https://<sub>.<domain>/`.

---

## B. Site works over HTTP, HTTPS fails

Get the cert state:
```bash
gh api repos/<USER>/<REPO>/pages | python3 -c \
  "import sys,json; d=json.load(sys.stdin); c=d.get('https_certificate'); print('cert:', (c.get('state') if c else None), '| enforced:', d.get('https_enforced'))"
```

- `cert: None` → **go to C.** (This is the 90% case.)
- `cert: approved` but HTTPS still fails → edge propagation; wait 5 min, retry with `--doh-url`. If still failing, run the clear-and-re-add dance once.
- `cert: <other state>` (authorization_pending, etc.) → wait 60–120s. If it doesn't advance to `approved`, go to C.

---

## C. `https_certificate` is `null` / stuck   ← the main one

**This means GitHub never started ACME issuance.** Polling is pointless; a
`null` cert never self-resolves. Do this:

1. Confirm DNS is correct **at the authoritative nameserver** (not local):
   ```bash
   dig +short @maceio.porkbun.com <subdomain>.<domain> CNAME
   ```
   Must return `<user>.github.io.`. If empty or wrong → fix DNS first (D).
2. Clear + re-add the CNAME (the dance):
   ```bash
   gh api repos/<USER>/<REPO>/pages -X PUT -f cname=""
   sleep 5
   gh api repos/<USER>/<REPO>/pages -X PUT -f cname="<subdomain>.<domain>"
   ```
3. Within ~20s, `https_certificate.state` should become `authorization_created`.
   - If yes → poll to `approved`, then enforce HTTPS. Done.
   - If still `null` → DNS is still wrong at the authoritative NS (step 1 lied
     to you because of caching, or the record content is wrong). Re-verify,
     fix, and repeat the dance.

### Things that do NOT fix a null cert (do not waste time on these)

- ❌ Polling `https_certificate` repeatedly waiting for it to change. It won't.
- ❌ `POST /pages/builds` (content rebuilds don't trigger issuance).
- ❌ Setting `https_enforced=true` (needs a cert to exist first; does nothing here).
- ❌ Toggling the Cloudflare proxy on the DNS record.
- ❌ Deleting the `*.<domain>` wildcard record (explicit CNAME beats wildcard
  at the authoritative level — see `porkbun-dns.md`).
- ❌ Removing and re-adding the DNS record at Porkbun (DNS was already fine;
  the problem is GitHub's verification, not DNS propagation).
- ❌ Waiting "longer" — GitHub does not retry verification on a schedule.

---

## D. DNS record creation fails

| Error | Cause | Fix |
|---|---|---|
| `INVALID_TYPE` | Used `/dns/create/<domain>/CNAME` (type in path) | Use `/dns/create/<domain>` with `"type":"CNAME"` in body |
| `MISSING_SECRETAPIKEY` | Sent `secret` or `secretkey` | Use `secretapikey` (see `porkbun-dns.md`) |
| `INVALID_API_KEYS_001` | Keys wrong/revoked | Go to E |
| `INVALID_DOMAIN` | Domain not in your Porkbun account | Check the apex domain spelling; add the domain to Porkbun first |
| Duplicate record | A record for that name+type exists | Delete it first (`/dns/delete/<domain>/<id>`) then create |

---

## E. Porkbun API rejects keys (`INVALID_API_KEYS_001`)

1. Confirm you're sending `apikey` + `secretapikey` (note the field name).
2. `POST /ping` — if it returns `INVALID_API_KEYS_001`, the keys are genuinely
   wrong or revoked.
3. Tell the user to regenerate at https://porkbun.com/account/api and update
   `~/.secrets/porkbun.env`. Keys look like `pk1_...` (68 chars) and
   `sk1_...` (68 chars).
4. Re-run `/ping`. Only proceed with DNS once it returns `SUCCESS`.

Keys can be revoked if regenerated elsewhere — an old `~/.secrets/porkbun.env`
is a common culprit when "it worked before."

---

## F. curl connects to a weird IP (home server, ISP proxy, etc.)

Symptom: `curl https://<sub>.<domain>/` connects to a non-GitHub IP and TLS
fails with `tlsv1 unrecognized name` or a wildcard cert.

Cause: local resolver returning a stale cache or a `*.<domain>` wildcard IP
(e.g. a home server). Not a real failure of the deploy.

Fix: bypass local DNS with DoH:
```bash
curl -sI --doh-url https://1.1.1.1/dns-query https://<sub>.<domain>/
```
Also verify the authoritative NS directly:
```bash
dig +short @maceio.porkbun.com <sub>.<domain> CNAME
dig +short @1.1.1.1 <sub>.<domain> A
```
If the authoritative answer is correct, the local weirdness is cosmetic —
the cert is fine and other resolvers will pick it up on TTL expiry.

---

## Quick health-check one-liner

```bash
echo "DNS:"; dig +short @maceio.porkbun.com <sub>.<domain> CNAME
echo "Pages:"; gh api repos/<USER>/<REPO>/pages | python3 -c \
  "import sys,json; d=json.load(sys.stdin); c=d.get('https_certificate'); \
   print('status=',d.get('status'),'cname=',d.get('cname'),\
   'cert=',(c.get('state') if c else None),'enforced=',d.get('https_enforced'))"
echo "HTTPS:"; curl -sI --doh-url https://1.1.1.1/dns-query https://<sub>.<domain>/ | head -1
```

Read the `cert=` field: `None` → go to C. `approved` → check edge propagation.
