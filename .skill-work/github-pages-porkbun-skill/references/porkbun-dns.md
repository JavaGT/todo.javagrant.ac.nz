# Porkbun DNS — full API reference for this skill

Porkbun API base: `https://api.porkbun.com/api/json/v3`

All endpoints are `POST` with a JSON body. The body always includes the
credentials and endpoint-specific fields.

## Authentication

Credentials live in `~/.secrets/porkbun.env` (dotenv format), or in
`PORKBUN_API_KEY`/`PORKBUN_SECRET_KEY` env vars:
```
PORKBUN_API_KEY=pk1_...
PORKBUN_SECRET_KEY=sk1_...
```

### ⚠️ Field name gotcha (critical)

The secret is sent as **`secretapikey`** in the JSON body — NOT `secret`,
NOT `secretkey`. The key is `apikey`.

```json
{ "apikey": "pk1_...", "secretapikey": "sk1_...", ... }
```

If you send `secret` or `secretkey`, Porkbun returns
`MISSING_SECRETAPIKEY`. This is the single most common integration bug.

### Validating keys

```bash
curl -s -X POST https://api.porkbun.com/api/json/v3/ping \
  -H 'Content-Type: application/json' \
  -d '{"secretapikey":"<SECRET>","apikey":"<KEY>"}'
```

- `"status":"SUCCESS"` + `"credentialsValid":true` → keys are good.
- `"INVALID_API_KEYS_001"` → keys are wrong/revoked. User must regenerate at
  https://porkbun.com/account/api and update `~/.secrets/porkbun.env`.
- `"MISSING_SECRETAPIKEY"` → you used the wrong field name. Fix your code.

## Endpoints used

### Ping (validate keys)
`POST /ping` — body: `{apikey, secretapikey}`

### List all records for a domain
`POST /dns/retrieve/<domain>` — body: `{apikey, secretapikey}`

Returns `{ "records": [ {id, name, type, content, ttl, prio, notes}, ... ] }`.

### Retrieve records by name+type
`POST /dns/retrieveByNameType/<domain>/<type>/<name>`
- `<domain>` = apex, e.g. `javagrant.ac.nz`
- `<type>` = `CNAME`, `A`, `TXT`, etc.
- `<name>` = subdomain label, e.g. `todo` (NOT the full hostname)

Returns `{ "records": [...] }`. Empty array if none exists. The response also
includes `"cloudflare":"enabled"` if the Porkbun zone uses the Cloudflare
proxy.

### Create a record
`POST /dns/create/<domain>` — body: `{apikey, secretapikey, name, type, content, ttl}`

⚠️ The endpoint is `/dns/create/<domain>` — **NOT** `/dns/create/<domain>/CNAME`.
Adding the type to the path returns `INVALID_TYPE`. The type goes in the JSON
body as `"type":"CNAME"`.

For a CNAME pointing at GitHub Pages:
```json
{
  "apikey": "pk1_...",
  "secretapikey": "sk1_...",
  "name": "todo",
  "type": "CNAME",
  "content": "javagrant.github.io",
  "ttl": 600
}
```
Returns `{ "status":"SUCCESS", "id": <numeric> }`.

Notes:
- `name` is the bare subdomain label (`todo`), not the FQDN. Porkbun appends
  the apex automatically.
- `content` for a CNAME is the target hostname. A trailing dot is tolerated
  but not required.
- `ttl` minimum is 600. Use 600 during setup for fast propagation; raise later
  if desired.
- To enable the Cloudflare proxy (the "orange cloud"), you must do it in the
  Porkbun web UI or pass the (undocumented) `porkbun_proxy` flag. This skill
  does not require proxying — a DNS-only CNAME works perfectly with GitHub
  Pages cert provisioning. If the zone already has proxying enabled zone-wide,
  leave it; it does not block issuance (the `tools` subdomain proves this).

### Delete a record
`POST /dns/delete/<domain>/<id>` — body: `{apikey, secretapikey}`

Use the `id` from `retrieveByNameType`. Needed if you create a wrong record
and want to replace it cleanly.

## Verifying DNS resolution

Always check at the **authoritative** nameserver, not your local resolver
(which may be cached or intercepted):

```bash
dig +short @maceio.porkbun.com <subdomain>.<domain> CNAME
```

Porkbun authoritative nameservers: `maceio.porkbun.com`, `salvador.porkbun.com`,
`fortaleza.porkbun.com`, `curitiba.porkbun.com`.

For end-to-end verification bypassing local DNS cache, use DoH:
```bash
curl -sI --doh-url https://1.1.1.1/dns-query https://<subdomain>.<domain>/
```

## Common record patterns for GitHub Pages

| Hostname type | Record type | Name | Content |
|---|---|---|---|
| Subdomain (`todo.example.com`) | CNAME | `todo` | `<user>.github.io` |
| Apex (`example.com`) | A | `@` | `185.199.108.153` (×4, .108–.111) |

This skill handles **subdomains via CNAME only**. Apex domains via A records
are out of scope (note the anti-goal in SKILL.md).

## Wildcard records

Zones often have a `*.<domain>` wildcard record (e.g. pointing at a home
server). This does **not** interfere with an explicit CNAME at the
authoritative level — explicit records always win over the wildcard. If `dig
@authoritative explicit-subdomain` returns the correct CNAME, the wildcard is
irrelevant to cert provisioning. Do not delete or modify the wildcard to fix
a GitHub Pages cert issue; the real fix is in `github-pages.md`.
