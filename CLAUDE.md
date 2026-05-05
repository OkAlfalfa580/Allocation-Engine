# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file, zero-build, browser-based stock allocation dashboard for Levi's apparel distribution. The entire app is `stock_allocation_dashboard.html` — HTML, CSS, and JS in one file. It runs by double-clicking the file (or serving it statically); there is no Node, no bundler, no package manager. The only runtime dependency is the SheetJS (`xlsx`) library, loaded from cdnjs.

To "run" or test: open `stock_allocation_dashboard.html` in a browser. To iterate: edit and reload. There are no tests, no lint, no build step.

## Domain inputs (what the user uploads)

The app's behavior is wholly defined by the shape of the three Excel files it ingests. Sample/golden copies live alongside the HTML and should be treated as the source of truth for expected schemas:

- **`LEVIS SS26 ORDER.xlsx`** — order sheet. Two formats are supported and auto-detected by `detectOrderFormat`:
  - **Long (AW-25 style)**: one row per retailer×product×size, with a `Size` and `Current Quantity` column.
  - **Wide (SS26 style)**: one row per retailer×product, with size columns (`25`,`26`,…,`XS`,`S`,`M`,…,`5XL` per `SIZE_COLS`). `unpivotOrderSheet` flattens this to long form. When wide format is detected, the season filter auto-switches to `SS-26`.
  - Preferred sheet names: `H2 25 ORDER FORM`, then `Sheet2`, then first sheet.
- **`SS26 BILLING DETAILS.xlsx`** — already-billed items. Sheet `Report` if present, else first sheet. **Headers are on row 2 (row 1 is blank)** — parsed with `range:1`. Filtered by `SEASON` column matching `state.seasonFilter`. Product code is taken from `PRODUCT CODE` if present, otherwise extracted as the first whitespace-delimited token of `ITEM NAME`.
- **`Template_Lot_Stock.xlsx`** — incoming lot stock to allocate. Column names are fuzzy-matched via regex in `findCol` (e.g. product code matches `/product.?code|item.?code|^article$/i`, qty matches `/qty|quantity|total|pieces|pcs/i`).

`LEVIS PARTY CODE.xlsx` is a reference file the user keeps for retailer codes; the app does not load it directly — retailer identity comes from the order sheet's `Party Name` + `Retailer Code` columns.

## Allocation pipeline (in `executeAllocation`)

The ~250-line `executeAllocation` function is the heart of the app and runs as a single synchronous pass with progress checkpoints. The stages are labeled A–G in comments; preserve those when editing:

1. **A — orderMap**: keyed by `partyName||productCode||size`. Duplicate keys are summed and warned.
2. **B — billedMap**: same key shape, filtered to the active season.
3. **C — pendingMap**: `netPending = ordered − billed`, clamped at 0; over-billed rows are flagged.
4. **D — lotMap**: keyed by `productCode||size` (no party). Quantities aggregated per article-size.
5. **E — Allocation loop**: for each lot key, find all `pendingMap` entries with matching product+size and `netPending > 0`, sort by `state.priority` rank (lower index = higher priority), then greedily fill `min(remaining, netPending)` until the lot key runs dry.
6. **F — Unallocated**: lot keys with leftover stock, annotated with a human-readable reason.
7. **G — Fulfilment rows**: per-row status derived from `(ordered, billed, allocated)` tuple — `FULLY BILLED`, `OVER-BILLED ⚠`, `PARTIALLY BILLED + ALLOCATED`, `ALLOCATED — PENDING BILL`, `PARTIALLY BILLED`, or `PENDING`. Billed-but-not-ordered rows (no matching order key) are appended at the end as `OVER-BILLED ⚠`.

The match key is `partyName||productCode||size` — all three must match exactly between order and billed files for billing offset to apply. Party-name mismatches between billed and order files are counted and warned but do not fail the run.

## UI architecture

Four-step wizard driven by a single `state` object (top of the `<script>` block, ~line 582). All step navigation goes through `goToStep` / `tryGoToStep`; users can jump back to completed steps but not skip ahead. Step transitions are gated by validation in `proceedToStep2` and `runAllocation`.

Output is two downloadable workbooks built with SheetJS (`downloadAllocationFile`, `downloadFulfilmentReport`), each with multiple sheets (detail + summaries). Filenames embed the lot name and today's date.

## Conventions worth preserving

- **No build step, no dependencies beyond the CDN'd `xlsx`.** Don't introduce a bundler, framework, or npm without explicit user direction — the single-file deliverable is the point.
- **Excel column names are matched fuzzily** (`findCol` + regex, plus arrays of fallback names like `r['PARTY NAME']||r['Party Name']`). When adding new fields, follow the same pattern rather than assuming exact headers.
- **`SIZE_COLS`** (line ~578) is the canonical size vocabulary used both for unpivoting and for size normalization. Update it in one place.
- **`templateDownloads` embed `[NOTE]` rows** explaining the schema to end users — keep these in sync if the parser's expectations change.
- **`.claude/settings.local.json`** allows `python`, `python3`, `pip install`, and `file:*` Bash commands, suggesting prior sessions used Python for ad-hoc xlsx inspection. Use that for one-off data probes if needed.
