# github-pages-porkbun-skill

Deploy a static site to GitHub Pages with a custom domain, where DNS is
managed by Porkbun — end to end, including the HTTPS certificate.

## Why this skill exists

The obvious steps (repo, CNAME, enable Pages, DNS record) all work fine. The
one step that silently fails is **HTTPS certificate provisioning**: GitHub
does not start ACME issuance until the custom domain is re-submitted while DNS
already resolves. If Pages was enabled before the DNS record existed, the
`https_certificate` stays `null` forever and no amount of waiting fixes it.

This skill bakes in the fix: clear and re-add the CNAME via the Pages API to
trigger verification. See `references/github-pages.md` and
`references/troubleshooting.md`.

## Install

### OpenCode (universal)
```bash
git clone <repo> ~/.config/opencode/skills/github-pages-porkbun-skill
```

### Universal (~/.agents)
```bash
git clone <repo> ~/.agents/skills/github-pages-porkbun-skill
```

### Claude Code
```bash
git clone <repo> ~/.claude/skills/github-pages-porkbun-skill
```

### GitHub Copilot CLI
```bash
git clone <repo> ~/.copilot/skills/github-pages-porkbun-skill
```

### Cursor (project only)
```bash
git clone <repo> .cursor/skills/github-pages-porkbun-skill
```

## Prerequisites

1. **Porkbun API key + secret** in `~/.secrets/porkbun.env` (dotenv format):
   ```
   PORKBUN_API_KEY=pk1_...
   PORKBUN_SECRET_KEY=sk1_...
   ```
   `chmod 600 ~/.secrets/porkbun.env`. Generate keys at
   https://porkbun.com/account/api. Validate with
   `python3 scripts/porkbun.py ping`.

2. **`gh` CLI** authenticated with `repo` scope (`gh auth login`).

3. **A built static site** — a directory containing `index.html`.

## Usage

Activate the skill in chat:
```
/github-pages-porkbun-skill deploy ./site to todo.javagrant.ac.nz
/github-pages-porkbun-skill my https cert is stuck at null
```

Or run scripts directly:

```bash
# End-to-end deploy
python3 scripts/deploy.py ./site JavaGT/todo.javagrant.ac.nz todo javagrant.ac.nz --user JavaGT

# Just the cert fix (the critical move)
python3 scripts/pages.py force-verify JavaGT/todo.javagrant.ac.nz todo.javagrant.ac.nz
python3 scripts/pages.py wait-cert JavaGT/todo.javagrant.ac.nz

# Porkbun DNS only
python3 scripts/porkbun.py create-cname javagrant.ac.nz todo javagrant.github.io
```

## Structure

```
github-pages-porkbun-skill/
├── SKILL.md                 # Full skill instructions + the critical insight
├── AGENTS.md                # Companion instruction file
├── scripts/
│   ├── porkbun.py           # Porkbun API wrapper
│   ├── pages.py             # GitHub Pages wrapper (includes force-verify)
│   └── deploy.py            # End-to-end orchestrator
└── references/
    ├── porkbun-dns.md       # Full Porkbun API + the secretapikey gotcha
    ├── github-pages.md      # Pages API + cert lifecycle + verification
    └── troubleshooting.md   # Decision tree for every common failure
```

## The one thing to remember

If `https_certificate` is `null` after DNS is correct, GitHub never started
ACME issuance. **Clear and re-add the CNAME** via the Pages API:

```bash
gh api repos/<USER>/<REPO>/pages -X PUT -f cname=""
sleep 5
gh api repos/<USER>/<REPO>/pages -X PUT -f cname="<subdomain>.<domain>"
```

Look for `null → authorization_created` within ~20 seconds. That transition is
the signal the fix worked. If it stays `null`, DNS is still wrong at the
authoritative nameserver — fix it and repeat.

## License

MIT
