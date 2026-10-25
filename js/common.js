// Shared helpers used by every page: reading CSV files, formatting dates and prices,
// and filling in the "last updated" footer from data/sources.csv.

// Read a simple CSV file (comma-separated, with optional "quoted, text") into a list of objects.
async function loadCSV(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error("Could not load " + path);
  const lines = (await response.text()).trim().split(/\r?\n/);
  const header = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitCSVLine(line);
    const row = {};
    header.forEach((name, i) => { row[name] = values[i] ?? ""; });
    return row;
  });
}

function splitCSVLine(line) {
  const out = [];
  let current = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(current); current = ""; }
    else current += ch;
  }
  out.push(current);
  return out;
}

// "2026-10-17" -> "Saturday 17 October 2026"
function longDate(iso, withWeekday = true) {
  const options = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  if (withWeekday) options.weekday = "long";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", options);
}

// AHDB writes dates as "21/10/2026" -> "21 October 2026"
function ukDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split("/");
  return longDate(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, false);
}

// Blank cells mean AHDB had no price: return null, never a made-up number.
function num(text) {
  return text === "" || text === undefined ? null : Number(text);
}

function pence(value) {
  return value === null ? "No price" : value.toFixed(1) + "p";
}

// £1,234.50 or £585 (pounds per head, shown exactly as the report gives it)
function pounds(value) {
  if (value === null) return "No price";
  const decimals = Number.isInteger(value) ? 0 : 2;
  return "£" + value.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Green up arrow, red down arrow, or "no change", compared with an earlier price.
// unit "p" = pence (1 decimal place), unit "£" = whole pounds.
function changeHTML(now, before, label, unit = "p") {
  if (now === null || before === null) return `<span class="change-none">No earlier price to compare</span>`;
  const diff = unit === "£" ? Math.round(now - before) : Math.round((now - before) * 10) / 10;
  const amount = unit === "£" ? "£" + Math.abs(diff).toLocaleString("en-GB") : Math.abs(diff).toFixed(1) + "p";
  if (diff > 0) return `<span class="change-up"><span aria-hidden="true">▲</span> up ${amount}</span> ${label}`;
  if (diff < 0) return `<span class="change-down"><span aria-hidden="true">▼</span> down ${amount}</span> ${label}`;
  return `<span class="change-none">No change</span> ${label}`;
}

// ---------- Seasonal pattern (used by the History and Outlook pages) ----------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
                     "August", "September", "October", "November", "December"];

// years: { 2024: [12 monthly prices or null], ... }
// For each month, how far the price sat above or below the 12-month average centred on it
// (a "2x12 centred moving average"), which takes out long-term rises and falls.
// Returns null if any month has fewer than two years to go on.
function seasonalIndex(years) {
  const seq = [];
  Object.keys(years).map(Number).sort((a, b) => a - b)
    .forEach(y => years[y].forEach((v, m) => seq.push({ year: y, month: m, v })));
  const byMonth = MONTH_NAMES.map(() => []);
  for (let t = 6; t < seq.length - 6; t++) {
    const w = seq.slice(t - 6, t + 7).map(p => p.v);
    if (w.some(v => v === null)) continue;
    const ma = (0.5 * w[0] + w.slice(1, 12).reduce((a, b) => a + b, 0) + 0.5 * w[12]) / 12;
    byMonth[seq[t].month].push({ year: seq[t].year, diff: (seq[t].v / ma - 1) * 100 });
  }
  if (byMonth.some(list => list.length < 2)) return null;
  const index = byMonth.map(list => {
    const diffs = list.map(x => x.diff);
    return {
      avg: diffs.reduce((a, b) => a + b, 0) / diffs.length,
      above: diffs.filter(d => d > 0).length,
      below: diffs.filter(d => d < 0).length,
      n: diffs.length,
    };
  });
  const allYears = [...new Set(byMonth.flat().map(x => x.year))].sort();
  return { index, firstYear: allYears[0], lastYear: allYears[allYears.length - 1] };
}

// Plain-English sentence about the strongest and weakest months.
// Only says "usually" when it happened in more than half the years, and says plainly when the pattern is weak.
function describeSeason(season, what) {
  const index = season.index;
  const hi = index.reduce((a, b, i) => (b.avg > index[a].avg ? i : a), 0);
  const lo = index.reduce((a, b, i) => (b.avg < index[a].avg ? i : a), 0);
  const hiWord = index[hi].above > index[hi].n / 2 ? "usually strongest" : "strongest on average";
  const loWord = index[lo].below > index[lo].n / 2 ? "usually weakest" : "weakest on average";
  const weak = index[hi].avg < 1 && -index[lo].avg < 1;
  return (weak ? `<p>There's no strong seasonal pattern here: on average no month sits more than 1% above or below the 12-month average.</p>` : "") +
    `<p>From ${season.firstYear} to ${season.lastYear}, ${what} prices were ${hiWord} in ` +
    `<strong>${MONTH_NAMES[hi]}</strong> (on average ${index[hi].avg.toFixed(1)}% above the 12-month average; above it in ${index[hi].above} of ${index[hi].n} years) ` +
    `and ${loWord} in <strong>${MONTH_NAMES[lo]}</strong> (on average ${Math.abs(index[lo].avg).toFixed(1)}% below; below it in ${index[lo].below} of ${index[lo].n} years).</p>`;
}

