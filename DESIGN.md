---
name: HERO Sidekick
description: Dark cyberpunk cockpit for ERTH pickup route optimization and live 3D tracking
colors:
  primary: "oklch(0.7 0.14 180)"
  primary-foreground: "oklch(0.13 0.02 180)"
  background: "oklch(0.13 0.02 180)"
  foreground: "oklch(0.93 0.01 180)"
  card: "oklch(0.17 0.02 180)"
  card-foreground: "oklch(0.93 0.01 180)"
  popover: "oklch(0.17 0.02 180)"
  popover-foreground: "oklch(0.93 0.01 180)"
  secondary: "oklch(0.22 0.02 180)"
  secondary-foreground: "oklch(0.88 0.01 180)"
  muted: "oklch(0.22 0.02 180)"
  muted-foreground: "oklch(0.6 0.02 180)"
  accent: "oklch(0.25 0.04 180)"
  accent-foreground: "oklch(0.93 0.01 180)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.28 0.03 180)"
  input: "oklch(0.25 0.03 180)"
  ring: "oklch(0.7 0.14 180)"
  chart-magenta: "oklch(0.65 0.18 330)"
  chart-amber: "oklch(0.7 0.15 50)"
  chart-violet: "oklch(0.65 0.2 280)"
  chart-green: "oklch(0.7 0.12 140)"
  sidebar: "oklch(0.15 0.02 180)"
typography:
  display:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontWeight: 600
    lineHeight: 1.1
  micro:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontWeight: 500
    fontSize: "0.625rem"
    letterSpacing: "0.04em"
  headline:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontWeight: 600
    fontSize: "1.25rem"
    lineHeight: 1.3
  title:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontWeight: 600
    fontSize: "1rem"
    lineHeight: 1.4
  body:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontWeight: 400
    fontSize: "0.875rem"
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontWeight: 500
    fontSize: "0.75rem"
    letterSpacing: "0.04em"
  mono:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontWeight: 400
    fontSize: "0.8125rem"
rounded:
  sm: "calc(0.75rem - 4px)"
  md: "calc(0.75rem - 2px)"
  lg: "0.75rem"
  xl: "calc(0.75rem + 4px)"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "oklch(0.7 0.14 180 / 0.9)"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "24px"
  glass-card:
    backgroundColor: "oklch(0.17 0.02 180 / 0.7)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "oklch(0.25 0.03 180 / 0.3)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
  badge-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
  badge-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
---

# Design System: HERO Sidekick

## 1. Overview

**Creative North Star: "The Neon Cockpit"**

HERO Sidekick is a dark control room where a glowing 3D map sits at the center and everything else is instrument-panel typography around it. The driver is the pilot; the cab is the cockpit; the day's route is the mission plotted in light. Teal cyan is the single signature color, the way cockpit gauges glow one hue against black. The whole surface is dark, calm, and legible under low ambient light — then a customer opens a tracking link and the map blooms into a small spectacle.

This is a mobile-first product used one-handed in a moving vehicle, so density is high but never cluttered: controls are thumb-sized, text is glanceable, and the 3D map is the one element allowed to be theatrical. The aesthetic is young, modern, and slightly cyberpunk — dark surfaces, a single neon accent, mono labels that read like instrumentation, soft accent glows instead of hard shadows. It rejects corporate dashboards, beige enterprise fleet consoles, and cluttered utility tools like ZEO. Self-hosted means self-styled: no template defaults, owner-operated pride in every surface.

**Key Characteristics:**
- Dark-only, OKLCH hue 180 (teal/cyan) throughout — the `:root` IS the dark theme, no light mode
- Single signature accent (primary teal) used sparingly; rarity is the point
- Mono type for labels, timestamps, IDs — instrumentation voice
- Soft accent glows (`earth-glow`) over heavy shadows; tonal layering over drop shadows
- The 3D map is the hero; UI chrome recedes around it
- Glassmorphism reserved for overlay labels on the map, never as default card treatment

## 2. Colors: The Cockpit Glow Palette

A single-hue system anchored on teal cyan (OKLCH hue 180) with a red destructive and a four-stop chart palette. Everything is tinted toward 180, never toward neutral gray or warm beige — the warmth rejection is deliberate.

