#!/usr/bin/env python3
"""Public stats endpoint for RizenCC — no NextAuth required."""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import sqlite3
import os
import subprocess
import urllib.request
import time
from datetime import date, datetime, timedelta
import sys

DB_PATH = "/root/my-app/db/custom.db"

# Cache for external API balance queries (avoids hitting provider APIs every refresh)
_balance_cache = {"data": None, "ts": 0}

def _get_balances():
    now = time.time()
    if _balance_cache["data"] is not None and now - _balance_cache["ts"] < 300:
        return _balance_cache["data"]
    result = []
    # DeepSeek
    try:
        ds_key = os.environ.get("DEEPSEEK_API_KEY","")
        if not ds_key:
            # fallback: try pi auth.json
            try:
                pi_auth = json.load(open("/root/.pi/agent/auth.json"))
                ds_key = pi_auth.get("deepseek",{}).get("key","")
            except: pass
        if ds_key:
            req = urllib.request.Request("https://api.deepseek.com/user/balance",
                headers={"Authorization": f"Bearer {ds_key}"})
            with urllib.request.urlopen(req, timeout=8) as r:
                ds = json.loads(r.read())
            if ds.get("is_available"):
                for bi in ds.get("balance_infos",[]):
                    result.append({"provider":"DeepSeek","balance":float(bi.get("total_balance",0)),"currency":bi.get("currency","USD")})
    except Exception as e:
        result.append({"provider":"DeepSeek","error":str(e)[:80]})
    # Neuralwatt — just check key is active (no public balance endpoint)
    try:
        nw_key = os.environ.get("NEURALWATT_API_KEY","")
        if not nw_key:
            try:
                with open("/root/.hermes/.env") as f:
                    for line in f:
                        if line.startswith("NEURALWATT_API_KEY="):
                            nw_key = line.split("=",1)[1].strip()
                            break
            except: pass
        if nw_key:
            req = urllib.request.Request("https://api.neuralwatt.com/v1/models",
                headers={"Authorization": f"Bearer {nw_key}"})
            with urllib.request.urlopen(req, timeout=8) as r:
                if r.status == 200:
                    result.append({"provider":"Neuralwatt","active":True})
    except Exception as e:
        result.append({"provider":"Neuralwatt","active":False,"error":str(e)[:80]})
    # Ollama Cloud
    try:
        pi_auth = json.load(open("/root/.pi/agent/auth.json"))
        oc_key = pi_auth.get("ollama-cloud",{}).get("key","")
        if oc_key:
            req = urllib.request.Request("https://ollama.com/v1/models",
                headers={"Authorization": f"Bearer {oc_key}"})
            with urllib.request.urlopen(req, timeout=8) as r:
                if r.status == 200:
                    result.append({"provider":"Ollama Cloud","active":True})
    except Exception as e:
        result.append({"provider":"Ollama Cloud","active":False,"error":str(e)[:80]})
    _balance_cache["data"] = result
    _balance_cache["ts"] = now
    return result
PORT = int(os.environ.get("STATS_PORT", "8102"))

def get_active_agents():
    try:
        result = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=3)
        pm2list = json.loads(result.stdout or "[]")
        return sum(1 for p in pm2list
                   if "hermes-gateway" in p.get("name", "")
                   and p.get("pm2_env", {}).get("status") == "online") or 3
    except: return 3

