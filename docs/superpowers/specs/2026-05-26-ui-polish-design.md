# UI Polish & Animation Design
**Date:** 2026-05-26
**File:** `index.html` (single-file, zero-build, vanilla JS + inline CSS)

---

## Decisions

| Question | Answer |
|---|---|
| Animation feel | Subtle & confident — smooth, never distracting |
| Theme | Warm Cream body, dark header stays unchanged |
| Approach | B — CSS overhaul + lightweight JS micro-interactions (~80 lines) |

---

## 1. Colour System

The entire colour swap is achieved by changing CSS custom property values in `:root`. The header uses a hardcoded `rgba(9,9,9,0.92)` background and requires no change.

| Token | Old (Dark) | New (Warm Cream) | Notes |
|---|---|---|---|
| `--dark` | `#090909` | `#F5F0E8` | Page background |
| `--surface` | `#111111` | `#EDE8DF` | Step bar, log box, table wrap |
| `--card` | `#161616` | `#FDFAF5` | Upload cards, config cards |
| `--card2` | `#1c1c1c` | `#E8E2D8` | Table header, hover states |
| `--border` | `#252525` | `#D8D0C4` | Default borders |
| `--border2` | `#303030` | `#C8BEB0` | Input borders, secondary borders |
| `--muted` | `#4a4a4a` | `#A8A090` | Disabled / very faint text |
| `--text` | `#EDEAE5` | `#1C1410` | Primary text |
| `--sub` | `#777777` | `#7A6E62` | Secondary / label text |
| `--red` | `#E8192C` | `#C8102E` | Slightly deeper — better contrast on cream |
| `--green` | `#1DB954` | `#2A7A45` | Darker — readable on light background |
| `--amber` | `#F5A623` | `#B86A10` | Darker for light bg readability |
| `--blue` | `#4A9EFF` | `#1A4E8C` | Darker for light bg readability |
| `--purple` | `#9B59B6` | `#6A3890` | Darker for light bg readability |

---

## 2. CSS Animations

All implemented via `@keyframes` and `transition` — no external library.

### 2a. Panel Transitions
- **Current:** `fadeUp` with `ease` easing
- **New:** Same keyframe, easing changed to `cubic-bezier(0.22, 1, 0.36, 1)` (spring-like, overshoots slightly then settles)
- Duration stays at `0.28s`

### 2b. Upload Cards
- **Hover:** `transform: translateY(-2px)` + `box-shadow: 0 4px 16px rgba(0,0,0,0.08)` — lifts gently
- **Loaded success:** A single green shimmer sweep using `@keyframes shimmer` on a `::after` pseudo-element (`background: linear-gradient` swept across, `animation-fill-mode: forwards`, plays once)
- **Error shake:** `@keyframes shake` — 3 horizontal oscillations over 400ms, triggered by adding `.shake` class in JS then removing after animation ends

### 2c. Progress Bar
- **Running state:** Right edge gets `box-shadow: 2px 0 8px var(--red)` — appears when width > 0, removed on completion
- Add class `.running` to `.progress-bar` during allocation, remove on done

### 2d. Primary Button Ripple
- `::after` pseudo-element, `border-radius: 50%`, `transform: scale(0) → scale(3)`, `opacity: 0.15 → 0`
- Triggered by `:active` state — pure CSS, no JS needed

### 2e. Run Button Pulse (while running)
- Add `.pulsing` class to `#runBtn` during allocation
- `@keyframes pulse-border`: border-color and box-shadow oscillate between base and red glow, `2s infinite`
- Remove class when allocation completes

### 2f. Input Focus Ring
- Replace default focus outline with an animated bottom border: `box-shadow: 0 2px 0 var(--red)` appears on focus via `transition: border-color 0.15s, box-shadow 0.15s`
- Applied directly on `.text-input:focus` — no HTML changes required

### 2g. Priority List Hover Accent
- `::before` pseudo on `.priority-item`: `width: 2px`, `background: var(--red)`, `transform: scaleY(0) → scaleY(1)` on hover, `0.15s ease`

### 2h. Toast Notification
- **Current:** `opacity + translateY` transition
- **New:** Add slight overshoot: `cubic-bezier(0.34, 1.56, 0.64, 1)` (bouncy) on entry, `ease` on exit

---

## 3. Surface Polish

Visual refinements that make the cream theme feel intentional:

- **Upload cards:** Add `box-shadow: 0 1px 4px rgba(28,20,16,0.07)` — replaces pure border feel with slight elevation
- **Stat cards:** `box-shadow: 0 2px 8px rgba(28,20,16,0.06)`, top colour strip increases from `2px → 3px`
- **Download cards:** Same shadow treatment as stat cards
- **Table headers:** Background `var(--card2)` with a `2px` bottom border in `var(--border2)` for more separation
- **Step bar active item:** Adds a `3px` left border in `var(--red)` that sweeps in via `scaleY` animation
- **Scrollbar:** Thumb colour updated to `var(--border2)`, track to `var(--surface)` — blends with cream theme

---

## 4. JS Micro-interactions (~80 lines, added to existing `<script>` block)

### 4a. Stat Counter Animation
- Triggered when `goToStep(4)` is called (results screen appears)
- For each `.stat-value` element, reads the final number from `textContent`, then animates from `0` to that value over `800ms` using `requestAnimationFrame` with `easeOutCubic`
- Handles locale formatting (`.toLocaleString()`) on each frame
- Falls back gracefully if value is not numeric

### 4b. Log Line Slide-in
- Modified `log()` function: new lines get `style="opacity:0; transform:translateX(-8px)"` on creation, then transition to `opacity:1; transform:translateX(0)` via `requestAnimationFrame` on next tick
- Duration: `180ms ease`

### 4c. Upload Card Error Shake
- Modified `setFileStatus()`: when `type === 'err'`, add `.shake` class to the card
- `.shake` triggers the `@keyframes shake` animation
- `animationend` listener removes the class so it can re-trigger on subsequent errors

### 4d. Run Button Pulse
- `runAllocation()` adds `.pulsing` to `#runBtn`
- After `executeAllocation()` resolves (success or error), `.pulsing` is removed

---

## 5. What Does NOT Change

- Allocation logic (`executeAllocation`, all A–G stages) — untouched
- Google Sheets integration — untouched
- File upload / parsing logic — untouched
- Output workbook generation — untouched
- HTML structure — completely unchanged
- No new dependencies added

---

## Implementation Notes

- All changes are confined to the `<style>` block and the `<script>` block of `index.html`
- Colour changes take effect globally via `:root` token swap — no per-component colour overrides needed
- The `shake` class must be removed after the animation ends to allow re-triggering; use `addEventListener('animationend', ...)` once
