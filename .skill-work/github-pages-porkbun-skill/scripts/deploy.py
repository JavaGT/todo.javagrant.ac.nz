#!/usr/bin/env python3
"""End-to-end deploy: repo + CNAME file + .nojekyll + Pages + Porkbun DNS + cert.

Usage:
    deploy.py <site_dir> <repo> <subdomain> <domain> [--user <gh-user>]

Example:
    deploy.py ./site JavaGT/todo.javagrant.ac.nz todo javagrant.ac.nz --user JavaGT

Assumptions:
    - <site_dir> contains index.html (already built; no framework build here).
    - gh CLI is authenticated with repo scope.
    - ~/.secrets/porkbun.env has valid PORKBUN_API_KEY / PORKBUN_SECRET_KEY.
    - GitHub user's Pages host is <user>.github.io (the CNAME target).
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def sh(cmd: list, **kw) -> subprocess.CompletedProcess:
    print("$", " ".join(cmd))
    return subprocess.run(cmd, check=True, **kw)


def main() -> int:
    ap = argparse.ArgumentParser(description="End-to-end GitHub Pages + Porkbun deploy")
    ap.add_argument("site_dir")
    ap.add_argument("repo")            # e.g. JavaGT/todo.javagrant.ac.nz
    ap.add_argument("subdomain")       # e.g. todo
    ap.add_argument("domain")          # e.g. javagrant.ac.nz
    ap.add_argument("--user", required=True)  # GitHub user (for <user>.github.io target)
    ap.add_argument("--no-push", action="store_true", help="prepare repo locally only")
    args = ap.parse_args()

    site = Path(args.site_dir).resolve()
    if not (site / "index.html").exists():
        sys.exit(f"error: {site}/index.html not found. Build the site first.")
    target = f"{args.user}.github.io"
    fqdn = f"{args.subdomain}.{args.domain}"

    # 1. Repo files
    print(f"\n[1/6] Preparing repo in {site}")
    (site / "CNAME").write_text(fqdn + "\n")
    (site / ".nojekyll").write_text("")
    sh(["git", "init"], cwd=site) if not (site / ".git").exists() else None
    sh(["git", "add", "-A"], cwd=site)
    sh(["git", "commit", "-m", "feat: deploy site"], cwd=site)

    if args.no_push:
        print("--no-push set; skipping remote. Run remaining steps manually.")
        return 0

    # 2. GitHub repo
    print(f"\n[2/6] Creating GitHub repo {args.repo}")
    try:
        sh(["gh", "repo", "create", args.repo, "--public", "--source=.", "--push"],
           cwd=site)
    except subprocess.CalledProcessError:
        print("repo may already exist; pushing to existing remote.")
        sh(["git", "push", "-u", "origin", "main"], cwd=site)

    # 3. Enable Pages
    print(f"\n[3/6] Enabling GitHub Pages (legacy, main/root)")
    sh(["python3", str(HERE / "pages.py"), "enable", args.repo])

    # 4. Porkbun CNAME
    print(f"\n[4/6] Creating Porkbun CNAME {fqdn} -> {target}")
    sh(["python3", str(HERE / "porkbun.py"), "create-cname",
        args.domain, args.subdomain, target])

    # 5. Force-verify (the critical cert fix) + wait for approved
    print(f"\n[5/6] Triggering cert issuance via clear+re-add CNAME")
    rc = sh(["python3", str(HERE / "pages.py"), "force-verify", args.repo, fqdn],
            ).returncode
    sh(["python3", str(HERE / "pages.py"), "wait-cert", args.repo, "--timeout", "180"])

    # 6. Enforce HTTPS
    print(f"\n[6/6] Enabling HTTPS enforcement")
    sh(["python3", str(HERE / "pages.py"), "enforce-https", args.repo])

    print(f"\n✓ Deployed to https://{fqdn}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
