// Price history page: one main chart driven by the filters, plus a "Seasonal pattern" section.
// Every sentence under a chart is worked out from the data shown, and is rewritten whenever a filter changes.

const PREFS_KEY = "beef-dashboard.history";

const GRADES = [
  { code: "R4L", label: "R4L (reference)", colour: "#1b1b1b", dash: [] },
  { code: "O+3", label: "O+3", colour: "#2a8c8c", dash: [2, 3] },
  { code: "O+4L", label: "O+4L", colour: "#1f5fa8", dash: [] },
  { code: "O+4H", label: "O+4H (fatter)", colour: "#7b3fa0", dash: [6, 4] },
  { code: "-O4L", label: "−O4L", colour: "#b86e00", dash: [] },
];
const STOCK = {
  finished: ["Steers", "Heifers"],
  store: ["Steers", "Heifers"],
  calves: ["Bull calves", "Heifer calves", "All calves"],
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));
const FIRST_WEEKLY = "2019-01-01";  // AHDB weekly prices by grade start in the first week of 2019

const DEFAULTS = {
  type: "finished", stock: "Steers", calfStock: "Bull calves", region: "England and Wales",
  grades: ["R4L", "O+4L"], measure: "average_gbp_per_head", range: "5", from: "", to: "",
  seasonGrade: "R4L", periodStart: 3, periodEnd: 5,
};

const data = { weekly: [], monthly: [], store: [], calves: [], sources: [] };
const charts = {};
const monthlyCache = {};
const state = restoreState();

// ---------- Remembering choices ----------

function restoreState() {
  const s = loadPrefs(PREFS_KEY);
  const st = { ...DEFAULTS };
  if (STOCK[s.type]) st.type = s.type;
  if (STOCK.finished.includes(s.stock)) st.stock = s.stock;
  if (STOCK.calves.includes(s.calfStock)) st.calfStock = s.calfStock;
  if (["England and Wales", "Great Britain"].includes(s.region)) st.region = s.region;
  if (Array.isArray(s.grades)) {
    const valid = GRADES.map(g => g.code).filter(c => s.grades.includes(c));
    if (valid.length) st.grades = valid;
  }
  if (["average_gbp_per_head", "average_p_per_kg"].includes(s.measure)) st.measure = s.measure;
  if (["1", "3", "5", "all", "custom"].includes(s.range)) st.range = s.range;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.from)) st.from = s.from;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.to)) st.to = s.to;
  if (GRADES.some(g => g.code === s.seasonGrade)) st.seasonGrade = s.seasonGrade;
  if (s.periodStart >= 1 && s.periodStart <= 12) st.periodStart = Number(s.periodStart);
  if (s.periodEnd >= 1 && s.periodEnd <= 12) st.periodEnd = Number(s.periodEnd);
  return st;
}

// ---------- Small helpers ----------

const stockNow = () => state.type === "calves" ? state.calfStock : state.stock;
const gradeInfo = code => GRADES.find(g => g.code === code);
const show = code => code.replace(/^-/, "−");

