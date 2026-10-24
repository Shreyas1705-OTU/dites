# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/dites/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Dites
**Generated:** 2026-10-23 by UI UX Pro Max, revised 2026-10-24 with the developer
**Category:** Chat & Messaging App
**Direction:** Ink & Paper, Lapis accent. Iron-gall ink on cool paper, with lapis
lazuli blue for actions and your own messages.

Implemented as tokens in `src/app/globals.css` (`:root` and `.dark`). Components
use the tokens (`bg-primary`, `text-muted-foreground`, ...), never raw hex.

---

## Global Rules

### Color Palette

Every pair below was measured against WCAG 2.2: text ≥ 4.5:1, borders, focus
rings and UI shapes ≥ 3:1.

| Role | Token | Light | Dark | Measured |
|------|-------|-------|------|----------|
| Background (page) | `--background` | `#F6F5F1` | `#14161C` | |
| Foreground (ink) | `--foreground` | `#1B1F2A` | `#ECEAE4` | 15.4 / 14.9 on background |
| Card / popover / input fill | `--card` | `#FFFFFF` | `#1C1F27` | |
| Sidebar | `--sidebar` | `#EFEEE9` | `#181A21` | |
| Primary (Lapis) | `--primary` | `#26619C` | `#93B8E6` | 6.4 / 8.0 on card |
| On primary | `--primary-foreground` | `#FFFFFF` | `#14161C` | 6.4 / 8.8 |
| Your message bubble | `--bubble-mine` | `#26619C` | `#1E4C7E` | text `#FFFFFF` 6.4 / `#EEF1F8` 7.8 |
| Others' bubble, secondary | `--secondary` | `#ECEAE4` | `#252935` | foreground 13.7 / 12.1 |
| Hover / active row | `--accent` | `#E4E2DB` | `#252935` | muted text 4.9 / 6.0 |
| Muted foreground | `--muted-foreground` | `#5A5F6B` | `#A3A6AF` | ≥ 4.9 on every surface |
| Input / control border | `--input` | `#858891` | `#6E727C` | ≥ 3.0 on card and background |
| Hairline (dividers only) | `--border` | `#DEDCD5` | `#2A2E38` | decorative, never the only cue |
| Focus ring | `--ring` | `#26619C` | `#93B8E6` | same as primary |
| Destructive | `--destructive` | `#B42318` | `#F97066` | 6.6 / 5.9 |
| Online | `--online` | `#2F7D4F` | `#5FBF84` | ≥ 3:1, a status dot only |

**Color rules**
- Lapis is for actions (buttons, links, focus) and your own messages. Nothing decorative.
- Green is only the online dot. Never a button.
- Hairlines separate regions; anything interactive also has an `--input` border, a fill, or text.
- Dark mode is its own palette, not an inversion: the bubble blue darkens, the accent lightens.

### Typography

| Role | Face | Use |
|------|------|-----|
| Display | **EB Garamond** 500/600, italic 400 | App name, page and room titles, empty-state headlines, marketing |
| Text | **Geist** 400/500/600 | Messages, controls, labels, body copy |
| Mono | **Geist Mono** 400/500 | Timestamps in X-ray, ids, code, technical labels |

- Loaded with `next/font/google` (`EB_Garamond`, `Geist`, `Geist_Mono`), so the files are
  self-hosted from our domain. **Never** link or `@import` Google Fonts: the CSP blocks it.
- CSS variables: `--font-heading` (Garamond), `--font-sans` (Geist), `--font-mono`.
- Garamond has a small x-height: never set it below 18px, and never for message text.
- Scale (rem at 16px): 0.75 · 0.8125 · 0.9375 (messages) · 1 · 1.25 · 1.5 · 2 · 3.
- Messages: Geist 15px / 1.45. Inputs are 16px on mobile so iOS does not zoom.
- Headings use `text-wrap: balance`; uppercase labels get `letter-spacing: 0.06em`.
- Numbers that line up (counts, times) use `tabular-nums`.

### Spacing

4px base. Tokens: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Lay out siblings with `gap`, not margins.
Side gutter is at least 16px on phones.

### Radius

`--radius: 0.625rem` (10px) for buttons and inputs. Bubbles 14px, with the corner nearest the
sender at 4px. Cards and dialogs 14px. Pills 999px.

### Elevation

Mostly flat: separation comes from fills and hairlines.
- Popovers and menus: `0 8px 24px rgb(20 22 28 / 0.12)` (light), a 1px `--border` ring (dark).
- Dialogs: same, plus an overlay of `rgb(20 22 28 / 0.45)`.
- No shadows on cards or bubbles.