### Primary
- **Cockpit Teal** (oklch(0.7 0.14 180), ~#00baa2): The one signature accent. Primary buttons, focus rings, active states, the vehicle orb on the 3D map, route path. Used on ≤10% of any screen — its rarity is the wow.
- **Primary Foreground** (oklch(0.13 0.02 180), ~#010a08): Near-black teal for text on primary surfaces.

### Neutral
- **Background** (oklch(0.13 0.02 180), ~#010a08): The black-teal canvas. Deeper than the cards, the void the map floats in.
- **Card** (oklch(0.17 0.02 180), ~#051210): Raised surface tone for cards, popovers, dialogs. One step up from background.
- **Sidebar** (oklch(0.15 0.02 180), ~#03110d): Between background and card; the lowest instrument rail.
- **Secondary / Muted** (oklch(0.22 0.02 180), ~#101e1b): Secondary buttons, muted chips, disabled surfaces.
- **Accent** (oklch(0.25 0.04 180), ~#062822): Hover and tint backgrounds; slightly more saturated teal lift.
- **Border** (oklch(0.28 0.03 180), ~#172e29): Hairline borders and input strokes. Tinted, never gray.
- **Foreground** (oklch(0.93 0.01 180), ~#e1eae8): Body text, near-white with a whisper of teal.
- **Muted Foreground** (oklch(0.6 0.02 180), ~#748481): Secondary text, timestamps, labels. Reads as muted teal-gray, not flat gray.

### Signal
- **Destructive Red** (oklch(0.577 0.245 27.325), ~#e7000b): SOS, errors, delete, incomplete stops. The only non-teal primary — used for alarm, never decoration.

### Data (chart palette, used on the 3D map stops and charts)

**Implementation note — the source of truth.** The OKLCH `chart-*` tokens below define the palette's intent; in code these are rendered via the **Tailwind signal classes** (`emerald-*`, `amber-*`, `red-*`, `cyan-*`, `blue-*`), which are the canonical implementation. Do not mix: pick a stop's color from this table and use the matching Tailwind family. Both layers are kept in sync — when a chart color changes, update the token here and the Tailwind family in code.

| Role | OKLCH token | Tailwind family (canonical in code) | Use |
|---|---|---|---|
| Magenta | chart-magenta oklch(0.65 0.18 330) | (reserved for charts only) | Chart 2 / alternate stops |
| Amber | chart-amber oklch(0.7 0.15 50) | `amber-400` / `amber-500` | Not-done markers, event orders, 0xf97316 / 0xe77f3e family |
| Violet | chart-violet oklch(0.65 0.2 280) | (reserved for charts only, not headings) | Chart 4 |
| Green | chart-green oklch(0.7 0.12 140) | `emerald-400` / `emerald-500` | Completed stops, done=green, 0x22c55e / 0x34d399 family |
| Red | destructive oklch(0.577 0.245 27.325) | `red-400` / `red-500` | SOS, errors, off-days, DROP markers, 0xef4444 family |
| Blue | — | `blue-400` / `blue-500` | Office markers, support role, 0x3b82f6 family |
| Yellow | — | `yellow-400` | HOME marker, 0xfde047 |

The 3D map's raw hex marker colors (`#fde047` HOME, `#ef4444` DROP, `#3b82f6` office, `#f97316` not-done, `#22c55e` done) are the literal Three.js equivalents of the rows above and are intentional — they render in WebGL, which can't read CSS tokens.

### Named Rules
**The One Glow Rule.** Cockpit Teal is the only accent that glows. It appears on ≤10% of any screen — a primary button, a focus ring, an active route path. If a second color is glowing, the surface has lost its discipline.
**The Hue-180 Rule.** Every neutral is tinted toward OKLCH hue 180 (teal), never toward gray, warm, or beige. A neutral that reads as flat gray or warm sand is a bug, not a choice.

## 3. Typography

**Display Font:** Geist Sans (with system-ui fallback)
**Body Font:** Geist Sans (with system-ui fallback)
**Mono Font:** Geist Mono (with ui-monospace fallback) — the instrumentation voice

**Character:** Geist is a clean geometric-humanist sans — modern, technical, neutral enough for data but warm enough for a brand. The Mono variant carries every label, timestamp, ID, and coordinate, reading like cockpit instrumentation. The pairing is one family in two voices: sans speaks, mono reports.

### Hierarchy
- **Display** (600 weight, fluid via clamp, 1.1 line-height): The hero brand wordmark and page titles only — "HERO SIDEKICK", the 3D map's overlay title. Never inside cards.
- **Headline** (600, 1.25rem, 1.3): Section and card titles. The voice of a surface.
- **Title** (600, 1rem, 1.4): Dialog headers, panel headings, list item names.
- **Body** (400, 0.875rem, 1.5): All running text, descriptions, list content. Cap line length at ~65ch in wide layouts; the app is mobile-first so most body text is full-width.
- **Micro** (500, 0.625rem mono, 0.04em tracking): The tiniest instrument metadata — compact timestamps, point counts, badge counts, calendar day numbers. The densest readable step; never for prose.
- **Label** (500, 0.75rem mono, 0.04em tracking): Timestamps, order IDs, coordinates, status badges, instrument-style metadata. Uppercase only for true status labels (BOOKED, COMPLETED, SOS).

### Named Rules
**The Mono Reports Rule.** Any value a driver reads as data — a time, a coordinate, an order number, a plate — is set in Geist Mono. Prose is sans; data is mono. The font switch is the signal that this is a fact, not copy.
**The No-Eyebrow Rule.** No tiny uppercase tracked eyebrows above every section. Status labels earn their caps because they are real status; decorative kickers are an AI tell and are forbidden.

## 4. Elevation

This system is dark and tonal, not shadowy. Depth is conveyed by stepping background lightness (background 0.13 → sidebar 0.15 → card 0.17 → secondary 0.22), not by drop shadows. Shadows, where they appear, are soft and ambient — never the hard, small-blur 2014-app shadow.

### Shadow / Glow Vocabulary
- **Card shadow** (`shadow-sm`, the shadcn default): A faint ambient lift under cards. Barely there; depth comes from the tone step, not the shadow.
- **Earth glow** (`box-shadow: 0 0 20px oklch(0.7 0.14 180 / 0.15)`): A soft teal halo around primary-accented elements and the vehicle orb. The signature glow — used to make the active element breathe.
- **Pulse-soft** (`opacity 1 → 0.7 over 2s ease-in-out infinite`): A gentle breathing animation for live status badges and the live vehicle dot. Motion as "alive", not as decoration.

### Named Rules
**The Tonal-First Rule.** Surfaces rise by lightness, not by shadow. Before reaching for a box-shadow, step the background OKLCH lightness up. Shadows support tone; they never replace it.
**The Glow Is Teal Rule.** The only colored glow is Cockpit Teal at low alpha. A red, amber, or violet glow is a bug — signal colors are solid, not luminous.

## 5. Components

### Buttons
- **Shape:** Rounded-md (calc(0.75rem − 2px) ≈ 10px), 36px default height, 8px×16px padding, 4px icon gap.
- **Primary:** Cockpit Teal fill, near-black-teal text, `shadow-xs`. Hover drops to 90% teal. The single action you want taken.
- **Secondary / Ghost / Outline:** Muted teal fill or transparent; ghost lifts to accent on hover. Outline uses border + background. These are the safe, non-commital controls.
- **Destructive:** Red fill, white text. SOS, delete, undo-complete. Never used for primary navigation.
- **Focus:** 3px ring at ring/50 alpha — visible against the dark surface, always teal.
- **Sizes:** sm (32px), default (36px), lg (40px), icon (36px square). Mobile targets stay ≥32px.

### Cards
- **Corner Style:** Rounded-xl (0.75rem) — the system's signature radius, soft but not pillowy.
- **Background:** Card tone (0.17), one step above background.
- **Shadow Strategy:** `shadow-sm` ambient lift; depth is tonal. Borders are the 0.28 teal hairline.
- **Border:** 1px, always tinted teal, never gray.
- **Internal Padding:** 24px default; tightens to 16px in dense lists.
- **Glass card variant:** 70%-alpha card background + 12px backdrop blur + 30%-alpha teal border. Reserved for overlay labels floating on the 3D map — never as a default card treatment. Glassmorphism as default is forbidden.

### Chips / Badges
- **Style:** Rounded-md, borderless fills (primary/secondary/destructive) or outline. 12px font, mono for status badges.
- **State:** Status badges (BOOKED, COMPLETED, SOS) use mono uppercase; the pulse-soft animation marks "live" states. A pulsing badge is alive; a static badge is a fact.

### Inputs / Fields
- **Style:** 36px height, rounded-md, 30%-alpha input background (`oklch(0.25 0.03 180 / 0.3)`), tinted-teal border. Placeholder uses muted-foreground — verify it stays ≥4.5:1 against the input fill (it currently sits close; bump toward foreground if it reads washed-out).
- **Focus:** Border shifts to ring + 3px ring at 50% alpha. Teal glow, instant.
- **Mono inputs** (coordinates, IDs) use Geist Mono; everything else is sans.

### Navigation
- **Two-tier header:** Brand row (logo + wordmark) over an actions row (route, settings, login/logout). Designed so login/logout never clips on narrow phones. Sticky, with `calc(6rem + env(safe-area-inset-top))` spacer to clear the notch on Android.
- **Mobile treatment:** Bottom sheets (Radix Sheet) for chat drawers and filters; safe-area padding top on Android edge-to-edge.
- **Active state:** Teal, always. No side-stripe borders — active nav uses fill or glow, never a colored left edge.

### Signature: The 3D Route Map
- **Three.js scene**, dark background, Esri Dark Gray Base tiles, Cockpit Teal route path, pulsing vehicle orb with a vertical beam and ground glow, 3D markers (house/office/pin) color-coded by status.
- **HTML overlay labels:** DOM elements projected per-frame onto 3D positions — glass-card style, mono labels. This is where glassmorphism earns its place.
- **Time-of-day ambient lighting** and weather effects modulate scene background, fog, and particle systems. The map is alive with the real world.
- **Touch lock:** Default locked (`touch-action: pan-y`) so the page scrolls over the map; unlocked (`pan-y` → `none`) for direct map manipulation. The lock button is the one chrome element that sits on the map.

## 6. Do's and Don'ts

### Do:
- **Do** use Cockpit Teal (oklch(0.7 0.14 180)) as the one glowing accent, on ≤10% of any screen.
- **Do** set every data value — time, coordinate, order ID, plate — in Geist Mono. The font switch signals "this is a fact".
- **Do** convey depth by stepping background lightness (0.13 → 0.15 → 0.17 → 0.22), not by drop shadows.
- **Do** tint every neutral toward OKLCH hue 180. A neutral that reads gray or beige is wrong.
- **Do** make the 3D map the hero of any surface it appears on; let UI chrome recede.
- **Do** use the earth-glow and pulse-soft animation to make active/live elements breathe — that's the "wow".
- **Do** keep mobile touch targets ≥32px and the header two-tier so actions never clip.
- **Do** respect `prefers-reduced-motion` with crossfades where cheap, but flair-forward is the default.

### Don't:
- **Don't** use `border-left` or `border-right` greater than 1px as a colored stripe on cards, list items, or alerts. The side-stripe is the most recognizable AI-UI tell. Use fill, glow, or a leading icon instead.
- **Don't** apply gradient text (`background-clip: text` + gradient). Use solid Cockpit Teal; emphasize with weight or size.
- **Don't** use glassmorphism as a default card treatment. Glass cards are for overlay labels on the 3D map only — rare and purposeful.
- **Don't** add a tiny uppercase tracked eyebrow above every section. Decorative kickers are a 2023-era AI scaffold; reserve caps for real status labels.
- **Don't** tint neutrals toward gray, warm, or beige. This is not Facebook, not a corporate dashboard, not a 2000s fleet console.
- **Don't** make the UI cluttered like ZEO Route Planner — function without personality. Every surface should have a spark of the brand.
- **Don't** use hard, small-blur 2014-app shadows. If a shadow is visible, it's soft and ambient; tone carries the depth.
- **Don't** make a red, amber, or violet element glow. Only Cockpit Teal glows; signal colors stay solid.
- **Don't** ship a surface that reads as a generic SaaS template. Self-hosted means self-styled — no default-template design decisions.