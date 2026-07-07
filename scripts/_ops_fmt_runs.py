#!/usr/bin/env python3
"""Formatea las últimas corridas (agent_runs.jsonl) para sol_ops.sh estado."""
import sys, json

for ln in sys.stdin:
    ln = ln.strip()
    if not ln:
        continue
    try:
        d = json.loads(ln)
    except Exception:
        continue
    rc = d.get("rc")
    ok = "✅" if rc == 0 else "❌"
    ts = str(d.get("ts", ""))[:16].replace("T", " ")
    nombre = d.get("agente") or d.get("nombre") or "?"
    print(f"   {ok} {ts}  {nombre}  rc={rc}")
