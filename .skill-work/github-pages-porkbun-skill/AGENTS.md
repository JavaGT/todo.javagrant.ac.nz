# github-pages-porkbun-skill

## Purpose

Deploy a static site to GitHub Pages with a custom domain, where DNS is
managed by Porkbun — end to end, including the HTTPS certificate. Covers repo
setup, the `CNAME`/`.nojekyll` files, enabling Pages, creating the Porkbun
CNAME, and provisioning the Let's Encrypt cert.

## When to activate

- "deploy this static site to GitHub Pages"
- "set up a custom domain on my Pages site"
- "create a CNAME on Porkbun pointing at GitHub Pages"
- "my GitHub Pages HTTPS cert is stuck / gives an error"
- "https_certificate is null"
- "set up X subdomain like the working Y subdomain"

Do not activate for general DNS questions unrelated to GitHub Pages, or for
non-Porkbun providers.

## How to use

Open the full skill: `SKILL.md` in this directory. The critical operational
knowledge is in its "Critical insight" section — read it before debugging any
HTTPS issue.

Helper scripts live in `scripts/`:
- `porkbun.py` — Porkbun API wrapper
- `pages.py` — GitHub Pages API wrapper (includes the `force-verify` fix)
- `deploy.py` — end-to-end deploy

Deep-dive references in `references/`:
- `porkbun-dns.md` — full Porkbun API, the `secretapikey` field gotcha
- `github-pages.md` — Pages API + cert lifecycle + verification mechanism
- `troubleshooting.md` — decision tree for every common failure

## The one thing to remember

If `https_certificate` is `null` after DNS is correct, GitHub never started
ACME issuance. **Clear and re-add the CNAME** via the Pages API to trigger
verification. Do not just poll — a `null` cert never resolves on its own.

## Prerequisites

- Porkbun API key + secret in `~/.secrets/porkbun.env`
- `gh` CLI authenticated with `repo` scope
- A built static site on disk

## Credentials

This skill reads Porkbun credentials from `~/.secrets/porkbun.env` (dotenv
format), or from `PORKBUN_API_KEY`/`PORKBUN_SECRET_KEY` env vars if set:
```
PORKBUN_API_KEY=pk1_...
PORKBUN_SECRET_KEY=sk1_...
```
Never hardcode keys. The file should be `chmod 600`.

## License

MIT