### Motion

- 150 to 200ms, `ease-out`, for color, opacity and shadow only.
- **No transform on hover** (no `translateY`, no `scale`): it shifts layout.
- New messages fade in over 150ms. Under `prefers-reduced-motion`, no animation at all.

---

## Component Specs

All components are shadcn/ui (Base UI) styled through the tokens.

### Buttons
- **Primary:** `bg-primary text-primary-foreground`, 40px tall (44px touch target on mobile),
  `font-medium`. Hover: `brightness(1.08)` in light, `brightness(0.94)` in dark.
- **Secondary:** `bg-secondary text-foreground`, hover `bg-accent`.
- **Outline:** transparent with a `border-input` border.
- **Ghost:** icon buttons in headers and sidebars, hover `bg-accent`.
- **Destructive:** `bg-destructive text-white` (light) / `text-[#14161C]` (dark).
- Disabled: 50% opacity, `cursor-not-allowed`. Every clickable element has `cursor-pointer`.

### Inputs and composer
- `bg-card`, 1px `border-input`, radius 10px, 16px text on mobile.
- Focus: `outline: 2px solid var(--ring)`, offset 1px (never `outline: none` without a replacement).
- Composer: auto-growing textarea (1 to 6 lines), Send as a primary icon button with a label.

### Message bubbles
- Others: `bg-secondary text-foreground`, top-left corner 4px. Sender name and time above, `text-muted-foreground` 12px.
- Yours: `bg-[--bubble-mine] text-[--bubble-mine-foreground]`, right-aligned, top-right corner 4px.
- Pending: 62% opacity and "Sending…". Failed: a destructive "Not sent" line with Retry.
- Max width 82% on mobile, 68ch on desktop. `overflow-wrap: anywhere` for long links.

### Sidebar rows
- 36px tall, radius 8px, `hover:bg-accent`; active row `bg-accent font-medium`.
- Unread badge: pill `bg-primary text-primary-foreground`, 11px semibold, tabular numbers.

### Cards, dialogs, sheets
- Card: `bg-card`, 1px `border`, radius 14px, padding 24px, no shadow.
- Dialog: max-width 480px, padding 24px, Escape closes, focus is trapped and returned.
- Mobile drawer (sidebar): sheet from the left, swipe or Escape closes.

---

## Style Guidelines

**Style:** Minimal, editorial. Paper, ink and lapis; typography carries the personality.

**Keywords:** calm, literate, precise, quick, warm without being cute.

### Page pattern: landing (Phase 4)
Hero with the one-line pitch in Garamond > a **live, read-only preview of `#general`**
(real messages, updating in real time) > **Try as guest** and **Sign in with GitHub or Google** >
three short proof points (realtime, security page, X-ray). No video and no autoplay.

### App layout
- Desktop: three columns, sidebar 264px · chat · X-ray panel 360px (when on).
- Mobile: chat full-screen, sidebar as a drawer, composer pinned above the keyboard.

---

## Anti-Patterns (Do NOT Use)

- ❌ Emojis as icons. Use Lucide only.
- ❌ Google Fonts `<link>` or `@import`. Use `next/font`.
- ❌ Hover transforms that move layout (`translateY`, `scale`).
- ❌ Text below 4.5:1, or controls and borders below 3:1.
- ❌ Hairline-only inputs. Inputs use `--input`.
- ❌ `outline: none` without a visible focus replacement.
- ❌ Raw hex in components. Use tokens.
- ❌ Green buttons, gradients, or decoration with the accent color.
- ❌ Instant state changes. Use 150 to 200ms transitions (none under reduced motion).

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons; all icons from Lucide
- [ ] Fonts only through `next/font`; Garamond only for display text at ≥ 18px
- [ ] Colors only from tokens; new pairs measured (4.5:1 text, 3:1 UI)
- [ ] Works in **light and dark**, including the toggle overriding the system setting
- [ ] `cursor-pointer` on all clickable elements; hover transitions 150 to 200ms, no transforms
- [ ] Visible focus on every interactive element; full keyboard use (Enter, Shift+Enter, Escape, Ctrl/Cmd+K)
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive at 375, 768, 1024 and 1440px; no horizontal scroll; 16px minimum gutter
- [ ] Touch targets ≥ 44px on mobile; inputs 16px so iOS does not zoom
- [ ] No content hidden behind fixed headers or the mobile keyboard
- [ ] Skeletons match final layout (no layout shift); empty and error states written
