"""Download AHDB's deadweight cattle prices and turn them into simple CSV files.

How to run (from the "Beef model" folder, in Terminal):
    python3 scripts/update_ahdb.py

What it does:
  1. Downloads AHDB's weekly and monthly "deadweight cattle prices" Excel files into data/raw/.
  2. Takes only steers and heifers (cows and young bulls are ignored).
  3. Writes:
       data/deadweight_weekly.csv  - weekly from January 2019, every region AHDB reports,
                                     R4L plus the grades our cattle usually get
       data/deadweight_monthly.csv - monthly from January 2014, R3 and R4L only (all AHDB gives monthly)
     and updates data/sources.csv.

These are Great Britain figures (England, Wales and Scotland). Northern Ireland is not included.
Nothing is invented: if AHDB leaves a price blank (or shows "-"), the CSV cell is left blank.
Uses only Python's built-in tools, so nothing extra needs installing.
"""

import csv
import datetime
import os
import re
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

BASE = ("https://projectblue.blob.core.windows.net/media/Default/Market%20Intelligence/"
        "beef/D&A/Prices/Deadweight/")
PAGE_URL = "https://ahdb.org.uk/beef/gb-deadweight-cattle-prices"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SOURCES_FILE = os.path.join(DATA, "sources.csv")

FILES = {
    "weekly": ("Weekly%20deadweight%20cattle%20prices.xlsx", "ahdb_weekly_deadweight_cattle_prices.xlsx"),
    "monthly": ("Monthly%20deadweight%20cattle%20prices.xlsx", "ahdb_monthly_deadweight_cattle_prices.xlsx"),
}

WEEKLY_SHEETS = {"Steers": "Steers regional series", "Heifers": "Heifers regional series"}
MONTHLY_SHEETS = ["Great Britain", "England and Wales", "Scotland"]
# R4L is the reference; the rest are what dairy-cross cattle usually grade (fatter 4H for Hereford crosses).
GRADES = ["R3", "R4L", "R4H", "O+3", "O+4L", "O+4H", "-O3", "-O4L", "-O4H"]

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

COMMON_NOTES = ("Pence per kg deadweight (carcase weight), excluding VAT, UK dressing specification, "
                "before deductions. Great Britain abattoirs slaughtering over 20,000 cattle a year. "
                "Northern Ireland not included.")


def download(kind):
    remote, local = FILES[kind]
    path = os.path.join(DATA, "raw", local)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print(f"Downloading AHDB {kind} file...")
    with urllib.request.urlopen(BASE + remote, timeout=60) as response, open(path, "wb") as out:
        out.write(response.read())
    return path


def read_sheets(path, wanted):
    """Return {sheet name: list of rows}, each row a {column letter: text} dict."""
    book = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in book.namelist():
        for item in ET.fromstring(book.read("xl/sharedStrings.xml")).iter(NS + "si"):
            shared.append("".join(t.text or "" for t in item.iter(NS + "t")))

    rels = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels}
    workbook = ET.fromstring(book.read("xl/workbook.xml"))

    sheets = {}
    for sheet in workbook.iter(NS + "sheet"):
        name = sheet.get("name").strip()
        if name not in wanted:
            continue
        target = targets[sheet.get(REL_NS + "id")].lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        rows = []
        for row in ET.fromstring(book.read(target)).iter(NS + "row"):
            cells = {}
            for cell in row.iter(NS + "c"):
                value = cell.find(NS + "v")
                if value is None:
                    continue
                text = shared[int(value.text)] if cell.get("t") == "s" else value.text
                cells[re.sub(r"\d", "", cell.get("r"))] = (text or "").strip()
            rows.append(cells)
        sheets[name] = rows
    missing = [w for w in wanted if w not in sheets]
    if missing:
        sys.exit(f"Could not find the sheet(s) {missing}. AHDB may have changed the file layout.")
    return sheets


def col_number(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def excel_date(serial):
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(serial)))).isoformat()


def price(text):
    try:
        return f"{float(text):.1f}"
    except (TypeError, ValueError):
        return ""  # blank or "-" in AHDB's file: leave it blank


def last_updated_in(rows):
    for cells in rows:
        for text in cells.values():
            if text.startswith("Last updated:"):
                return text.split(":", 1)[1].strip()
    return ""


def convert_weekly(sheets):
    out_rows, last_updated = [], ""
    for category, sheet_name in WEEKLY_SHEETS.items():
        rows = sheets[sheet_name]
        last_updated = last_updated_in(rows) or last_updated
        header = None
        for cells in rows:
            if header is None:
                if "Week ending" in cells.values():
                    header = {text.replace("\n", " "): col for col, text in cells.items()}
                    missing = [g for g in GRADES + ["Region", "Overall price**"] if g not in header]
                    if missing:
                        sys.exit(f"Columns missing from '{sheet_name}': {missing}. AHDB may have changed the layout.")
                continue
            region = cells.get(header["Region"], "")
            week = cells.get(header["Week ending"], "")
            if not region or not week:
                continue
            out_rows.append({
                "week_ending": excel_date(week),
                "category": category,
                "region": region,
                "all_grades": price(cells.get(header["Overall price**"])),
                **{g: price(cells.get(header[g])) for g in GRADES},
            })
    out_rows.sort(key=lambda r: (r["week_ending"], r["category"], r["region"]))
    return out_rows, last_updated


