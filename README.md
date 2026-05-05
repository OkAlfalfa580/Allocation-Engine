# Allocation Engine

A browser-based stock allocation dashboard for Levi's apparel distribution. Takes a retailer order book, a billing history, and an incoming lot of stock — produces a priority-driven allocation plan and a fulfilment report.

No build step, no server, no install. Open the HTML file in any modern browser.

## Quick start

1. Download or clone this repo.
2. Open `stock_allocation_dashboard.html` in Chrome / Edge / Firefox.
3. Walk through the four-step wizard:
   1. **Upload** the three Excel files (order sheet, billing report, lot stock).
   2. **Set retailer priority** — rank 1 receives stock first from each lot.
   3. **Review configuration.**
   4. **Run allocation** and download the results.

## Input files

The dashboard expects three `.xlsx` files. Templates can be downloaded from inside the app (or use `Template_Lot_Stock.xlsx` in this repo as a starting point for the lot file).

| File | Purpose | Notes |
|------|---------|-------|
| Order sheet | All open retailer orders by SKU and size | Two formats supported and auto-detected: **long** (one row per size, with `Size` + `Current Quantity` columns) and **wide** (one column per size — `25`,`26`,…,`XS`,`S`,`M`,…,`5XL`). Sheet name: `H2 25 ORDER FORM` or `Sheet2`. |
| Billing report | Already-billed lines, used to subtract from open orders | **Headers must be on row 2** (row 1 blank). Sheet `Report`. Filtered by the `SEASON` column matching the season set in the UI. |
| Lot stock | The incoming lot to be allocated | Column names are matched fuzzily — any header containing "product code" / "qty" / "size" works. |

The match key across all three files is `Party Name` + `Product Code` + `Size`. These must align exactly for billing offsets to apply.

## Outputs

Two Excel workbooks, downloadable from the results screen:

- **`Allocation_<lot>_<date>.xlsx`** — allocation detail, summary by retailer, unallocated stock.
- **`Fulfilment_Report_<lot>_<date>.xlsx`** — full fulfilment status (`PENDING` / `ALLOCATED — PENDING BILL` / `PARTIALLY BILLED` / `FULLY BILLED` / `OVER-BILLED ⚠`), summaries by retailer and category.

## How allocation works

For each `(product code, size)` in the lot, the engine finds every retailer with `ordered − billed > 0`, sorts them by the priority you set, and greedily fills `min(remaining lot stock, retailer's net pending)` until the lot key is exhausted. Leftovers are reported as unallocated with a reason (no demand / all billed / excess stock).

## Tech

Single HTML file. Vanilla JS. [SheetJS](https://sheetjs.com/) (loaded from cdnjs) for `.xlsx` parsing and writing. No backend — all processing happens in the browser; uploaded files never leave your machine.

See [`CLAUDE.md`](CLAUDE.md) for an architecture deep-dive aimed at AI coding assistants.
