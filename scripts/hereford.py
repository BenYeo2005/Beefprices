"""Helpers for adding Hereford Market store cattle and calf prices.

Hereford Market's reports are PDFs worded differently each week, so the figures are
copied into the CSV files by hand (or by Claude). This script does the fiddly parts:

    python3 scripts/hereford.py new
        Finds reports on the Hereford Market website that haven't been checked yet,
        downloads them into data/raw/hereford/, and prints the lines that hold averages.

    python3 scripts/hereford.py mark
        Records those reports as checked (in data/hereford_checked.txt), including ones
        that gave no average, so they aren't shown again.

    python3 scripts/hereford.py check
        Confirms every figure in data/hereford_store_cattle.csv and data/hereford_calves.csv
        appears in its report with the right sale date. If all is well, updates the
        Hereford rows in data/sources.csv (latest sale and the date checked).

Needs a Mac: PDF text is read with macOS's built-in PDFKit (scripts/pdftext.swift).
"""

import csv
import datetime
import os
import re
import subprocess
import sys
import urllib.request

SITE = "https://www.herefordmarket.co.uk/"
LISTING = SITE + "market-reports/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
RAW = os.path.join(DATA, "raw", "hereford")
CHECKED = os.path.join(DATA, "hereford_checked.txt")
STORE_CSV = os.path.join(DATA, "hereford_store_cattle.csv")
CALF_CSV = os.path.join(DATA, "hereford_calves.csv")
SOURCES = os.path.join(DATA, "sources.csv")
PDFTEXT = os.path.join(ROOT, "scripts", "pdftext.swift")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (beef price dashboard)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def report_urls(pages=3):
    """Cattle and calf report PDFs listed on the first few pages of the reports page (newest first)."""
    found = []
    for page in range(1, pages + 1):
        url = LISTING if page == 1 else f"{LISTING}page/{page}/"
        html = fetch(url).decode("utf-8", "ignore")
        for path in re.findall(r"wp-content/uploads/[^\"']+?\.pdf", html):
            name = path.rsplit("/", 1)[1].lower()
            if re.search(r"cat|calf|store", name) and "breeding" not in name:
                full = SITE + path
                if full not in found:
                    found.append(full)
    return found


def checked():
    if not os.path.exists(CHECKED):
        return set()
    return {line.strip() for line in open(CHECKED) if line.strip()}


def local_text(url):
    """Download a report (if needed) and return its text."""
    os.makedirs(RAW, exist_ok=True)
    name = url.split("wp-content/uploads/")[1].replace("/", "_")
    pdf = os.path.join(RAW, name)
    txt = pdf[:-4] + ".txt"
    if not os.path.exists(pdf):
        with open(pdf, "wb") as f:
            f.write(fetch(url))
    if not os.path.exists(txt):
        out = subprocess.run(["swift", PDFTEXT, pdf], capture_output=True, text=True)
        if out.returncode != 0:
            sys.exit(f"Could not read text from {pdf}: {out.stderr.strip()}")
        with open(txt, "w") as f:
            f.write(out.stdout)
    return open(txt, encoding="utf-8", errors="ignore").read()


def cmd_new():
    done = checked()
    new = [u for u in report_urls() if u not in done]
    if not new:
        print("No new Hereford Market cattle or calf reports since the last check.")
        return
    print(f"{len(new)} new report(s):\n")
    for url in new:
        text = local_text(url)
        lines = text.splitlines()
        print("=" * 70)
        print(url)
        print("Report heading:", " ".join(l.strip() for l in lines[:8] if l.strip()))
        # Print the store cattle and rearing calf sections' average lines with a little context.
        for i, line in enumerate(lines):
            if re.search(r"STORE CATTLE - \d|REARING CALVES - \d|averag|^Steers - £|^Heifers - £|^Bulls - £", line, re.I):
                print(f"  {i:4d}: {line.strip()}")
        print("  Full text:", local_path_txt(url))
    print("\nAdd stated averages to the CSV files, then run:  python3 scripts/hereford.py mark")


def local_path_txt(url):
    return os.path.join(RAW, url.split("wp-content/uploads/")[1].replace("/", "_")[:-4] + ".txt")


def cmd_mark():
    done = checked()
    new = [u for u in report_urls() if u not in done]
    with open(CHECKED, "a") as f:
        for u in new:
            f.write(u + "\n")
    print(f"Marked {len(new)} report(s) as checked.")


def date_in_text(text, iso):
    d = datetime.date.fromisoformat(iso)
    return re.search(rf"{d.day}(st|nd|rd|th)?\s*{d.strftime('%B')}", text, re.I) is not None


def cmd_check():
    problems = 0
    latest = {}
    for path, key, cols in [
        (STORE_CSV, "category", [("average_gbp_per_head", "£{}"), ("average_p_per_kg", "{} ?p/kg")]),
        (CALF_CSV, "group", [("average_gbp_per_head", "£{}")]),
    ]:
        rows = list(csv.DictReader(open(path)))
        latest[path] = max(r["sale_date"] for r in rows)
        for r in rows:
            text = re.sub(r"\s+", " ", local_text(r["report_url"]))
            issues = []
            if not date_in_text(text, r["sale_date"]):
                issues.append("sale date not found in report")
            for col, fmt in cols:
                v = r[col]
                if v and not re.search(fmt.format(re.escape(v)) + r"(?![\d.])", text):
                    issues.append(f"{col}={v} not found in report")
            if r.get("head_count") and not re.search(rf"{r['head_count']} (bull|heifer|rearing)", text, re.I):
                issues.append("head count not found in report")
            if issues:
                problems += 1
                print(os.path.basename(path), r["sale_date"], r[key], issues)
    if problems:
        sys.exit(f"{problems} row(s) need fixing. data/sources.csv was NOT updated.")

    today = datetime.date.today().isoformat()
    rows = list(csv.DictReader(open(SOURCES)))
    for r in rows:
        if r["dataset"] == "hereford_store_cattle":
            r["covers_to"], r["downloaded_on"] = latest[STORE_CSV], today
        if r["dataset"] == "hereford_calves":
            r["covers_to"], r["downloaded_on"] = latest[CALF_CSV], today
    with open(SOURCES, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"All figures match their reports. Latest store sale {latest[STORE_CSV]}, "
          f"latest calf sale {latest[CALF_CSV]}; checked on {today}.")


if __name__ == "__main__":
    commands = {"new": cmd_new, "mark": cmd_mark, "check": cmd_check}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]]()
