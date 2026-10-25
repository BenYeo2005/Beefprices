// Today's prices page, built around three questions:
//   1. What would finished cattle make?  (AHDB deadweight, per kg of carcase)
//   2. What would they make as stores?   (Hereford Market, per head and per kg liveweight)
//   3. What do calves cost to buy?       (Hereford Market rearing calves, per head)
// plus a regional comparison (AHDB regions) and a local markets card.

const OUR_GRADES = [
  { code: "O+3", hint: "O+ shape, leaner" },
  { code: "O+4L", hint: "O+ shape, medium fat" },
  { code: "O+4H", hint: "O+ shape, fatter" },
  { code: "-O4L", hint: "−O shape, medium fat" },
];
const REGION_ORDER = ["England and Wales", "Central", "Northern", "Southern", "Scotland", "Great Britain"];

const PREFS_KEY = "beef-dashboard.today";
const saved = loadPrefs(PREFS_KEY);

let weekly = [];
let region = ["England and Wales", "Great Britain"].includes(saved.region) ? saved.region : "England and Wales";
let regionCategory = ["Steers", "Heifers"].includes(saved.regionCategory) ? saved.regionCategory : "Steers";
if (saved.carcaseWeight) document.getElementById("carcase-weight").value = saved.carcaseWeight;

function rememberChoices() {
  savePrefs(PREFS_KEY, { region, regionCategory, carcaseWeight: document.getElementById("carcase-weight").value });
}

function show(code) {
  return code.replace(/^-/, "−");  // proper minus sign for display
}

function weeksBefore(iso, weeks) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7 * weeks);
  return d.toISOString().slice(0, 10);
}

function weekRow(category, reg, week) {
  return weekly.find(r => r.category === category && r.region === reg && r.week_ending === week) || {};
}

function latestWeek() {
  return weekly.map(r => r.week_ending).sort().pop();
}

function carcaseWeight() {
  const kg = Number(document.getElementById("carcase-weight").value);
  return kg > 0 && kg <= 800 ? kg : null;
}

// "≈ £2,093 per head for a 320kg carcase" (weight × price, before deductions)
function perHead(pencePerKg) {
  const kg = carcaseWeight();
  if (kg === null || pencePerKg === null) return "";
  const value = Math.round(kg * pencePerKg / 100);
  return `<span class="per-head">≈ £${value.toLocaleString("en-GB")} per head for a ${kg}kg carcase</span>`;
}

// Two change lines: against last week and against the same week a year ago.
function twoChanges(now, lastWeek, yearAgo, code) {
  return `
    <span class="grade-change">${changeHTML(now, num(lastWeek[code] ?? ""), "on last week")}</span>
    <span class="grade-change">${changeHTML(now, num(yearAgo[code] ?? ""), "on a year ago")}</span>`;
}

// ---------- 1. Finished cattle ----------

function finishedCategory(category, week) {
  const now = weekRow(category, region, week);
  if (!now.week_ending) return `<h3>${category}</h3><p class="no-data">No ${category.toLowerCase()} prices for this week.</p>`;
  const lastWeek = weekRow(category, region, weeksBefore(week, 1));
  const yearAgoWeek = weeksBefore(week, 52);
  const yearAgo = weekRow(category, region, yearAgoWeek);
  const r4l = num(now["R4L"]);

  const grades = OUR_GRADES.map(g => {
    const p = num(now[g.code]);
    const gap = p !== null && r4l !== null ? Math.round((p - r4l) * 10) / 10 : null;
    const gapText = gap === null ? "" : gap < 0 ? `${Math.abs(gap).toFixed(1)}p below R4L` :
                    gap > 0 ? `${gap.toFixed(1)}p above R4L` : "same as R4L";
    return `
      <li class="grade-row">
        <div>
          <span class="grade-code">${show(g.code)}</span>
          <span class="grade-hint">${g.hint}${gapText ? " · " + gapText : ""}</span>
        </div>
        <div class="grade-price">
          <span class="grade-value">${pence(p)}</span>
          ${twoChanges(p, lastWeek, yearAgo, g.code)}
          ${perHead(p)}
        </div>
      </li>`;
  }).join("");

  return `
    <h3>${category}</h3>
    <div class="reference">
      <p class="label">R4L reference price (deadweight)</p>
      <p class="price">${pence(r4l)} <span class="unit">per kg carcase</span></p>
      <p>${changeHTML(r4l, num(lastWeek["R4L"] ?? ""), "on last week")}</p>
      <p>${changeHTML(r4l, num(yearAgo["R4L"] ?? ""), `on a year ago (${pence(num(yearAgo["R4L"] ?? ""))}, week ending ${longDate(yearAgoWeek, false)})`)}</p>
      ${perHead(r4l) ? `<p>${perHead(r4l)}</p>` : ""}
    </div>
    <p class="label">O+ grades (typical for dairy-crosses, see note above)</p>
    <ul class="grade-list">${grades}</ul>`;
}