function addYears(iso, years) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function monthEnd(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const monthName = yyyymm => `${MONTHS[Number(yyyymm.slice(5, 7)) - 1]} ${yyyymm.slice(0, 4)}`;
const dayName = iso => longDate(iso, false);

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// Units: finished = pence per kg deadweight; stores = £ per head or pence per kg live; calves = £ per head.
function unit() {
  if (state.type === "finished") return { money: "p", text: v => v.toFixed(1) + "p", long: "per kg deadweight" };
  if (state.type === "store" && state.measure === "average_p_per_kg") return { money: "p", text: v => v.toFixed(1) + "p", long: "per kg liveweight" };
  return { money: "£", text: v => pounds(Math.round(v * 100) / 100), long: "per head" };
}

function diffText(diff, u) {
  return u.money === "£" ? "£" + Math.round(Math.abs(diff)).toLocaleString("en-GB") : Math.abs(diff).toFixed(1) + "p";
}

// ---------- Data ranges ----------

function dataBounds() {
  if (state.type === "finished") {
    const weeks = data.weekly.map(r => r.week_ending);
    return { earliest: data.monthly[0].month + "-01", latest: weeks[weeks.length - 1] };
  }
  const rows = state.type === "store" ? data.store : data.calves;
  const dates = rows.map(r => r.sale_date).sort();
  return { earliest: dates[0], latest: dates[dates.length - 1] };
}

function rangeBounds() {
  const { earliest, latest } = dataBounds();
  let start, end = latest;
  if (state.range === "all") start = earliest;
  else if (state.range === "custom") {
    start = state.from || earliest;
    end = state.to || latest;
    if (start > end) [start, end] = [end, start];
  } else start = addYears(latest, -Number(state.range));
  return { start, end, earliest, latest };
}

// Monthly averages for one grade. R4L uses AHDB's own monthly figures (back to 2014).
// Other grades are the average of AHDB's weekly prices in each complete month (from 2019).
function monthlyMap(grade, category, region) {
  const key = [grade, category, region].join("|");
  if (monthlyCache[key]) return monthlyCache[key];
  const map = new Map();
  if (grade === "R4L") {
    data.monthly.filter(r => r.category === category && r.region === region)
      .forEach(r => { const v = num(r.R4L); if (v !== null) map.set(r.month, v); });
  } else {
    const lastWeek = data.weekly[data.weekly.length - 1].week_ending;
    const byMonth = {};
    data.weekly.filter(r => r.category === category && r.region === region).forEach(r => {
      const v = num(r[grade]);
      if (v !== null) (byMonth[r.week_ending.slice(0, 7)] ||= []).push(v);
    });
    Object.keys(byMonth).sort().forEach(m => {
      if (monthEnd(m) <= lastWeek) map.set(m, average(byMonth[m]));  // skip the month still in progress
    });
  }
  return (monthlyCache[key] = map);
}

// ---------- Building the main chart's points ----------
// Returns { points: [{ label, title, values: {key: number|null} }], series: [{key, label, colour, dash}], mode }

function mainSeries() {
  const { start, end } = rangeBounds();

  if (state.type === "finished") {
    const series = GRADES.filter(g => state.grades.includes(g.code)).map(g => ({ key: g.code, ...g }));
    if (start >= FIRST_WEEKLY) {
      const rows = data.weekly
        .filter(r => r.category === state.stock && r.region === state.region && r.week_ending >= start && r.week_ending <= end)
        .sort((a, b) => a.week_ending.localeCompare(b.week_ending));
      return {
        mode: "weekly", series,
        points: rows.map(r => ({
          label: r.week_ending, title: "Week ending " + dayName(r.week_ending),
          values: Object.fromEntries(series.map(s => [s.key, num(r[s.key])])),
        })),
      };
    }
    // Before 2019 only monthly R4L exists, so switch the whole chart to monthly averages.
    const months = [];
    for (let m = start.slice(0, 7); m <= end.slice(0, 7);) {
      months.push(m);
      const [y, mo] = m.split("-").map(Number);
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    }
    const maps = Object.fromEntries(series.map(s => [s.key, monthlyMap(s.key, state.stock, state.region)]));
    const points = months.map(m => ({
      label: m + "-01", title: "Average for " + monthName(m),
      values: Object.fromEntries(series.map(s => [s.key, maps[s.key].get(m) ?? null])),
    })).filter(p => Object.values(p.values).some(v => v !== null));
    return { mode: "monthly", series, points };
  }

  const isStore = state.type === "store";
  const rows = (isStore ? data.store : data.calves)
    .filter(r => r[isStore ? "category" : "group"] === stockNow() && r.sale_date >= start && r.sale_date <= end)
    .sort((a, b) => a.sale_date.localeCompare(b.sale_date));
  const field = isStore ? state.measure : "average_gbp_per_head";
  const series = [{ key: "v", label: stockNow(), colour: "#1f5fa8", dash: [] }];
  return {
    mode: "sale", series,
    points: rows.map(r => ({ label: r.sale_date, title: "Sale on " + longDate(r.sale_date), values: { v: num(r[field]) } })),
  };
}

// ---------- Chart drawing ----------

function axisDate(iso, mode) {
  const d = new Date(iso + "T00:00:00Z");
  const opts = mode === "monthly" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "2-digit" };
  return d.toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

function makeChart(id, config) {
  if (charts[id]) charts[id].destroy();
  config.options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,  // filters update the chart instantly
    interaction: { mode: "index", intersect: false },
    ...config.options,
    plugins: {
      legend: { position: "bottom", labels: { font: { size: 14 }, boxWidth: 24 } },
      ...(config.options.plugins || {}),
      tooltip: { titleFont: { size: 15 }, bodyFont: { size: 15 }, padding: 10, ...(config.options.plugins?.tooltip || {}) },
    },
  };
  charts[id] = new Chart(document.getElementById(id), config);
}

