#!/usr/bin/env python3
"""Manage daily pickup payment records for Tars's HERO route.
Usage:
  python3 payments.py add payment 49 ["Ampang - customer A"]
  python3 payments.py add received 15 ["Scrap sale"]
  python3 payments.py add advance 500 ["Boss advance"]
  python3 payments.py report [2026-06-26]
  python3 payments.py list [2026-06-26]
"""

import json, sys, os, subprocess, re
from datetime import date
from pathlib import Path

DATA_DIR = Path("/root/my-app/pickup-payments")
TODAY = date.today().isoformat()

def _path(d: str) -> Path:
    return DATA_DIR / f"{d}.json"

def _load(d: str) -> list:
    p = _path(d)
    if p.exists():
        return json.loads(p.read_text())
    return []

def _migrate_today_json():
    """If a stray today.json exists, merge it into today's dated file and delete it."""
    stray = DATA_DIR / "today.json"
    if not stray.exists():
        return
    stray_entries = json.loads(stray.read_text())
    if not stray_entries:
        stray.unlink()
        return
    entries = _load(TODAY)
    # Append with fresh seq numbers
    start_seq = len(entries) + 1
    for i, e in enumerate(stray_entries):
        e["seq"] = start_seq + i
    entries.extend(stray_entries)
    _save(TODAY, entries)
    stray.unlink()
    print(f"⚠️  Migrated {len(stray_entries)} entries from today.json → {TODAY}.json")

def _save(d: str, entries: list):
    _path(d).write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n")

def cmd_add(day: str, entry_type: str, amount: int, note: str = ""):
    entries = _load(day)
    # — Duplicate guard: same note + same amount, OR same order ID in note
    order_id = None
    match = re.search(r'(?:Order\s+)?(\d{5,})', note)
    if match:
        order_id = match.group(1)
    for e in entries:
        # Exact match: type + amount + note all identical
        if e["type"] == entry_type and e["amount"] == amount and e["note"] == note:
            print(f"⚠️  Duplicate detected: {entry_type} RM{amount} with note '{note}' already logged (seq {e['seq']})")
            print(f"   Skipped — no new entry added.")
            return
        # Order-ID match: same order number appears in a different note format
        e_order_id = None
        e_match = re.search(r'(?:Order\s+)?(\d{5,})', e.get("note", ""))
        if e_match:
            e_order_id = e_match.group(1)
        if order_id and e_order_id and order_id == e_order_id and e["type"] == entry_type:
            print(f"⚠️  Duplicate order detected: Order {order_id} already logged (seq {e['seq']}, note: '{e['note']}')")
            print(f"   Skipped — no new entry added.")
            return
    entries.append({
        "type": entry_type,   # "payment", "received", "advance"
        "amount": amount,
        "note": note,
        "seq": len(entries) + 1
    })
    _save(day, entries)
    total = _calc_total(entries)
    print(f"✅ Recorded {entry_type} RM{amount}")
    print(f"   Running total: RM{total}")

def _calc_total(entries: list) -> int:
    """Total = sum(payments) - sum(received) - sum(advances)"""
    payments = sum(e["amount"] for e in entries if e["type"] == "payment")
    received = sum(e["amount"] for e in entries if e["type"] == "received")
    advances = sum(e["amount"] for e in entries if e["type"] == "advance")
    return payments - received - advances

def cmd_report(day: str):
    entries = _load(day)
    if not entries:
        print(f"No entries for {day}")
        return

    total = _calc_total(entries)
    # All non-advance entries are "jobs" — received show as RM0
    job_entries = [e for e in entries if e["type"] in ("payment", "received")]
    print(f"🚛 Pickup Report – {day}")
    print(f"Jobs done: {len(job_entries)}")
    print()
    for i, e in enumerate(job_entries, 1):
        note = f" — {e['note']}" if e["note"] else ""
        if e["type"] == "received":
            amount = 0
            note += f" (received RM{e['amount']})"
        else:
            amount = e["amount"]
        print(f"{i}. RM{amount}{note}")
    print()
    adv_entries = [e for e in entries if e["type"] == "advance"]
    if adv_entries:
        for e in adv_entries:
            print(f"Advance: RM{e['amount']}")
    print(f"Total: RM{total} ✅")

def cmd_list(day: str):
    entries = _load(day)
    if not entries:
        print(f"No entries for {day}")
        return
    print(f"📋 Payments for {day}:")
    for e in entries:
        tag = {"payment": "💸", "received": "💰", "advance": "📤"}.get(e["type"], "❓")
        note = f" — {e['note']}" if e["note"] else ""
        print(f"  {e['seq']}. {tag} {e['type']:>8}  RM{e['amount']}{note}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    action = sys.argv[1]
    day = sys.argv[2] if len(sys.argv) > 2 and "--" not in sys.argv[2] else TODAY

    if action == "add":
        _migrate_today_json()
        if len(sys.argv) < 4:
            print("Usage: payments.py add <type> <amount> [note]")
            sys.exit(1)
        # Check if day was provided as 2nd arg or if we need to shift
        # arg2 could be the day OR the type
        entry_type = sys.argv[2]
        if entry_type in ("payment", "received", "advance"):
            day = TODAY
            amount_idx = 3
        else:
            day = entry_type
            entry_type = sys.argv[3]
            amount_idx = 4
        amount = int(sys.argv[amount_idx].replace(",", "").replace("RM", ""))
        note = " ".join(sys.argv[amount_idx+1:]) if len(sys.argv) > amount_idx+1 else ""
        # If note is just an order number, auto-append city from DB
        if note.isdigit():
            city = subprocess.run(
                ["sqlite3", str(DATA_DIR.parent / "db" / "custom.db"),
                 f'SELECT city FROM "Order" WHERE orderId=\'{note}\''],
                capture_output=True, text=True
            ).stdout.strip()
            if city:
                note = f"{note} {city}"
        cmd_add(day, entry_type, amount, note)
    elif action == "report":
        _migrate_today_json()
        cmd_report(day)
    elif action == "list":
        _migrate_today_json()
        cmd_list(day)
    else:
        print(f"Unknown action: {action}")
        print(__doc__)
