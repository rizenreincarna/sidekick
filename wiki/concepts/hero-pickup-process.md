---
title: HERO E-Waste Pickup Process
created: 2026-07-05
updated: 2026-07-05
type: concept
tags: [work, hero, pickup, process]
confidence: high
sources: []
---

# HERO E-Waste Pickup Process

Naz drives for HERO e-waste — picks up electronic waste from customers and logs it via the Sidekick app.

## Daily Workflow
1. Start at 10 AM (9 AM if heavy day)
2. Check orders in Sidekick app ([[sidekick-app]])
3. Process pickups — collect e-waste from customers
4. Mark orders COMPLETED via sqlite3 on the app's database
5. Send daily payout report to boss via [[touchngo|TouchNGo]]

## Order Marking
- App uses SQLite WAL at `db/custom.db`
- Marking COMPLETED via sqlite3 works reliably
- The app may temporarily show BOOKED due to [[firebase|Firebase]] cache — this is normal
- **Reserved words** like `Order`, `User`, `Group`, `Table` must be quoted in raw sqlite3 CLI

## Payment Tracking
- Daily payments logged at `/root/my-app/pickup-payments/YYYY-MM-DD.json`
- Helper script: `python3 payments.py add|report|list`
- Formula: Total = sum(payments) - sum(received + advances)
- ERTHBOX is a NO-payment item
- Cancelled orders are excluded from totals

## Report Format
```
🚛 Pickup Report – YYYY-MM-DD
Erthbox (ID + location + ✅)
Pickups (RM + order ID)
Total: RMXXX ✅
```

## Known Associates
- [[yahya-and-sam]] sometimes handle pickups — note in order notes

## Key Route
- Big pickup at Kesas Highway Proton Excellence Centre
- Naz rides motorcycle for pickups (Yamaha Y15ZR)
- Hydration is a real concern on heavy routes

## PM2 Management
- The [[pm2|PM2]] `hero-updater` process runs via PM2 on the VPS
- App pushes via [[ntfy]] (topic-based HTTP pub-sub, replaces Firebase FCM)
- [[yahya-and-sam|Yahya & Sam]] sometimes handle pickups — note in order notes