def convert_monthly(sheets):
    """Each regional sheet has a row naming the category (Steers, Heifers...) above a row of grades."""
    out_rows, last_updated = [], ""
    for region, rows in sheets.items():
        last_updated = last_updated_in(rows) or last_updated
        columns = None
        for i, cells in enumerate(rows):
            if columns is None:
                if "Month" in cells.values():
                    grade_row = rows[i + 1]
                    columns, category = {}, ""
                    for col in sorted(grade_row, key=col_number):
                        category = cells.get(col) or category
                        if category in ("Steers", "Heifers"):
                            columns[(category, grade_row[col])] = col
                    if not all((c, g) in columns for c in ("Steers", "Heifers") for g in ("R3", "R4L", "Overall")):
                        sys.exit(f"Monthly sheet '{region}' layout has changed.")
                    month_col = next(col for col, text in cells.items() if text == "Month")
                continue
            month = cells.get(month_col, "")
            if not re.fullmatch(r"\d+(\.0)?", month):
                continue
            for category in ("Steers", "Heifers"):
                row = {
                    "month": excel_date(month)[:7],
                    "category": category,
                    "region": region,
                    "all_grades": price(cells.get(columns[(category, "Overall")])),
                    "R3": price(cells.get(columns[(category, "R3")])),
                    "R4L": price(cells.get(columns[(category, "R4L")])),
                }
                if row["all_grades"] or row["R4L"]:
                    out_rows.append(row)
    out_rows.sort(key=lambda r: (r["month"], r["category"], r["region"]))
    return out_rows, last_updated


def write_csv(path, rows):
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def update_sources(new_entries):
    fields = ["dataset", "file", "source", "source_url", "covers_from", "covers_to",
              "source_last_updated", "downloaded_on", "notes"]
    replaced = {e["dataset"] for e in new_entries}
    entries = []
    if os.path.exists(SOURCES_FILE):
        with open(SOURCES_FILE, newline="") as f:
            entries = [r for r in csv.DictReader(f) if r["dataset"] not in replaced]
    entries = new_entries + entries
    with open(SOURCES_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(entries)


if __name__ == "__main__":
    offline = "--no-download" in sys.argv
    raw = {k: os.path.join(DATA, "raw", v[1]) for k, v in FILES.items()}
    if not offline:
        raw = {k: download(k) for k in FILES}
    today = datetime.date.today().isoformat()

    weekly, weekly_updated = convert_weekly(read_sheets(raw["weekly"], list(WEEKLY_SHEETS.values())))
    monthly, monthly_updated = convert_monthly(read_sheets(raw["monthly"], MONTHLY_SHEETS))
    if not weekly or not monthly:
        sys.exit("No steer or heifer rows found. AHDB may have changed the file layout.")

    write_csv(os.path.join(DATA, "deadweight_weekly.csv"), weekly)
    write_csv(os.path.join(DATA, "deadweight_monthly.csv"), monthly)
    update_sources([
        {"dataset": "deadweight_weekly", "file": "data/deadweight_weekly.csv",
         "source": "AHDB, GB deadweight cattle prices (weekly file)", "source_url": PAGE_URL,
         "covers_from": weekly[0]["week_ending"], "covers_to": weekly[-1]["week_ending"],
         "source_last_updated": weekly_updated, "downloaded_on": today,
         "notes": COMMON_NOTES + " AHDB notes sample size changes from week ending 21 Oct 2023 and 5 Oct 2024."},
        {"dataset": "deadweight_monthly", "file": "data/deadweight_monthly.csv",
         "source": "AHDB, GB deadweight cattle prices (monthly file)", "source_url": PAGE_URL,
         "covers_from": monthly[0]["month"], "covers_to": monthly[-1]["month"],
         "source_last_updated": monthly_updated, "downloaded_on": today,
         "notes": COMMON_NOTES + " Monthly averages; AHDB gives only R3, R4L and the all-grades average monthly."},
    ])
    print(f"Weekly: {len(weekly)} rows, weeks {weekly[0]['week_ending']} to {weekly[-1]['week_ending']} "
          f"(AHDB last updated {weekly_updated}).")
    print(f"Monthly: {len(monthly)} rows, months {monthly[0]['month']} to {monthly[-1]['month']} "
          f"(AHDB last updated {monthly_updated}).")
