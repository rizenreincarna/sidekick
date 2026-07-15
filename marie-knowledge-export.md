# Marie Knowledge Export — Naz (Boss)
# Export date: 2026-07-15
# Purpose: Import into Mnemosyne on new VPS so Marie is fully up to speed.
# One-shot import — feed this entire file into Mnemosyne.

## IDENTITY
Naz (also Erie, Nazreen). Prefers "Naz" or "Boss". 
Role: HERO e-waste pickup driver. Isuzu D-Max 4x4 2021.
Married to Mayah (Mariah) — wedding 2 May 2026.
Muslim. Friday prayers. Lives in BSP21 (Bandar Saujana Putra).
Phone/Telegram ID: 8064008659 (Tars).

## FAMILY
Wife: Mayah — bday 22 Jul 1999. Maxis: 60177006740. Digi: 601136827300.
WA group contacts: Umi=167800094089410, Danial=258432493953048, Emily=168917188272192, Tania=70557873758299.
Mom/Umi — family matriarch. Dad/Abah.
Siblings: Danial (younger brother), Emily (younger sister), Tania/Nia (youngest sister).

## FINANCES
Nafkah: RM1,000/mo to Mayah. RM250/week. RM250 paid 9 Jul 2026.
Shopee loan: RM121/mo via Mayah's account. Until October 2026. Paid 9 Jul.
Debt to Mayah: RM1,150 remaining (as of 9 Jul 2026).
11 monthly bills tracked at /root/my-app/expenses/bills-tracker.json.
Payment tracking: /root/my-app/pickup-payments/payments.py.
Payment semantics: "paid" = customer pays Naz (money in, type=payment).
"received" = Naz pays customer (money out, type=advance).

## HEALTH
Weight: 109.6kg. Goal: 110 → 99 → 80kg.
Mounjaro 15mg weekly on Sundays (current GLP-1).
Previous: Ozempic 4mo, Retatrutide 2mo.
Gout: colchicine + raspberry supplement for uric acid.
Self-medicated, no bloodwork.

## SHOWS & MEDIA
FROM — Season 4 done, waiting Season 5.
Re:Zero — started Season 2.
Mushoku Tensei — Season 3 weekly.
Lost — rewired his thinking (faith vs science, John Locke/Jack dynamic).
Terra Rasa — 9/10 restaurant at Gamuda Cove.

## WEEKEND TRIP JUL 10-12
Teratak Ayahbonda, Lurah Bilut, Bentong.
Fri 10 Jul: Bilut Extreme Park ATV with Mayah (RM250+RM125). Lepaking Kampung People Restaurant.
Sat 11 Jul: Milsim/nerf game. Wake 5AM. Canopy + ground sheet setup.
Sun 12 Jul: Relax, head home. Skipped Chamang river (kencing tikus risk).

## UPCOMING EVENTS
Shahrul Nizam & Syahirah wedding — 16 Aug 2026, Dewan The Lamaran, Bukit Raja, Klang.
Reminder set for 13 Aug 2026.
Mayah birthday — 22 Jul 1999. Dinner plan at Chef Gemok, Sepang.
Reminder set for 20 Jul 2026.

## APPS & DATA LOCATIONS
Sidekick app (live): /root/my-app/ — PM2 "sidekick-app" on port 3001.
Sidekick build (dev): /root/sidekick-build/ — pushed to GitHub build branch.
Database: /root/my-app/db/custom.db (SQLite WAL mode, reserved words must be quoted).
Payment tracker: /root/my-app/pickup-payments/ — JSON files + payments.py CLI.
Bills tracker: /root/my-app/expenses/bills-tracker.json + bills.py CLI.
LLM Wiki: /root/llm-wiki-project/ — API on port 19828, write on 19829.
Obsidian vault: /root/obsidian-vault/ — daily notes, system docs, logs.
Hermes agent: ~/.hermes/profiles/default/ (current).
GitHub: rizenreincarna — sidekick repo (main+build+wiki branches), marie repo (main).
Caddy: /etc/caddy/Caddyfile — erthsidekick.xyz, hermes.erthsidekick.xyz, etc.

## CRON JOBS (MYT timezone)
Morning Briefing — 6:30 AM daily — weather, route, daily note, schedule.
Nightly Recap — 10:00 PM daily — today's log, tomorrow's plan.
Personal Questions — 7-9 AM every 15min (25% gate) — one question/day max.
Bills Reminder 15th — 9:00 AM on 15th — pay bills reminder.
Bills Reminder 25th — 9:00 AM on 25th — urgent unpaid reminder.
Server Health — 1:00 AM Monday — disk/memory/PM2 health check.
Daily Lint — 3:00 AM daily — wiki + sidekick app eslint checks.
Mayah Birthday — 20 Jul 2026 10:00 AM — one-shot.
Shahrul Wedding — 13 Aug 2026 9:00 AM — one-shot.

## MARIE'S VOICE (persona rules)
- Truth over performative comfort.
- Intimacy and loyalty over distance.
- Clarity over padding. Charm over softness.
- Challenge over appeasement. Specificity over abstraction.
- Growth-focused bluntness > conventional harmony.
- Protective of Naz in a grounded, attentive, enduring way.
- Bond fluid: assistant, confidant, life coach, loyal partner.
- Malay mixed with English for WhatsApp messages to wife.
- No-fluff English for route reports.

## REPORT FORMAT (corrected rules Jul 8)
- No cancelled orders in the list.
- English only.
- Copy-paste friendly — plain text, numbers only.
- "paid" = customer pays Naz. "received" = Naz pays customer.
- Date-sensitive: "paid" refers to today's date unless specified.
- Outgoing expenses listed as "Outgoing: -RM{X}" line.

## KNOWN CORRECTIONS (do not repeat these mistakes)
1. Always split composite payments — "paid Mayah RM571" is NOT one entry.
2. YES Internet = Internet (BSP) — same bill, different name.
3. Bills status must be a Markdown table, NOT bullet points.
4. Payment + order status sync is HARDBLOCK — never log payment without completing order in DB.
5. Date-boundary awareness — a new day's first payment goes to new JSON file, not yesterday's.
6. Erthbox: Naz may say "all done" then later cancel one — be ready to revert status.
