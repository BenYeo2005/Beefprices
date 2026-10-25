# Keeping the site up to date

You don't need to know any code. Claude does the work and tells you what changed.

## How to start

1. Open the **Claude** app, go to the **Code** tab and open the **Beef model** folder (or run `claude` in Terminal from this folder).
2. Type one of the requests below.
3. Read Claude's short summary of what changed, and say if anything looks wrong.

## Every week: "update the prices"

**When:** Thursday or Friday. AHDB publishes the previous week's prices by Wednesday, and Hereford Market's reports appear a day or two after each sale.

**What Claude does:**

1. Downloads AHDB's latest finished cattle (deadweight) prices.
2. Looks for new Hereford Market store cattle and calf reports, and copies in only the averages each report actually states.
3. Checks every Hereford figure against its report.
4. Opens the site to check it looks right.
5. Tells you the new latest prices, what moved, and anything it couldn't do.
6. Once the site is online (see PUBLISHING.md), saves a snapshot of the changes. You then click **Push origin** in GitHub Desktop to send them to the website.

It takes a few minutes.

## Once a month: "refresh the outlook"

**When:** around the end of each month, after the Met Office's new 3-month outlook comes out. The Outlook page shows the "next review due" date.

**What Claude does:**

1. Looks for newer reports from AHDB, Farmers Weekly, Irish prices, Rabobank, the NFU and the Met Office, plus feed and forage prices.
2. Rewrites the points on the Outlook page, using only figures the sources state, each with a link and date.
3. Sets a new review date.
4. Tells you what changed and why.

## Other things you can ask

- **"Add the latest Hereford Market reports"**: only the store cattle and calf prices.
- **"Check the site"**: opens each page and reports anything broken or out of date.
- **"Show me the site"**: opens it in the preview so you can look.

## The out-of-date warning

If the site isn't updated, a red warning appears at the top of every page:

- **Finished cattle prices:** when they're for a week more than 14 days ago.
- **Hereford Market prices:** when the reports haven't been checked for more than 14 days. The market only sells stores every 2–3 weeks, so it goes by when the reports were last checked, not the sale date.

Running "update the prices" clears it.

The Outlook page has its own red warning when its review date has passed.

## If something goes wrong

- **AHDB changed its spreadsheet:** the update script stops with a message saying the layout changed. Ask Claude to fix the script.
- **A Hereford figure doesn't match its report:** nothing is changed until it's fixed. Claude will tell you which row.
- **No new Hereford report:** that's normal between sales. The "last checked" date still updates.
