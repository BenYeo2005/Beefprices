# Beef Price Dashboard — Project Brief

A beef price dashboard website for a beef finishing farm in north Herefordshire (near Leominster).

## Working with the owner

- The owner knows very little coding. Explain what you are doing in plain English as you go.
- Keep the technical setup as simple as possible. No build tools, frameworks or package managers unless there is no simpler way.

## About the farm

- They buy dairy-cross beef calves and rear and finish them:
  - Belgian Blue x Holstein Friesian
  - Hereford x Holstein Friesian
- They keep **steers and heifers only**. Ignore cows and young bulls in all data.
- They are deciding whether to **sell as stores** (around 12–14 months old) or **keep and finish** them. The site must help compare:
  - finished (deadweight) prices
  - store cattle prices
  - calf prices
- Dairy-cross cattle typically grade around **O+ to R−**, and Hereford crosses tend to finish fatter.
  Always show realistic grades for these cattle alongside the R4L reference price, not just R4L on its own.

- Calves come from a nearby dairy at a fixed, cheap price. Market calf prices are only a comparison, not the farm's cost, and the site should say so.
- Never compare deadweight p/kg (carcase, AHDB finished prices) with liveweight p/kg (live animal, auction stores and calves) as if they were the same. Label every per-kg figure as deadweight or liveweight, and compare per head.
- Background: the farm started about 2 years ago (around late 2024) and has not finished any cattle yet. It has no sale records of its own, so the dashboard uses market data only. Don't change the dashboard because of this.

## About the users

- Farmers, mostly viewing on a **phone**. Design mobile-first.
- Plain English. Large, easy-to-read numbers.
- The farmers know farming terms (R4L, deadweight, stores, prime, AHDB and so on), so these need no long explanations; a short glossary is enough. Never use computer or website jargon on the site (file names, "CSV", "README", "loading", "browser storage" and so on). Error messages should say what to do in plain words.
- The owner has little technical knowledge, so explain computer steps simply when talking to them.
- Show changes with **green up arrows** and **red down arrows**.

## The site

- A static website: HTML, CSS and JavaScript, with **Chart.js** for charts.
- No server and no database. Hosted free on **GitHub Pages**. The owner publishes with GitHub Desktop (steps in PUBLISHING.md). Pages carry `noindex`, and there's a `robots.txt`, but the site and repository are public.
- All price data is stored in simple **CSV files in a `/data` folder**.
- Three pages:
  1. **Today's prices**
  2. **Price history**
  3. **Price outlook**
- **Every number shows the date it relates to and its source.**

## Data sources (researched 25 Oct 2026, re-check before relying on this)

- **Finished (deadweight) prices:** AHDB weekly Excel file, steers and heifers sheets, from January 2019, published by the Wednesday after each week ends (Sunday to Saturday):
  https://projectblue.blob.core.windows.net/media/Default/Market%20Intelligence/beef/D&A/Prices/Deadweight/Weekly%20deadweight%20cattle%20prices.xlsx
  The regional sheets cover -U, R, O+ and -O in fat classes 3, 4L and 4H. The regions are GB, England and Wales, Scotland, Central, Northern and Southern. Which region Herefordshire falls in is not confirmed.
  `scripts/update_ahdb.py` downloads the weekly and monthly files and writes:
  - `data/deadweight_weekly.csv`: all 6 regions, grades R/O+/−O × 3/4L/4H
  - `data/deadweight_monthly.csv`: from Jan 2014, GB, England and Wales, Scotland, with R3, R4L and all grades only
  - `data/sources.csv`

  Run it weekly on Thursday. AHDB data is Great Britain only (Northern Ireland is not included), and nothing in these files goes back before 2014.
  The GB grid has no separate "R−" grade, because R is one band. The monthly file (R3 and R4L) goes back to January 2014.
- **Liveweight (auction, p/kg live) prices:** AHDB stopped publishing national auction prices from 1 January 2024, so there is no free national liveweight series after 2023. Local liveweight figures come from mart reports, e.g. Hereford store cattle p/kg and Ross-on-Wye finished cattle via the Ross Gazette. Any older AHDB auction files the owner sends are history only, and must be labelled as ending in December 2023.
- **Files from the owner:** keep each file they send unchanged in `/data/raw/`, recording the original filename, where it came from and the date it was downloaded.
- **AHDB licence:** the data is for "internal business purposes only", and further publication needs AHDB's written permission. The owner has decided the site is for private viewing by them and their farmers (25 Oct 2026). Note that a free GitHub Pages site can still be opened by anyone who has the address.
- **Store cattle and calves:** there has been no free national series since January 2024 (LAA data went commercial). LAA subscriptions forbid republishing.
  Best local source: Hereford Market PDF reports at https://www.herefordmarket.co.uk/market-reports/ (store cattle sales every 2–3 weeks on Thursdays, rearing calves weekly on Tuesdays). The PDF filenames are inconsistent, so take the figures by hand.
  These go into `data/hereford_store_cattle.csv` and `data/hereford_calves.csv`, from Dec 2025 (the earliest report online), with one report URL per row. Copy only the averages the report states. If a report gives none, add no row. If a figure is an obvious misprint, leave it blank and say why in `notes`. To check figures against the PDFs, extract the text with macOS PDFKit (a Swift script). Neither pdftotext nor pypdf is installed.

