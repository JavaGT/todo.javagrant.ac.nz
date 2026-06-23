#!/usr/bin/env python3
"""GitHub Pages API wrapper.

Requires `gh` CLI authenticated with `repo` scope.

Subcommands:
    status <user/repo>
    enable <user/repo>
    set-cname <user/repo> <cname>
    clear-cname <user/repo>
    force-verify <user/repo> <cname>   # the clear+re-add dance that fixes null certs
    cert <user/repo>                    # print cert state
    enforce-https <user/repo>          # only run after cert is 'approved'
    wait-cert <user/repo> [--timeout 180]
"""
import argparse
import json
import subprocess
import sys
import time
from typing import Optional, List


def gh(repo: str, method: str, path: str, fields: Optional[List[str]] = None) -> dict:
    # gh: -f key=value sends string fields; -F sends typed (bool/int). Prefix
    # a field with "raw:" to send it with -F instead of -f.
    cmd = ["gh", "api", f"repos/{repo}/{path}", f"-X{method}"]
    for f in fields or []:
        if f.startswith("raw:"):
            cmd += ["-F", f[len("raw:"):]]
        else:
            cmd += ["-f", f]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"gh api error ({r.returncode}): {r.stderr.strip()}")
    if not r.stdout.strip():
        return {}
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {"_raw": r.stdout}


def cert_state(repo: str) -> str:
    d = gh(repo, "GET", "pages")
    c = d.get("https_certificate")
    return c.get("state") if c else "None"


def main() -> int:
    ap = argparse.ArgumentParser(description="GitHub Pages wrapper")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("status"); p.add_argument("repo")
    p = sub.add_parser("enable"); p.add_argument("repo")
    p = sub.add_parser("set-cname"); p.add_argument("repo"); p.add_argument("cname")
    p = sub.add_parser("clear-cname"); p.add_argument("repo")
    p = sub.add_parser("force-verify"); p.add_argument("repo"); p.add_argument("cname")
    p = sub.add_parser("cert"); p.add_argument("repo")
    p = sub.add_parser("enforce-https"); p.add_argument("repo")
    p = sub.add_parser("wait-cert"); p.add_argument("repo"); p.add_argument("--timeout", type=int, default=180)

    args = ap.parse_args()

    if args.cmd == "status":
        print(json.dumps(gh(args.repo, "GET", "pages"), indent=2))
    elif args.cmd == "enable":
        out = gh(args.repo, "POST", "pages", [
            "build_type=legacy", "source[branch]=main", "source[path]=/"])
        print(json.dumps(out, indent=2))
    elif args.cmd == "set-cname":
        gh(args.repo, "PUT", "pages", [f"cname={args.cname}"])
        print(f"cname set to {args.cname}")
    elif args.cmd == "clear-cname":
        gh(args.repo, "PUT", "pages", ["cname="])
        print("cname cleared")
    elif args.cmd == "force-verify":
        # THE FIX: clear and re-add the custom domain to trigger ACME issuance.
        # See references/github-pages.md for why this works.
        print(f"clearing cname on {args.repo} ...")
        gh(args.repo, "PUT", "pages", ["cname="])
        print("waiting 5s ...")
        time.sleep(5)
        print(f"re-adding cname={args.cname} ...")
        gh(args.repo, "PUT", "pages", [f"cname={args.cname}"])
        print("waiting 20s for verification to start ...")
        time.sleep(20)
        state = cert_state(args.repo)
        print(f"cert state now: {state}")
        if state == "None":
            print("WARNING: cert still null. DNS is likely still wrong at the "
                  "authoritative nameserver. Check: "
                  "dig +short @maceio.porkbun.com <subdomain>.<domain> CNAME")
            return 1
        print("SUCCESS: issuance started. Run `pages.py wait-cert <repo>` to "
              "poll for 'approved'.")
    elif args.cmd == "cert":
        print(cert_state(args.repo))
    elif args.cmd == "enforce-https":
        state = cert_state(args.repo)
        if state != "approved":
            sys.exit(f"refusing to enforce https: cert state is '{state}', "
                     "must be 'approved' first.")
        gh(args.repo, "PUT", "pages", ["raw:https_enforced=true"])
        print("https_enforced=true")
    elif args.cmd == "wait-cert":
        deadline = time.time() + args.timeout
        last = None
        while time.time() < deadline:
            s = cert_state(args.repo)
            if s != last:
                print(f"cert: {s}")
                last = s
            if s == "approved":
                print("DONE: cert approved")
                return 0
            time.sleep(10)
        print(f"timeout: cert is still '{last}' after {args.timeout}s")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