def get_stats():
    today_str = date.today().isoformat()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    user = cur.execute("SELECT id FROM User WHERE role = 'HERO' LIMIT 1").fetchone()
    if not user: con.close(); return {"error": "No operator user found"}
    uid = user["id"]

    # Order counts
    pending = cur.execute("SELECT COUNT(*) FROM `Order` WHERE status='PENDING' AND userId=?", (uid,)).fetchone()[0]
    booked = cur.execute("SELECT COUNT(*) FROM `Order` WHERE status='BOOKED' AND userId=?", (uid,)).fetchone()[0]
    completed = cur.execute("SELECT COUNT(*) FROM `Order` WHERE status='COMPLETED' AND userId=?", (uid,)).fetchone()[0]
    scheduled = cur.execute("SELECT COUNT(*) FROM `Order` WHERE status IN ('SCHEDULED','CONFIRMED') AND userId=?", (uid,)).fetchone()[0]

    # Points
    today_points = cur.execute(
        "SELECT COALESCE(SUM(points),0) FROM `Order` WHERE scheduledDate=? AND userId=? AND status NOT IN ('CANCELED','PENDING')",
        (today_str, uid)).fetchone()[0]
    today = date.today()
    week_end = (today + timedelta(days=13)).isoformat()
    week_points = cur.execute(
        "SELECT COALESCE(SUM(points),0) FROM `Order` WHERE scheduledDate>=? AND scheduledDate<=? AND userId=? AND status NOT IN ('CANCELED','PENDING')",
        (today_str, week_end, uid)).fetchone()[0]

    # Zone coverage — orders by city this week
    zones = cur.execute("""
        SELECT COALESCE(city,'Unknown') as name, COUNT(*) as count, COALESCE(SUM(points),0) as points
        FROM `Order` WHERE scheduledDate>=? AND scheduledDate<=? AND userId=? AND status NOT IN ('CANCELED','PENDING')
        GROUP BY city ORDER BY count DESC LIMIT 6
    """, (today_str, week_end, uid)).fetchall()
    zone_coverage = [{"name": z["name"], "count": z["count"], "points": z["points"]} for z in zones]

    # Today-only zone breakdown
    today_zones = cur.execute("""
        SELECT COALESCE(city,'Unknown') as name, COUNT(*) as count, COALESCE(SUM(points),0) as points
        FROM `Order` WHERE scheduledDate=? AND userId=? AND status NOT IN ('CANCELED','PENDING')
        GROUP BY city ORDER BY count DESC
    """, (today_str, uid)).fetchall()
    today_zone_list = [{"name": tz["name"], "count": tz["count"], "points": tz["points"]} for tz in today_zones]
    today_count = sum(tz["count"] for tz in today_zones)

    # Upcoming holidays (next 30 days)
    end30 = (today + timedelta(days=30)).isoformat()
    holidays = cur.execute("""
        SELECT date, name as label FROM Holiday WHERE date >= ? AND date <= ? AND userId = ?
        ORDER BY date LIMIT 5
    """, (today_str, end30, uid)).fetchall()
    upcoming_holidays = [{"date": h["date"], "label": h["label"]} for h in holidays]

    # Upcoming orders (next 7 days, grouped by date, with per-day zone breakdown)
    end7 = (today + timedelta(days=7)).isoformat()
    upcoming_raw = cur.execute("""
        SELECT scheduledDate, COUNT(*) as cnt FROM `Order`
        WHERE scheduledDate>=? AND scheduledDate<=? AND userId=? AND status NOT IN ('CANCELED','PENDING')
        GROUP BY scheduledDate ORDER BY scheduledDate LIMIT 7
    """, (today_str, end7, uid)).fetchall()
    upcoming = []
    for o in upcoming_raw:
        day_zones = cur.execute("""
            SELECT COALESCE(city,'Unknown') as name, COUNT(*) as count
            FROM `Order` WHERE scheduledDate=? AND userId=? AND status NOT IN ('CANCELED','PENDING')
            GROUP BY city ORDER BY count DESC
        """, (o["scheduledDate"], uid)).fetchall()
        zone_list = [{"name": z["name"], "count": z["count"]} for z in day_zones]
        day_pts = cur.execute(
            "SELECT COALESCE(SUM(points),0) FROM `Order` WHERE scheduledDate=? AND userId=? AND status NOT IN ('CANCELED','PENDING')",
            (o["scheduledDate"], uid)).fetchone()[0]
        upcoming.append({"date": o["scheduledDate"], "count": o["cnt"], "zones": zone_list, "points": day_pts})

    con.close()

    return {
        "pendingCount": pending, "bookedCount": booked,
        "completedCount": completed + scheduled,
        "todayPoints": today_points, "weekPoints": week_points,
        "activeAgents": get_active_agents(),
        "lastUpdated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "zoneCoverage": zone_coverage,
        "upcomingHolidays": upcoming_holidays,
        "upcomingOrders": upcoming,
        "totalOrders": pending + booked + completed + scheduled,
        "todayZones": today_zone_list,
        "todayCount": today_count,
        "balances": _get_balances(),
    }

class StatsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if self.path.endswith("/balances"):
                data = _get_balances()
            else:
                data = get_stats()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        except Exception as e:
            self.send_response(500); self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    def log_message(self, f, *a): pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", PORT), StatsHandler).serve_forever()
