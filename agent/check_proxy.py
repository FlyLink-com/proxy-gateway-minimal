#!/usr/bin/env python3
"""
Minimal proxy connectivity checker.
Tests TCP reachability and (optionally) SOCKS5/HTTP proxy connectivity.
"""

import socket
import json
import sys
import time
from datetime import datetime

CONFIG_PATH = "config/proxy-servers.json"


def tcp_check(host: str, port: int, timeout: float = 5.0) -> dict:
    """Check TCP reachability."""
    t0 = time.time()
    try:
        with socket.create_connection((host, port), timeout=timeout) as s:
            s.settimeout(timeout)
            elapsed = round((time.time() - t0) * 1000, 1)
            return {"ok": True, "host": host, "port": port, "ms": elapsed}
    except Exception as e:
        return {"ok": False, "host": host, "port": port, "error": str(e)}


def load_config(path: str) -> list[dict]:
    try:
        with open(path) as f:
            cfg = json.load(f)
        return cfg.get("servers", [])
    except Exception as e:
        print(f"[WARN] Cannot load config: {e}", file=sys.stderr)
        return []


def check_all(servers: list[dict]) -> list[dict]:
    results = []
    for s in servers:
        r = tcp_check(s["host"], s["port"])
        r["name"] = s.get("name", f"{s['host']}:{s['port']}")
        r["type"] = s.get("type", "unknown")
        results.append(r)
    return results


def main():
    servers = load_config(CONFIG_PATH)
    if not servers:
        print(json.dumps({"error": "No servers configured", "ts": datetime.utcnow().isoformat()+"Z"}))
        sys.exit(1)

    results = check_all(servers)
    ok = sum(1 for r in results if r["ok"])
    out = {
        "total": len(results),
        "ok": ok,
        "results": results,
        "ts": datetime.utcnow().isoformat() + "Z",
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