// Remember a page's last-used filters on this device (browser storage).
// If storage is blocked (e.g. private browsing), the page just uses its defaults.
function loadPrefs(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch (e) {
    return {};
  }
}

function savePrefs(key, prefs) {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch (e) {
    // Not saved; nothing else to do.
  }
}

// ---------- Out-of-date warning ----------

const STALE_DAYS = 14;

// Today's date, or a pretend date for testing the warning: add ?asof=2026-11-20 to the address.
function todayISO() {
  const asof = new URLSearchParams(location.search).get("asof");
  return /^\d{4}-\d{2}-\d{2}$/.test(asof || "") ? asof : new Date().toISOString().slice(0, 10);
}

function daysBetween(fromISO, toISO) {
  return Math.round((new Date(toISO + "T00:00:00Z") - new Date(fromISO + "T00:00:00Z")) / 86400000);
}

// Shows a warning at the top of the page if any prices are more than two weeks old.
// AHDB: judged by the week the prices are for. Hereford Market: judged by when the reports were last
// checked, because its store sales are only every 2–3 weeks.
function showStaleWarning(sources) {
  const today = todayISO();
  const problems = [];
  const dw = sources.find(s => s.dataset === "deadweight_weekly");
  if (dw && daysBetween(dw.covers_to, today) > STALE_DAYS) {
    problems.push(`Finished cattle prices (AHDB) are for the week ending ${longDate(dw.covers_to, false)}, ${daysBetween(dw.covers_to, today)} days ago.`);
  }
  const hereford = sources.filter(s => s.dataset.startsWith("hereford_")).map(s => s.downloaded_on).filter(Boolean).sort()[0];
  if (hereford && daysBetween(hereford, today) > STALE_DAYS) {
    problems.push(`Hereford Market store cattle and calf prices were last checked on ${longDate(hereford, false)}, ${daysBetween(hereford, today)} days ago.`);
  }
  if (!problems.length) return;
  const main = document.querySelector("main");
  const banner = document.createElement("div");
  banner.className = "stale-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML =
    `<p><strong><span aria-hidden="true">⚠</span> Some prices on this site may be out of date</strong></p>` +
    problems.map(p => `<p>${p}</p>`).join("") +
    `<p>Prices may have changed since. The person who runs this site can refresh it.</p>`;
  main.insertBefore(banner, main.firstChild);
}

// Footer: say when each dataset was last updated and where it came from.
async function fillFooter() {
  let sources;
  try {
    sources = await loadCSV("data/sources.csv");
    showStaleWarning(sources);
  } catch (e) {
    return;  // Leave the default wording in place.
  }
  const box = document.getElementById("last-updated");
  if (!box) return;
  try {
    const dw = sources.find(s => s.dataset === "deadweight_weekly");
    const store = sources.find(s => s.dataset === "hereford_store_cattle");
    const calves = sources.find(s => s.dataset === "hereford_calves");
    const parts = [];
    parts.push(dw
      ? `Finished cattle prices: latest week ending ${longDate(dw.covers_to)}. ` +
        `Published by <a href="${dw.source_url}">AHDB</a> on ${ukDate(dw.source_last_updated)}, ` +
        `added to this site on ${longDate(dw.downloaded_on, false)}.`
      : `Finished cattle prices: none added yet.`);
    parts.push(store
      ? `Store cattle prices: latest sale ${longDate(store.covers_to)}, from <a href="${store.source_url}">Hereford Market sale reports</a>, ` +
        `last checked on ${longDate(store.downloaded_on, false)}.`
      : `Store cattle prices: none added yet.`);
    parts.push(calves
      ? `Calf prices: latest sale ${longDate(calves.covers_to)}, from <a href="${calves.source_url}">Hereford Market sale reports</a>, ` +
        `last checked on ${longDate(calves.downloaded_on, false)}.`
      : `Calf prices: none added yet.`);
    box.innerHTML = parts.join("<br>");
  } catch (e) {
    // Leave the default "no data" wording in place.
  }
}

document.addEventListener("DOMContentLoaded", fillFooter);