function whatLabel(seriesKey) {
  const stock = stockNow().toLowerCase();
  if (state.type === "finished") return `the ${show(seriesKey)} price for ${stock} in ${state.region}`;
  if (state.type === "store") return `the average store ${stock.replace(/s$/, "")} price at Hereford Market`;
  const calf = { "Bull calves": "bull calf", "Heifer calves": "heifer calf", "All calves": "calf (all calves together)" }[stockNow()];
  return `the average ${calf} price at Hereford Market`;
}

function drawMain() {
  const u = unit();
  const { points, series, mode } = mainSeries();
  const { start, earliest } = rangeBounds();

  const titles = {
    finished: `Finished ${state.stock.toLowerCase()}, price per kg deadweight`,
    store: `Store ${state.stock.toLowerCase()} at Hereford Market, ${state.measure === "average_p_per_kg" ? "price per kg liveweight" : "price per head"}`,
    calves: `${state.calfStock} at Hereford Market, price per head`,
  };
  document.getElementById("main-title").textContent = titles[state.type];

  makeChart("main-chart", {
    type: "line",
    data: {
      labels: points.map(p => axisDate(p.label, mode)),
      datasets: series.map(s => ({
        label: s.label,
        data: points.map(p => p.values[s.key]),  // a blank stays a gap, never filled in
        borderColor: s.colour, backgroundColor: s.colour, borderDash: s.dash,
        borderWidth: s.key === "R4L" ? 3 : 2,
        pointRadius: mode === "sale" ? 4 : 0, pointHitRadius: 10, spanGaps: false, tension: 0.1,
      })),
    },
    options: {
      plugins: {
        legend: { display: series.length > 1, position: "bottom", labels: { font: { size: 14 }, boxWidth: 24 } },
        tooltip: {
          callbacks: {
            title: items => points[items[0].dataIndex].title,
            label: item => `${item.dataset.label}: ${item.parsed.y === null ? "no figure" : u.text(item.parsed.y) + " " + u.long}`,
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 6, maxRotation: 0, autoSkipPadding: 16, font: { size: 13 } }, grid: { display: false } },
        y: { title: { display: true, text: u.long, font: { size: 13 } }, ticks: { font: { size: 13 }, callback: v => (u.money === "£" ? "£" + v.toLocaleString("en-GB") : v + "p") } },
      },
    },
  });

  // Plain-English summary, worked out from the points on the chart.
  const summary = document.getElementById("main-summary");
  const primary = series[0].key;
  const vals = points.map(p => ({ v: p.values[primary], t: p.title.replace(/^Week ending |^Sale on |^Average for /, "") }))
    .filter(x => x.v !== null);
  if (vals.length < 2) {
    summary.innerHTML = `<p>There aren't enough prices in this time range to describe. Try a longer range.</p>`;
  } else {
    const first = vals[0], last = vals[vals.length - 1];
    const max = vals.reduce((a, b) => (b.v > a.v ? b : a)), min = vals.reduce((a, b) => (b.v < a.v ? b : a));
    const diff = last.v - first.v, pct = (diff / first.v) * 100;
    const direction = Math.abs(diff) < 0.05 ? "stayed level" : diff > 0 ? "rose" : "fell";
    let text = `<p>From ${first.t} to ${last.t}, ${whatLabel(primary)} ${direction} from ${u.text(first.v)} to ${u.text(last.v)} ` +
      `(${diff >= 0 ? "up" : "down"} ${diffText(diff, u)}, ${Math.abs(pct).toFixed(1)}%). ` +
      `The highest was ${u.text(max.v)} (${max.t}) and the lowest ${u.text(min.v)} (${min.t}).</p>`;

    // For finished cattle with R4L and other grades shown: how far below R4L each grade sat on average.
    if (state.type === "finished" && state.grades.includes("R4L") && series.length > 1) {
      const gaps = series.filter(s => s.key !== "R4L").map(s => {
        const d = points.map(p => (p.values[s.key] !== null && p.values.R4L !== null ? p.values[s.key] - p.values.R4L : null)).filter(x => x !== null);
        const g = average(d);
        return g === null ? null : `${show(s.key)} ${Math.abs(g).toFixed(1)}p ${g < 0 ? "below" : "above"}`;
      }).filter(Boolean);
      if (gaps.length) text += `<p>On average over this period, compared with R4L: ${gaps.join(", ")}.</p>`;
    }
    summary.innerHTML = text;
  }

  // Notes and source.
  const notes = [];
  if (state.type === "finished" && mode === "monthly") {
    notes.push("Ranges starting before 2019 are shown as monthly averages. R4L is AHDB's own monthly average and goes back to January 2014. The other grades are averages of AHDB's weekly prices for each month, worked out by this site, and start in January 2019.");
  }
  if (state.type === "finished" && mode === "weekly" && start < "2024-10-05") {
    notes.push("AHDB changed how many abattoirs it samples from the weeks ending 21 October 2023 and 5 October 2024, so small jumps around those dates may partly reflect that.");
  }
  if (state.type !== "finished") {
    notes.push(state.type === "store"
      ? "All breeds and ages. Each dot is one sale (about every 2–3 weeks). Gaps are where a report didn't give that figure."
      : "All breeds. Each dot is one sale. Some reports give only an \"All calves\" average, so choose All calves to see those sales.");
    if (start < earliest) notes.push(`Hereford Market's reports online only go back to ${dayName(earliest)}, so longer ranges show the same sales.`);
  }
  document.getElementById("main-note").textContent = notes.join(" ");
  document.getElementById("main-source").innerHTML = sourceLine(mode);
}