function renderFinished() {
  const box = document.getElementById("finished-prices");
  const week = latestWeek();
  box.innerHTML =
    `<p class="week-label">Week ending ${longDate(week)} · ${region}</p>` +
    `<div class="cat-grid"><div>${finishedCategory("Steers", week)}</div><div>${finishedCategory("Heifers", week)}</div></div>` +
    (carcaseWeight() ? `<p class="note">Value per head is carcase weight × price, before deductions such as haulage and levy.</p>` : "");
  document.querySelectorAll("[data-region]").forEach(btn =>
    btn.setAttribute("aria-pressed", btn.dataset.region === region ? "true" : "false"));
}

// ---------- Regional comparison ----------

function renderRegions() {
  const box = document.getElementById("region-prices");
  const week = latestWeek();
  const rows = REGION_ORDER.map(reg => {
    const now = weekRow(regionCategory, reg, week);
    if (!now.week_ending) return "";
    const lastWeek = weekRow(regionCategory, reg, weeksBefore(week, 1));
    const yearAgo = weekRow(regionCategory, reg, weeksBefore(week, 52));
    const p = num(now["R4L"]);
    return `
      <li class="grade-row">
        <div>
          <span class="grade-code region-name">${reg}</span>
          <span class="grade-hint">O+4L: ${pence(num(now["O+4L"]))}</span>
        </div>
        <div class="grade-price">
          <span class="grade-value">${pence(p)}</span>
          ${twoChanges(p, lastWeek, yearAgo, "R4L")}
        </div>
      </li>`;
  }).join("");
  box.innerHTML = `<p class="week-label">${regionCategory}, week ending ${longDate(week)}</p><ul class="grade-list">${rows}</ul>`;
  document.querySelectorAll("[data-region-cat]").forEach(btn =>
    btn.setAttribute("aria-pressed", btn.dataset.regionCat === regionCategory ? "true" : "false"));
}

// ---------- 2 and 3. Hereford Market ----------

// The most recent earlier sale that has a figure for this group.
function previousSale(rows, key, group, field, beforeDate) {
  const earlier = rows.filter(r => r[key] === group && r.sale_date < beforeDate && num(r[field]) !== null);
  return earlier.length ? earlier[earlier.length - 1] : null;
}

function changeOnSale(now, prev, field, unit) {
  return prev
    ? changeHTML(now, num(prev[field]), `on the previous sale (${longDate(prev.sale_date, false)})`, unit)
    : `<span class="change-none">No earlier sale to compare</span>`;
}

function yearAgoMissing(rows) {
  const first = rows.map(r => r.sale_date).sort()[0];
  return `<span class="change-none">Same time last year: not available</span> (reports online only go back to ${longDate(first, false)})`;
}

async function showStoreCattle() {
  const box = document.getElementById("store-prices");
  try {
    const rows = (await loadCSV("data/hereford_store_cattle.csv")).sort((a, b) => a.sale_date.localeCompare(b.sale_date));
    const latestDate = rows[rows.length - 1].sale_date;
    const blocks = ["Steers", "Heifers"].map(category => {
      const now = rows.find(r => r.sale_date === latestDate && r.category === category);
      if (!now) return `<h3>${category}</h3><p class="no-data">No ${category.toLowerCase()} average given for this sale.</p>`;
      const head = num(now.average_gbp_per_head), kg = num(now.average_p_per_kg);
      return `<div>
        <h3>${category}, all breeds and ages</h3>
        <div class="reference">
          <p class="label">Average per head</p>
          <p class="price">${pounds(head)}</p>
          <p>${changeOnSale(head, previousSale(rows, "category", category, "average_gbp_per_head", latestDate), "average_gbp_per_head", "£")}</p>
          <p class="label">Average per kg (liveweight)</p>
          <p class="grade-value">${pence(kg)} <span class="unit">per kg live</span></p>
          <p>${changeOnSale(kg, previousSale(rows, "category", category, "average_p_per_kg", latestDate), "average_p_per_kg", "p")}</p>
          <p class="year-ago">${yearAgoMissing(rows)}</p>
          ${now.notes ? `<p class="year-ago">Note: ${now.notes}</p>` : ""}
        </div></div>`;
    }).join("");
    box.innerHTML =
      `<p class="week-label">Sale on ${longDate(latestDate)} · Hereford Market</p><div class="cat-grid">${blocks}</div>` +
      `<p class="note">These averages include every store steer or heifer in the sale, of any breed or age, so treat them as a guide to the general store trade rather than what our dairy-crosses would make. Sales are every 2–3 weeks, so changes are against the previous sale, not last week.</p>`;
    document.getElementById("store-source").innerHTML =
      `Source: Hereford Market Auctioneers, <a href="${rows[rows.length - 1].report_url}">store cattle report for ${longDate(latestDate, false)}</a>.`;
    return latestDate;
  } catch (e) {
    box.innerHTML = `<p class="no-data">Store cattle prices could not be loaded.</p>`;
  }
}

