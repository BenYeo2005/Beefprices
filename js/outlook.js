// Price outlook page. The words come from data/outlook.json (updated monthly);
// the seasonal pattern and grade gaps are worked out live from the AHDB price files.

function sourceDate(published, weeklySource) {
  if (published === "from data/sources.csv") return weeklySource ? ukDate(weeklySource.source_last_updated) : "";
  if (/^\d{4}-\d{2}$/.test(published)) {
    return new Date(published + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return longDate(published, false);
}

function sourceLinks(ids, outlook, weeklySource) {
  if (!ids.length) return "";
  const links = ids.map(id => {
    const s = outlook.sources[id];
    if (!s) return `<span class="no-data">Missing source "${id}"</span>`;
    return `<a href="${s.url}">${s.publisher}: ${s.title}</a> (${sourceDate(s.published, weeklySource)})`;
  });
  return `<span class="point-source">Source: ${links.join("; ")}</span>`;
}

function pointList(points, outlook, weeklySource, extra = {}) {
  return points.map(p => `
    <li class="point">
      ${p.topic ? `<span class="point-topic">${p.topic}</span>` : ""}
      <p>${p.text}${p.live && extra[p.live] ? " " + extra[p.live] : ""}</p>
      ${sourceLinks(p.sources, outlook, weeklySource)}
    </li>`).join("");
}

// Latest-week gap between R4L and the grades dairy-cross cattle usually get, from AHDB's weekly file.
function gradeGapText(weekly) {
  const region = "England and Wales";
  const latest = weekly.filter(r => r.region === region).map(r => r.week_ending).sort().pop();
  const parts = ["Steers", "Heifers"].map(cat => {
    const r = weekly.find(x => x.week_ending === latest && x.region === region && x.category === cat);
    if (!r) return null;
    const r4l = num(r.R4L), o4l = num(r["O+4L"]), mo4l = num(r["-O4L"]);
    if (r4l === null || o4l === null || mo4l === null) return null;
    const gap = v => `${Math.abs(v - r4l).toFixed(1)}p/kg ${v < r4l ? "below" : "above"}`;
    return `${cat.toLowerCase()}: O+4L ${gap(o4l)} R4L, −O4L ${gap(mo4l)}`;
  }).filter(Boolean);
  return parts.length ? `In the week ending ${longDate(latest, false)} (England and Wales), ${parts.join("; ")}.` : "";
}

function showSeason(monthly, monthlySource) {
  const years = {};
  monthly.filter(r => r.category === "Steers" && r.region === "England and Wales").forEach(r => {
    const v = num(r.R4L);
    if (v === null) return;
    const y = Number(r.month.slice(0, 4));
    (years[y] ||= Array(12).fill(null))[Number(r.month.slice(5, 7)) - 1] = v;
  });
  const yearNums = Object.keys(years).map(Number).sort((a, b) => a - b);
  const last = yearNums[yearNums.length - 1];
  const recent = Object.fromEntries(yearNums.filter(y => y >= last - 5).map(y => [y, years[y]]));
  const what = "R4L steer";
  const recentSeason = seasonalIndex(recent);
  const allSeason = seasonalIndex(years);
  document.getElementById("season").innerHTML =
    (recentSeason ? `<p class="label">Last few years</p>${describeSeason(recentSeason, what)}` : "") +
    (allSeason ? `<p class="label">All years since ${yearNums[0]}</p>${describeSeason(allSeason, what)}` : "") +
    (!recentSeason && !allSeason ? `<p class="no-data">Not enough monthly prices to work out a pattern.</p>` : "");
  if (monthlySource) {
    document.getElementById("season-source").innerHTML =
      `Source: <a href="${monthlySource.source_url}">AHDB, GB deadweight cattle prices (monthly)</a>, published ${ukDate(monthlySource.source_last_updated)}. ` +
      `Calculated by this site: each month compared with the 12-month average around it.`;
  }
}

async function start() {
  try {
    const [response, weekly, monthly, sources] = await Promise.all([
      fetch("data/outlook.json", { cache: "no-cache" }),
      loadCSV("data/deadweight_weekly.csv"),
      loadCSV("data/deadweight_monthly.csv"),
      loadCSV("data/sources.csv"),
    ]);
    if (!response.ok) throw new Error("Could not load outlook");
    const outlook = await response.json();
    const weeklySource = sources.find(s => s.dataset === "deadweight_weekly");
    const monthlySource = sources.find(s => s.dataset === "deadweight_monthly");

    const reviewed = longDate(outlook.last_reviewed, false);
    const due = longDate(outlook.next_review_due, false);
    const overdue = todayISO() > outlook.next_review_due;
    document.getElementById("review-line").innerHTML =
      `<strong>Last reviewed:</strong> ${reviewed} · <strong>Next review due:</strong> ${due}` +
      (overdue ? ` <span class="overdue">This page is overdue for review, so some points may be out of date.</span>` : "");
    document.getElementById("footer-review").textContent = `Outlook last reviewed ${reviewed}. Next review due ${due}.`;

    document.getElementById("summary").innerHTML = outlook.summary.map(s =>
      `<p>${s.text} ${sourceLinks(s.sources, outlook, weeklySource)}</p>`).join("");
    document.getElementById("up-list").innerHTML = pointList(outlook.up, outlook, weeklySource);
    document.getElementById("down-list").innerHTML = pointList(outlook.down, outlook, weeklySource);
    document.getElementById("watch-note").textContent = outlook.watch_note;
    document.getElementById("watch-list").innerHTML = pointList(outlook.watch, outlook, weeklySource);
    document.getElementById("dairy-list").innerHTML =
      pointList(outlook.dairy_cross, outlook, weeklySource, { grade_gap: gradeGapText(weekly) });
    document.getElementById("limitations").innerHTML = outlook.limitations.map(l => `<li>${l}</li>`).join("");
    showSeason(monthly, monthlySource);
  } catch (e) {
    document.getElementById("summary").innerHTML =
      `<p class="no-data">The outlook can't be shown just now. Try refreshing the page. If that doesn't help, let the person who runs this site know.</p>`;
  }
}

start();