## Outlook page

- The content lives in `data/outlook.json`: summary, up, down, watch and dairy_cross points, plus a sources list with a published date for each. Review it monthly; the `next_review_due` date shows on the page.
- Only state figures that appear in a fetched source. Things that don't clearly push the price one way (feed, forage, weather) go in "watch", not in the up or down columns.
- Anything from the owner's own knowledge (e.g. dairy-crosses grading O+ to R) must be labelled as the farm's experience, not as a published fact.
- Use the UK NFU (nfuonline.com), not the US National Farmers Union.

## Update routines (the owner will just say these words; see UPDATING.md for their version)

Keep a task list, explain each step in plain English, and finish with a short summary: the new latest prices, what moved, and anything not done.

### "update the prices" (weekly)

1. `python3 scripts/update_ahdb.py`. If it stops saying the layout changed, fix the script; don't hand-edit the CSVs.
2. `python3 scripts/hereford.py new`. For each new report:
   - Read the printed lines, and the full text file if needed.
   - Add a row to `data/hereford_store_cattle.csv` (Steers and Heifers: £/head and p/kg from the "Averages" lines) and/or `data/hereford_calves.csv` (Bull calves / Heifer calves, or All calves when only an overall average is given; head count only if stated).
   - Copy figures exactly as printed, with the report URL. If a report gives no average, add no row. If a figure is an obvious misprint, leave it blank and explain in `notes`.
   - Only store cattle sales and rearing calves. Not weaned or suckled calves, bulls, cows or sheep.
3. `python3 scripts/hereford.py mark` (records the reports as checked, including ones with no average).
4. `python3 scripts/hereford.py check`. It must say "All figures match". It then updates the Hereford rows in `data/sources.csv`. Run it even when there were no new reports, so the "last checked" date moves on and the out-of-date warning stays off.
5. Start the preview (`beef-site` in `.claude/launch.json`) and check the Today page at phone and laptop width: no "out of date" banner, no errors, and the new dates are shown.
6. Tell the owner the latest R4L and O+4L steer and heifer prices (with week ending date), the latest Hereford store and calf averages (with sale dates), and the changes.
7. If the folder is a git repository (the site is published with GitHub Pages; see PUBLISHING.md), commit the changed files with a message like "Weekly price update – week ending DD Month YYYY". Then tell the owner to click **Push origin** in GitHub Desktop. Don't push yourself unless they ask. `data/raw/`, `screenshots/` and `.claude/` are git-ignored on purpose.

The "refresh the outlook" routine ends with the same commit step.

### "refresh the outlook" (monthly)

1. Read `data/outlook.json`. For each topic, search for anything newer than its source:
   - the AHDB beef market outlook and beef market updates
   - the AHDB weekly cattle wrap and retail performance
   - Farmers Weekly and Farmers Guardian
   - Irish prices (IFA, Bord Bia, AHDB's GB–Irish gap)
   - Rabobank
   - the UK NFU (nfuonline.com)
   - the Met Office 3-month outlook (issued near the end of each month, as a PDF; render the page as an image to read it)
   - AHDB arable report (feed wheat) and AHDB hay and straw prices
2. Fetch each source you use and confirm its published date and figures. Only write what the source says.
3. Update the points, remove ones that are out of date, and add any new sources to `sources`. Keep the summary to 2–3 sentences with no price prediction.
4. Set `last_reviewed` to today and `next_review_due` to about a month later.
5. Check the Outlook page in the preview, and that JSON is valid (`python3 -c "import json;json.load(open('data/outlook.json'))"`).
6. Tell the owner what changed and which sources are new.

### Out-of-date warning

`js/common.js` shows a red banner on every page if AHDB's latest week is more than 14 days old, or the Hereford reports were last checked more than 14 days ago. Test it with `?asof=YYYY-MM-DD` on the page address.

## Rules (must always follow)

- **Never invent prices, figures or quotes.** If data isn't available, say so clearly on the page.
- **Every claim on the outlook page must link to a real, dated source.**