async function showCalves() {
  const box = document.getElementById("calf-prices");
  try {
    const rows = (await loadCSV("data/hereford_calves.csv")).sort((a, b) => a.sale_date.localeCompare(b.sale_date));
    const latestDate = rows[rows.length - 1].sale_date;
    const latest = rows.filter(r => r.sale_date === latestDate);
    const items = latest.map(now => {
      const price = num(now.average_gbp_per_head);
      const prev = previousSale(rows, "group", now.group, "average_gbp_per_head", latestDate);
      return `
        <li class="grade-row">
          <div>
            <span class="grade-code">${now.group}</span>
            <span class="grade-hint">${now.head_count ? now.head_count + " sold" : "Number sold not stated"} · all breeds</span>
          </div>
          <div class="grade-price">
            <span class="grade-value">${pounds(price)}</span>
            <span class="grade-change">${changeOnSale(price, prev, "average_gbp_per_head", "£")}</span>
          </div>
        </li>`;
    }).join("");
    box.innerHTML =
      `<p class="week-label">Sale on ${longDate(latestDate)} · Hereford Market</p>` +
      `<p class="label">Average price per head</p><ul class="grade-list">${items}</ul>` +
      `<p class="year-ago">${yearAgoMissing(rows)}</p>` +
      `<p class="note">The sale is weekly, but some weeks' reports give no average, so changes are against the previous sale that gave one.</p>`;
    document.getElementById("calf-source").innerHTML =
      `Source: Hereford Market Auctioneers, <a href="${latest[0].report_url}">rearing calf report for ${longDate(latestDate, false)}</a>.`;
    return latestDate;
  } catch (e) {
    box.innerHTML = `<p class="no-data">Calf prices could not be loaded.</p>`;
  }
}

// ---------- Start ----------

async function start() {
  try {
    weekly = await loadCSV("data/deadweight_weekly.csv");
    const sources = await loadCSV("data/sources.csv");
    const dw = sources.find(s => s.dataset === "deadweight_weekly");
    if (dw) {
      const text = `Source: <a href="${dw.source_url}">AHDB, GB deadweight cattle prices</a>, published ${ukDate(dw.source_last_updated)}. ` +
        `Pence per kg of carcase, before deductions.`;
      document.getElementById("finished-source").innerHTML = text;
      document.getElementById("region-source").innerHTML = text;
    }
    renderFinished();
    renderRegions();
  } catch (e) {
    const msg = `<p class="no-data">Prices can't be shown just now. Try refreshing the page. If that doesn't help, let the person who runs this site know.</p>`;
    document.getElementById("finished-prices").innerHTML = msg;
    document.getElementById("region-prices").innerHTML = msg;
  }

  const [storeDate, calfDate] = await Promise.all([showStoreCattle(), showCalves()]);
  document.getElementById("local-hereford").textContent =
    `Latest reports used on this page: store cattle ${storeDate ? longDate(storeDate, false) : "none"}, ` +
    `rearing calves ${calfDate ? longDate(calfDate, false) : "none"}.`;
}

document.querySelectorAll("[data-region]").forEach(btn =>
  btn.addEventListener("click", () => { region = btn.dataset.region; rememberChoices(); renderFinished(); }));
document.querySelectorAll("[data-region-cat]").forEach(btn =>
  btn.addEventListener("click", () => { regionCategory = btn.dataset.regionCat; rememberChoices(); renderRegions(); }));
document.getElementById("carcase-weight").addEventListener("input", () => {
  rememberChoices();
  if (weekly.length) renderFinished();
});

start();
