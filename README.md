# Beef price dashboard

A simple website showing beef prices for steers and heifers: today's prices, price history and price outlook.

## How to look at the site on your computer

The pages read their prices from the files in the `data` folder. Web browsers won't let a page do that if you just double-click it, so you run a small built-in "local server" first:

1. Open **Terminal** (press Cmd+Space, type "Terminal" and press Return).
2. Paste this line and press Return:

   ```bash
   cd "/Users/benyeo/Beef model" && python3 -m http.server 8000
   ```

3. In your web browser, go to **http://localhost:8000**
4. When you've finished, go back to Terminal and press **Ctrl+C**.

The History page's charts need an internet connection, because the charting tool (Chart.js) loads from the web.

## Keeping it up to date

See [UPDATING.md](UPDATING.md). In short: open Claude Code in this folder and say "update the prices" each week, and "refresh the outlook" each month.

## Weekly update: finished cattle prices (AHDB)

AHDB publishes each week's prices by the following Wednesday. On Thursday, in Terminal:

```bash
cd "/Users/benyeo/Beef model" && python3 scripts/update_ahdb.py
```

This downloads AHDB's weekly and monthly spreadsheets into `data/raw/`, then rewrites `data/deadweight_weekly.csv` and `data/deadweight_monthly.csv`. It also records the dates in `data/sources.csv`.

## After each Hereford Market sale: store cattle and calves

Hereford Market's reports are PDFs, and the wording changes from week to week, so these figures are added by hand rather than by a script:

- **Store cattle** (Thursday sales, every 2–3 weeks): add two rows to `data/hereford_store_cattle.csv`, Steers and Heifers, with the "Averages" figures (£ per head and p/kg) from the report.
- **Rearing calves** (Tuesday sales): add rows to `data/hereford_calves.csv` for "Bull calves" and "Heifer calves", or "All calves" if the report gives only one overall average. Include the number sold if the report states it.
- Put the report's web address in `report_url`.
- If the report gives no average, add nothing.
- Then change `covers_to` for that dataset in `data/sources.csv`.

`scripts/hereford.py` helps: `new` lists and downloads unchecked reports, `mark` records them as checked, and `check` confirms every figure appears in its report, then updates `data/sources.csv`.

Or just ask Claude: "add the latest Hereford Market reports".

## Monthly update: the Price outlook page

All the words on the Outlook page live in `data/outlook.json`. Each month:

1. Check each source for anything newer: the AHDB beef market outlook, AHDB market updates, Farmers Weekly, Irish prices, Rabobank, the Met Office 3-month outlook (issued near the end of each month), feed wheat and hay/straw prices.
2. Edit the `summary`, `up`, `down`, `watch` and `dairy_cross` points. Each point has `text` and a list of `sources` ids.
3. Add any new source to the `sources` list with its `title`, `publisher`, `url` and `published` date (YYYY-MM-DD, or YYYY-MM if only a month is given).
4. Only write figures that appear in the source.
5. Change `last_reviewed` and `next_review_due`. The page shows a red warning once the review date has passed.

Or just ask Claude: "update the outlook for this month".

The grade gaps on the Outlook page are worked out live from the AHDB files, so they don't need editing. The "no consistent seasonal pattern" note on the History and Outlook pages is fixed text (checked October 2026); see CLAUDE.md.

## Where the data comes from

| File | What's in it | Source |
|---|---|---|
| `data/deadweight_weekly.csv` | Weekly deadweight prices (pence per kg of carcase) for steers and heifers, from January 2019. Regions: Great Britain, England and Wales, Scotland, Central, Northern, Southern. Grades: R3, R4L, R4H, O+3, O+4L, O+4H, −O3, −O4L, −O4H, plus the average across all grades. | [AHDB, GB deadweight cattle prices](https://ahdb.org.uk/beef/gb-deadweight-cattle-prices) |
| `data/deadweight_monthly.csv` | Monthly deadweight averages for steers and heifers, from January 2014: R3, R4L and all grades. Great Britain, England and Wales, Scotland. | [AHDB, GB deadweight cattle prices](https://ahdb.org.uk/beef/gb-deadweight-cattle-prices) |
| `data/hereford_store_cattle.csv` | Average price (£ per head and p/kg liveweight) for all store steers and all store heifers at each Hereford Market store cattle sale, from December 2025. All breeds and ages. | [Hereford Market sale reports](https://www.herefordmarket.co.uk/market-reports/), one report link per row |
| `data/hereford_calves.csv` | Average £ per head for rearing calves at each Hereford Market Tuesday sale, from December 2025. All breeds. | [Hereford Market sale reports](https://www.herefordmarket.co.uk/market-reports/), one report link per row |
| `data/outlook.json` | The words on the Price outlook page, with a source and published date for every point. Reviewed monthly. | Listed inside the file |
| `data/sources.csv` | When each dataset was published, which dates it covers, and when it was added here. | — |

Blank cells mean the source had no price. They are never filled in with estimates.