function sourceLine(mode) {
  const src = id => data.sources.find(s => s.dataset === id);
  if (state.type === "finished") {
    const s = src(mode === "monthly" ? "deadweight_monthly" : "deadweight_weekly");
    return s ? `Source: <a href="${s.source_url}">AHDB, GB deadweight cattle prices (${mode})</a>, published ${ukDate(s.source_last_updated)}. Pence per kg of carcase, before deductions.` : "Source: AHDB";
  }
  return `Source: <a href="https://www.herefordmarket.co.uk/market-reports/">Hereford Market Auctioneers sale reports</a>. Each figure is copied from that sale's report.`;
}

// ---------- Seasonal pattern ----------

function drawSeasonal() {
  const unavailable = document.getElementById("season-unavailable");
  const content = document.getElementById("season-content");
  const source = document.getElementById("season-source");

  if (state.type !== "finished") {
    const rows = state.type === "store" ? data.store : data.calves;
    const first = rows.map(r => r.sale_date).sort()[0];
    unavailable.hidden = false;
    content.hidden = true;
    source.textContent = "";
    unavailable.innerHTML = `<p><strong>Not enough history for seasonal patterns yet.</strong></p>` +
      `<p>Hereford Market's reports online start on ${dayName(first)}, which isn't enough to compare the same months across different years. Choose Finished (deadweight) to see seasonal patterns.</p>`;
    return;
  }

  const { start, end } = rangeBounds();
  const grade = state.seasonGrade;
  const map = monthlyMap(grade, state.stock, state.region);
  const startYear = Number(start.slice(0, 4)), endYear = Number(end.slice(0, 4));
  const years = {};
  for (const [m, v] of map) {
    const y = Number(m.slice(0, 4));
    if (y >= startYear && y <= endYear) (years[y] ||= Array(12).fill(null))[Number(m.slice(5, 7)) - 1] = v;
  }
  const yearList = Object.keys(years).map(Number).sort();
  const what = `${show(grade)} ${state.stock.toLowerCase()} (${state.region})`;
  const fmt = v => v.toFixed(1) + "p";

  source.innerHTML = grade === "R4L"
    ? sourceLine("monthly")
    : `Monthly averages of <a href="https://ahdb.org.uk/beef/gb-deadweight-cattle-prices">AHDB's weekly deadweight prices</a>, worked out by this site. ${show(grade)} prices start in January 2019.`;

  if (yearList.length < 2) {
    unavailable.hidden = false;
    content.hidden = true;
    unavailable.innerHTML = `<p><strong>Choose a longer time range to compare years.</strong></p><p>This range only covers ${yearList.length ? yearList[0] : "no full months"}.</p>`;
    return;
  }
  unavailable.hidden = true;
  content.hidden = false;

  // 1. One line per year, January to December.
  const latestYear = yearList[yearList.length - 1];
  makeChart("overlay-chart", {
    type: "line",
    data: {
      labels: MONTHS_SHORT,
      datasets: yearList.map((y, i) => {
        const isLatest = y === latestYear, isPrev = y === latestYear - 1;
        const shade = Math.round(200 - (120 * i) / Math.max(1, yearList.length - 1));
        const colour = isLatest ? "#1f4a2c" : isPrev ? "#b86e00" : `rgb(${shade},${shade},${shade - 8})`;
        return {
          label: String(y), data: years[y], borderColor: colour, backgroundColor: colour,
          borderWidth: isLatest ? 4 : isPrev ? 3 : 1.5, pointRadius: isLatest || isPrev ? 3 : 0,
          pointHitRadius: 8, spanGaps: false, tension: 0.1, order: isLatest ? 0 : isPrev ? 1 : 2,
        };
      }),
    },
    options: {
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 13 }, boxWidth: 18 } },
        tooltip: {
          itemSort: (a, b) => Number(b.dataset.label) - Number(a.dataset.label),
          callbacks: {
            title: items => MONTHS[items[0].dataIndex],
            label: item => `${item.dataset.label}: ${item.parsed.y === null ? "no figure" : fmt(item.parsed.y) + " per kg"}`,
          },
        },
      },
      scales: {
        x: { ticks: { font: { size: 13 }, autoSkipPadding: 8, maxRotation: 0 }, grid: { display: false } },
        y: { title: { display: true, text: "per kg deadweight (monthly average)", font: { size: 13 } }, ticks: { font: { size: 13 }, callback: v => v + "p" } },
      },
    },
  });

  const latestMonthIndex = years[latestYear].reduce((last, v, i) => (v !== null ? i : last), -1);
  const prevValue = years[latestYear - 1]?.[latestMonthIndex] ?? null;
  const nowValue = years[latestYear][latestMonthIndex];
  let overlayText = `<p>Each line is one year of monthly ${what} prices. The thick green line is ${latestYear}, orange is ${latestYear - 1}${yearList.length > 2 ? ", and grey lines are earlier years (darker is more recent)" : ""}.</p>`;
  if (latestMonthIndex >= 0 && prevValue !== null) {
    const d = nowValue - prevValue;
    overlayText += `<p>In ${MONTHS[latestMonthIndex]} ${latestYear} it averaged ${fmt(nowValue)}, ${d >= 0 ? "up" : "down"} ${Math.abs(d).toFixed(1)}p on ${MONTHS[latestMonthIndex]} ${latestYear - 1} (${fmt(prevValue)}).</p>`;
  }
  document.getElementById("overlay-summary").innerHTML = overlayText;

  // 2. Usual pattern: how far each month sits above or below the 12-month average centred on it
  //    (a "2x12 centred moving average"). This takes out the long-term rise or fall, so a year of
  //    steadily rising prices doesn't make December look strong and January weak.
  const season = seasonalIndex(years);
  const monthBox = document.getElementById("month-chart").parentElement;
  const monthSummary = document.getElementById("month-summary");
  if (!season) {
    monthBox.hidden = true;
    if (charts["month-chart"]) { charts["month-chart"].destroy(); delete charts["month-chart"]; }
    monthSummary.innerHTML = `<p>This needs at least two years of every month, plus six months either side, so about three years of prices. Choose a longer time range.</p>`;
  } else {
    monthBox.hidden = false;
    const index = season.index;
    makeChart("month-chart", {
      type: "bar",
      data: {
        labels: MONTHS_SHORT,
        datasets: [{
          label: "Above or below the 12-month average",
          data: index.map(i => Math.round(i.avg * 100) / 100),
          backgroundColor: index.map(i => (i.avg >= 0 ? "#1b7a32" : "#b3261e")),
        }],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => MONTHS[items[0].dataIndex],
              label: item => {
                const i = index[item.dataIndex];
                return `${Math.abs(i.avg).toFixed(1)}% ${i.avg >= 0 ? "above" : "below"} the 12-month average (above it in ${i.above} of ${i.n} years)`;
              },
            },
          },
        },
        scales: {
          x: { ticks: { font: { size: 13 }, autoSkipPadding: 8, maxRotation: 0 }, grid: { display: false } },
          y: { title: { display: true, text: "% above or below 12-month average", font: { size: 13 } }, ticks: { font: { size: 13 }, callback: v => v + "%" } },
        },
      },
    });
    monthSummary.innerHTML = describeSeason(season, what);
  }

  // 3. Compare periods: the chosen months' average in each year.
  const s = Math.min(state.periodStart, state.periodEnd) - 1, e = Math.max(state.periodStart, state.periodEnd) - 1;
  const periodName = s === e ? MONTHS[s] : `${MONTHS[s]} to ${MONTHS[e]}`;
  const periods = yearList.map(y => {
    const vals = years[y].slice(s, e + 1);
    const have = vals.filter(v => v !== null);
    return { year: y, value: average(have), full: have.length === vals.length, months: have.length };
  }).filter(p => p.value !== null);

  makeChart("period-chart", {
    type: "bar",
    data: {
      labels: periods.map(p => (p.full ? String(p.year) : `${p.year} (part)`)),
      datasets: [{
        label: periodName,
        data: periods.map(p => Math.round(p.value * 10) / 10),
        backgroundColor: periods.map(p => (p.year === latestYear ? "#1f4a2c" : p.full ? "#6f8f7a" : "#c9d6cc")),
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => `${periodName} ${periods[items[0].dataIndex].year}`,
            label: item => {
              const p = periods[item.dataIndex];
              return `${fmt(p.value)} per kg average${p.full ? "" : ` (only ${p.months} of ${e - s + 1} months so far)`}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { font: { size: 13 }, autoSkipPadding: 6, maxRotation: 0 }, grid: { display: false } },
        y: { title: { display: true, text: "per kg deadweight", font: { size: 13 } }, ticks: { font: { size: 13 }, callback: v => v + "p" } },
      },
    },
  });

  const full = periods.filter(p => p.full);
  const periodSummary = document.getElementById("period-summary");
  if (!full.length) {
    periodSummary.innerHTML = `<p>No year in this range has prices for the whole of ${periodName}.</p>`;
  } else {
    const best = full.reduce((a, b) => (b.value > a.value ? b : a));
    const worst = full.reduce((a, b) => (b.value < a.value ? b : a));
    let text = `<p>Of the ${full.length} years with all of ${periodName}, the average ${what} price was highest in ${best.year} (${fmt(best.value)}) and lowest in ${worst.year} (${fmt(worst.value)}).</p>`;
    const last = periods[periods.length - 1], before = periods.find(p => p.year === last.year - 1);
    if (before) {
      const d = last.value - before.value;
      text += `<p>${last.year}${last.full ? "" : ` (${last.months} of ${e - s + 1} months so far)`}: ${fmt(last.value)}, ${d >= 0 ? "up" : "down"} ${Math.abs(d).toFixed(1)}p on ${before.year}.</p>`;
    }
    periodSummary.innerHTML = text;
  }
}

// ---------- Controls ----------

function buildControls() {
  document.getElementById("grade-buttons").innerHTML = GRADES.map(g =>
    `<button type="button" data-grade="${g.code}">${show(g.code)}</button>`).join("");
  document.getElementById("season-grade").innerHTML = GRADES.map(g =>
    `<option value="${g.code}">${show(g.code)}${g.code === "R4L" ? " (back to 2014)" : " (from 2019)"}</option>`).join("");
  const monthOptions = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  document.getElementById("period-start").innerHTML = monthOptions;
  document.getElementById("period-end").innerHTML = monthOptions;
}

function syncControls() {
  const stockBox = document.getElementById("stock-buttons");
  stockBox.innerHTML = STOCK[state.type].map(s =>
    `<button type="button" data-stock="${s}" aria-pressed="${s === stockNow()}">${s}</button>`).join("");

  document.querySelectorAll("[data-set]").forEach(btn =>
    btn.setAttribute("aria-pressed", String(state[btn.dataset.set] === btn.dataset.value)));
  document.querySelectorAll("[data-grade]").forEach(btn =>
    btn.setAttribute("aria-pressed", String(state.grades.includes(btn.dataset.grade))));
  document.querySelectorAll("[data-for]").forEach(el => { el.hidden = el.dataset.for !== state.type; });

  const custom = document.getElementById("custom-range");
  custom.hidden = state.range !== "custom";
  const { earliest, latest } = dataBounds();
  for (const id of ["date-from", "date-to"]) {
    const input = document.getElementById(id);
    input.min = earliest;
    input.max = latest;
  }
  document.getElementById("date-from").value = state.from;
  document.getElementById("date-to").value = state.to;
  document.getElementById("season-grade").value = state.seasonGrade;
  document.getElementById("period-start").value = state.periodStart;
  document.getElementById("period-end").value = state.periodEnd;

  // One-line reminder of the current choices, shown on the folded filter panel (phones).
  const rangeText = { "1": "1 year", "3": "3 years", "5": "5 years", all: "all years", custom: "custom dates" }[state.range];
  const what = state.type === "finished" ? `Finished ${state.stock.toLowerCase()} · ${state.region}`
    : state.type === "store" ? `Store ${state.stock.toLowerCase()} · Hereford Market`
    : `${state.calfStock} · Hereford Market`;
  document.getElementById("filter-current").textContent = `Showing: ${what} · ${rangeText}. Tap to change.`;
}

function update() {
  savePrefs(PREFS_KEY, state);
  syncControls();
  drawMain();
  drawSeasonal();
}

document.addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.set) {
    state[btn.dataset.set] = btn.dataset.value;
    if (btn.dataset.value === "custom" && !state.from) {
      const { earliest, latest } = dataBounds();
      state.from = addYears(latest, -1) < earliest ? earliest : addYears(latest, -1);
      state.to = latest;
    }
  } else if (btn.dataset.stock) {
    if (state.type === "calves") state.calfStock = btn.dataset.stock;
    else state.stock = btn.dataset.stock;
  } else if (btn.dataset.grade) {
    const code = btn.dataset.grade;
    if (state.grades.includes(code)) {
      if (state.grades.length > 1) state.grades = state.grades.filter(c => c !== code);  // always keep one
    } else {
      state.grades = GRADES.map(g => g.code).filter(c => c === code || state.grades.includes(c));
    }
  } else return;
  update();
});

document.getElementById("date-from").addEventListener("change", e => { state.from = e.target.value; update(); });
document.getElementById("date-to").addEventListener("change", e => { state.to = e.target.value; update(); });
document.getElementById("season-grade").addEventListener("change", e => { state.seasonGrade = e.target.value; update(); });
document.getElementById("period-start").addEventListener("change", e => { state.periodStart = Number(e.target.value); update(); });
document.getElementById("period-end").addEventListener("change", e => { state.periodEnd = Number(e.target.value); update(); });

// ---------- Start ----------

async function start() {
  try {
    if (typeof Chart === "undefined") throw new Error("Chart.js did not load");
    [data.weekly, data.monthly, data.store, data.calves, data.sources] = await Promise.all([
      loadCSV("data/deadweight_weekly.csv"),
      loadCSV("data/deadweight_monthly.csv"),
      loadCSV("data/hereford_store_cattle.csv"),
      loadCSV("data/hereford_calves.csv"),
      loadCSV("data/sources.csv"),
    ]);
    data.weekly.sort((a, b) => a.week_ending.localeCompare(b.week_ending));
    data.monthly.sort((a, b) => a.month.localeCompare(b.month));
    buildControls();
    // Filters start folded away on phones, so the chart is near the top; always open on laptops.
    document.getElementById("filter-details").open = window.matchMedia("(min-width: 1000px)").matches;
    update();
  } catch (e) {
    document.getElementById("main-summary").innerHTML =
      `<p class="no-data">The charts can't be shown just now. Check your internet connection and refresh the page. If that doesn't help, let the person who runs this site know.</p>`;
  }
}

start();
