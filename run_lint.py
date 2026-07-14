#!/usr/bin/env python3
"""Real lint pass over the LLM wiki — mirrors the daily report checks."""
import os, re, glob, sys
from datetime import datetime, timezone, timedelta

WIKI = "/root/llm-wiki-project/wiki"
TZ = timezone(timedelta(hours=8))  # Asia/Kuala_Lumpur

PAGE_DIRS = ["entities", "concepts", "source", "synthesis", "comparison"]
pages = {}
for d in PAGE_DIRS:
    folder = os.path.join(WIKI, d)
    if not os.path.isdir(folder):
        continue
    for fp in sorted(glob.glob(os.path.join(folder, "*.md"))):
        name = os.path.splitext(os.path.basename(fp))[0]
        with open(fp, encoding="utf-8") as f:
            pages[name] = f.read()

def frontmatter(txt):
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    if not m:
        return None
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    return fm

def wikilinks(txt):
    return re.findall(r"\[\[([^\]]+)\]\]", txt)

# 1. Schema integrity
print("== 1. Schema Integrity ==")
schema_fail = []
for name, txt in pages.items():
    fm = frontmatter(txt)
    if fm is None:
        schema_fail.append((name, "no frontmatter"))
        continue
    for req in ("title", "created", "updated", "type", "tags"):
        if req not in fm:
            schema_fail.append((name, f"missing {req}"))
    if "type" in fm and fm["type"] not in ("entity", "concept", "source", "synthesis", "comparison"):
        schema_fail.append((name, f"bad type '{fm['type']}'"))
if schema_fail:
    for n, r in schema_fail:
        print(f"  FAIL {n}: {r}")
else:
    print("  PASS - all pages valid frontmatter")

# 2. Staleness (older than 14 days by updated date)
print("== 2. Staleness ==")
today = datetime.now(TZ).date()
stale = []
for name, txt in pages.items():
    fm = frontmatter(txt) or {}
    ud = fm.get("updated")
    if not ud:
        continue
    try:
        d = datetime.strptime(ud, "%Y-%m-%d").date()
        if (today - d).days > 14:
            stale.append((name, ud))
    except ValueError:
        pass
if stale:
    for n, d in stale:
        print(f"  STALE {n}: {d}")
else:
    print(f"  PASS - none stale (today {today})")

# 3. Coverage gaps - informational, skip
print("== 3. Coverage Gaps ==")
print("  INFO - see report (out of scope for auto-fix)")

# 4. Orphan check (>=1 inbound)
print("== 4. Orphan Check ==")
inbound = {n: [] for n in pages}
for name, txt in pages.items():
    for link in wikilinks(txt):
        target = link.split("|")[0].split("#")[0].strip().lower()
        if target in pages and target != name:
            inbound[target].append(name)
orphans = [n for n in pages if len(inbound[n]) < 1]
if orphans:
    for n in orphans:
        print(f"  FAIL orphan: {n}")
else:
    print("  PASS - all pages have >=1 inbound link")

# 5. Outbound minimum 2
print("== 5. Outbound Links (min 2 per SCHEMA) ==")
low_out = []
for name, txt in pages.items():
    out = set()
    for link in wikilinks(txt):
        t = link.split("|")[0].split("#")[0].strip().lower()
        if t in pages and t != name:
            out.add(t)
    if len(out) < 2:
        low_out.append((name, len(out)))
if low_out:
    for n, c in sorted(low_out, key=lambda x: x[1]):
        print(f"  FAIL <2 outbound: {n} ({c})")
else:
    print("  PASS - all pages >=2 outbound links")

# 6. Duplicate detection
print("== 6. Duplicate Detection ==")
bodies = {}
dups = []
for name, txt in pages.items():
    body = re.sub(r"^---.*?---\n", "", txt, flags=re.S).strip()
    if body in bodies:
        dups.append((name, bodies[body]))
    else:
        bodies[body] = name
if dups:
    for n, o in dups:
        print(f"  DUP {n} ~ {o}")
else:
    print("  PASS - no duplicates")

# Stray files outside wiki/ that look like pages
print("== 7. Stray top-level .md ==")
stray = []
for fp in glob.glob("/root/llm-wiki-project/*.md"):
    base = os.path.basename(fp)
    if base in ("purpose.md", "test.md"):
        stray.append(base)
if stray:
    for s in stray:
        print(f"  STRAY: {s}")
else:
    print("  PASS")

print("\nSUMMARY:")
print(f"  pages={len(pages)} schema_fail={len(schema_fail)} orphans={len(orphans)} low_outbound={len(low_out)} dups={len(dups)} stray={len(stray)}")
