#!/usr/bin/env python3
"""Bills tracker for Naz's monthly expenses.

Usage:
  python3 bills.py status          — Show all bills and payment status
  python3 bills.py pay <id>        — Mark a bill as paid for this month
  python3 bills.py unpaid          — Show only unpaid bills for this month
  python3 bills.py total           — Show total fixed expenses for the month
  python3 bills.py remind          — Check if 15th or 25th, send reminder
"""

import json, sys, os
from datetime import date, datetime
from pathlib import Path

DATA_DIR = Path("/root/my-app/expenses")
BILLS_FILE = DATA_DIR / "bills-tracker.json"
HISTORY_FILE = DATA_DIR / "payment-history.json"

CURRENT_MONTH = date.today().strftime("%Y-%m")

def load():
    with open(BILLS_FILE) as f:
        return json.load(f)

def save(data):
    with open(BILLS_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

def load_history():
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return {}

def save_history(history):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
        f.write("\n")

def get_paid_ids(history):
    return history.get(CURRENT_MONTH, {}).get("paid", [])

def cmd_status():
    data = load()
    history = load_history()
    paid_ids = get_paid_ids(history)
    
    print(f"📋 Bills Tracker — {CURRENT_MONTH}")
    print("=" * 50)
    
    total_fixed = 0
    total_unknown = 0
    unpaid_count = 0
    
    for bill in data["bills"]:
        paid = bill["id"] in paid_ids
        status = "✅ PAID" if paid else "⏳ UNPAID"
        amount = bill["amount"]
        
        if amount is None:
            amt_str = "?? (check app)"
            total_unknown += 1
        else:
            amt_str = f"RM{amount:.2f}"
            if not paid:
                total_fixed += amount
        
        print(f"  {status}  {bill['name']:<30} {amt_str:>15}")
        if not paid:
            unpaid_count += 1
    
    print("=" * 50)
    print(f"  Unpaid fixed total: RM{total_fixed:.2f}")
    if total_unknown:
        print(f"  Variable bills: {total_unknown} (check TNB/BSP21 apps)")
    print(f"  Bills unpaid: {unpaid_count}/{len(data['bills'])}")

def cmd_pay(bill_id):
    data = load()
    history = load_history()
    
    # Find the bill
    bill = next((b for b in data["bills"] if b["id"] == bill_id), None)
    if not bill:
        print(f"❌ Bill '{bill_id}' not found. Options: {', '.join(b['id'] for b in data['bills'])}")
        return
    
    if CURRENT_MONTH not in history:
        history[CURRENT_MONTH] = {"paid": []}
    
    if bill_id in history[CURRENT_MONTH]["paid"]:
        print(f"ℹ️  {bill['name']} already marked as paid for {CURRENT_MONTH}")
        return
    
    history[CURRENT_MONTH]["paid"].append(bill_id)
    save_history(history)
    
    amount_str = f"RM{bill['amount']:.2f}" if bill['amount'] else "??"
    print(f"✅ Marked {bill['name']} ({amount_str}) as PAID for {CURRENT_MONTH}")

def cmd_unpaid():
    data = load()
    history = load_history()
    paid_ids = get_paid_ids(history)
    
    unpaid = [b for b in data["bills"] if b["id"] not in paid_ids]
    
    if not unpaid:
        print(f"🎉 All bills paid for {CURRENT_MONTH}! Great job, Naz!")
        return
    
    print(f"⏳ Unpaid Bills — {CURRENT_MONTH}")
    print("=" * 40)
    total = 0
    for bill in unpaid:
        if bill["amount"]:
            total += bill["amount"]
            print(f"  {bill['name']:<30} RM{bill['amount']:>8.2f}")
        else:
            print(f"  {bill['name']:<30} {'?? (check app)':>12}")
    print("=" * 40)
    print(f"  Total due: RM{total:.2f}")

def cmd_total():
    data = load()
    total = sum(b["amount"] for b in data["bills"] if b["amount"] is not None)
    unknown = [b["name"] for b in data["bills"] if b["amount"] is None]
    
    print(f"💰 Monthly Fixed Expenses: RM{total:.2f}")
    if unknown:
        print(f"  + variable: {', '.join(unknown)}")
    print(f"  Grand total (est.): RM{total + 200:.2f}+")

def cmd_set_amount(bill_id, amount):
    """Update a tracked bill's amount (e.g. from an OCR'd receipt)."""
    data = load()
    bill = next((b for b in data["bills"] if b["id"] == bill_id), None)
    if not bill:
        print(f"❌ Bill '{bill_id}' not found. Options: {', '.join(b['id'] for b in data['bills'])}")
        return
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        print(f"❌ Invalid amount: {amount!r}")
        return
    if amount < 0:
        print("❌ Amount cannot be negative.")
        return
    bill["amount"] = amount
    save(data)
    print(f"✅ Updated {bill['name']} to RM{amount:.2f}")

def cmd_remind():
    """Check if today is 15th or 25th and generate reminder."""
    today = date.today()
    day = today.day
    month = today.strftime("%B %Y")
    
    data = load()
    history = load_history()
    paid_ids = get_paid_ids(history)
    
    unpaid = [b for b in data["bills"] if b["id"] not in paid_ids]
    
    if not unpaid:
        return f"✅ All bills paid for {month}! No reminder needed."
    
    if day == 15:
        msg = f"🔔 **Bill Reminder — {month}**\n\nNaz, it's the 15th! Here are your unpaid bills:\n\n"
        for bill in unpaid:
            amt = f"RM{bill['amount']:.2f}" if bill['amount'] else "??"
            msg += f"  • {bill['name']}: {amt}\n"
        msg += f"\n{len(unpaid)} bills unpaid. Please pay by the 25th if you haven't yet."
        return msg
    
    elif day == 25:
        still_unpaid = unpaid
        if not still_unpaid:
            return f"✅ All bills paid for {month}! No reminder needed."
        
        msg = f"⚠️ **URGENT: Bill Reminder — {month}**\n\nNaz, it's the 25th! These bills are still unpaid:\n\n"
        total = 0
        for bill in still_unpaid:
            if bill['amount']:
                total += bill['amount']
                msg += f"  • {bill['name']}: RM{bill['amount']:.2f}\n"
            else:
                msg += f"  • {bill['name']}: ?? (check app)\n"
        msg += f"\n**Total overdue: RM{total:.2f}**\nPlease pay ASAP to avoid late fees!"
        return msg
    
    else:
        return f"Today is not a reminder day (15th or 25th). Today: {today}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    action = sys.argv[1]
    
    if action == "status":
        cmd_status()
    elif action == "pay":
        if len(sys.argv) < 3:
            print("Usage: bills.py pay <bill_id>")
            sys.exit(1)
        cmd_pay(sys.argv[2])
    elif action == "set_amount":
        if len(sys.argv) < 4:
            print("Usage: bills.py set_amount <bill_id> <amount>")
            sys.exit(1)
        cmd_set_amount(sys.argv[2], sys.argv[3])
    elif action == "unpaid":
        cmd_unpaid()
    elif action == "total":
        cmd_total()
    elif action == "remind":
        result = cmd_remind()
        print(result)
    else:
        print(f"Unknown action: {action}")
        print(__doc__)
