#!/usr/bin/env python3
"""Porkbun DNS API wrapper.

Reads credentials from ~/.secrets/porkbun.env (dotenv format):
    PORKBUN_API_KEY=pk1_...
    PORKBUN_SECRET_KEY=sk1_...

Subcommands:
    ping
    list-records <domain>
    get-record <domain> CNAME <subdomain>
    create-cname <domain> <subdomain> <target> [--ttl 600]
    delete-record <domain> <record-id>
"""
import argparse
import os
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

API = "https://api.porkbun.com/api/json/v3"
SECRETS = Path.home() / ".secrets" / "porkbun.env"


def load_creds() -> tuple:
    # Environment wins (lets harnesses inject without touching disk); fall
    # back to ~/.secrets/porkbun.env so a plain shell works too.
    key = os.environ.get("PORKBUN_API_KEY")
    secret = os.environ.get("PORKBUN_SECRET_KEY")
    if not key or not secret:
        if not SECRETS.exists():
            sys.exit(f"error: set PORKBUN_API_KEY/PORKBUN_SECRET_KEY env vars "
                     f"or create {SECRETS}")
        for line in SECRETS.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
        key = os.environ.get("PORKBUN_API_KEY")
        secret = os.environ.get("PORKBUN_SECRET_KEY")
    if not key or not secret:
        sys.exit(f"error: PORKBUN_API_KEY / PORKBUN_SECRET_KEY missing in {SECRETS}")
    return key.strip(), secret.strip()


def call(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API}/{path}", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


def main() -> int:
    ap = argparse.ArgumentParser(description="Porkbun DNS wrapper")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ping")

    p_list = sub.add_parser("list-records")
    p_list.add_argument("domain")

    p_get = sub.add_parser("get-record")
    p_get.add_argument("domain")
    p_get.add_argument("rtype")
    p_get.add_argument("name")

    p_cname = sub.add_parser("create-cname")
    p_cname.add_argument("domain")
    p_cname.add_argument("name")
    p_cname.add_argument("content")
    p_cname.add_argument("--ttl", type=int, default=600)

    p_del = sub.add_parser("delete-record")
    p_del.add_argument("domain")
    p_del.add_argument("record_id")

    args = ap.parse_args()
    key, secret = load_creds()

    if args.cmd == "ping":
        out = call("ping", {"apikey": key, "secretapikey": secret})
        print(json.dumps(out, indent=2))
        return 0 if out.get("status") == "SUCCESS" else 1

    if args.cmd == "list-records":
        out = call(f"dns/retrieve/{args.domain}",
                   {"apikey": key, "secretapikey": secret})
        for r in out.get("records", []):
            print(f"{r['type']}\t{r['name']}\t{r['content']}\tttl={r['ttl']}\tid={r['id']}")
        return 0

    if args.cmd == "get-record":
        out = call(f"dns/retrieveByNameType/{args.domain}/{args.rtype}/{args.name}",
                   {"apikey": key, "secretapikey": secret})
        print(json.dumps(out, indent=2))
        return 0

    if args.cmd == "create-cname":
        out = call(f"dns/create/{args.domain}", {
            "apikey": key, "secretapikey": secret,
            "name": args.name, "type": "CNAME",
            "content": args.content, "ttl": args.ttl,
        })
        print(json.dumps(out, indent=2))
        return 0 if out.get("status") == "SUCCESS" else 1

    if args.cmd == "delete-record":
        out = call(f"dns/delete/{args.domain}/{args.record_id}",
                   {"apikey": key, "secretapikey": secret})
        print(json.dumps(out, indent=2))
        return 0 if out.get("status") == "SUCCESS" else 1

    return 1


if __name__ == "__main__":
    sys.exit(main())
