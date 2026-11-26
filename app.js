// Tableau de bord Strava : tout est calculé côté navigateur à partir de /api/activities.
const $ = (s) => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";

// ---------- libellés ----------
const SPORT_FR = {
  Run: "Course", TrailRun: "Trail", VirtualRun: "Course virtuelle", Walk: "Marche", Hike: "Randonnée",
  Ride: "Vélo", VirtualRide: "Home trainer", GravelRide: "Gravel", MountainBikeRide: "VTT", EBikeRide: "Vélo électrique",
  EMountainBikeRide: "VTT électrique", Velomobile: "Vélomobile", Handcycle: "Handbike", Swim: "Natation",
  WeightTraining: "Muscu", Workout: "Entraînement", Crossfit: "Crossfit", HighIntensityIntervalTraining: "HIIT",
  Yoga: "Yoga", Pilates: "Pilates", Elliptical: "Elliptique", StairStepper: "Stepper", Rowing: "Aviron",
  VirtualRow: "Rameur", AlpineSki: "Ski alpin", NordicSki: "Ski de fond", BackcountrySki: "Ski de rando",
  Snowboard: "Snowboard", Snowshoe: "Raquettes", IceSkate: "Patin", InlineSkate: "Roller", Skateboard: "Skate",
  Kayaking: "Kayak", Canoeing: "Canoë", StandUpPaddling: "Paddle", Surfing: "Surf", Kitesurf: "Kitesurf",
  Windsurf: "Planche à voile", Sail: "Voile", RockClimbing: "Escalade", Soccer: "Foot", Tennis: "Tennis",
  Badminton: "Badminton", TableTennis: "Ping-pong", Squash: "Squash", Padel: "Padel", Pickleball: "Pickleball",
  Golf: "Golf", Wheelchair: "Fauteuil",
};
const sportName = (s) => SPORT_FR[s] || s.replace(/([a-z])([A-Z])/g, "$1 $2");
const PACE_SPORTS = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike", "Snowshoe"]);
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const CUM_LABEL = { distance: "Distance cumulée", time: "Temps cumulé", elevation: "Dénivelé cumulé", count: "Nombre d'activités cumulé" };
const METRICS = {
  distance: { label: "Distance", unit: "km", val: (a) => a.distance / 1000, fmt: (v) => fmtNum(v, v < 100 ? 1 : 0) + " km" },
  time: { label: "Temps", unit: "h", val: (a) => a.moving_time / 3600, fmt: (v) => fmtHours(v) },
  elevation: { label: "Dénivelé +", unit: "m", val: (a) => a.elevation || 0, fmt: (v) => fmtNum(v, 0) + " m" },
  count: { label: "Activités", unit: "", val: () => 1, fmt: (v) => fmtNum(v, 0) },
};

// ---------- formats ----------
const nf = {};
function fmtNum(v, d = 0) {
  nf[d] ??= new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  return nf[d].format(v);
}
function fmtHours(h) {
  if (h >= 100) return fmtNum(h, 0) + " h";
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
function fmtDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function fmtSpeed(a) {
  if (!a.avg_speed) return "–";
  if (a.sport === "Swim") return fmtDuration(100 / a.avg_speed) + " /100 m";
  if (PACE_SPORTS.has(a.sport)) return fmtDuration(1000 / a.avg_speed) + " /km";
  return fmtNum(a.avg_speed * 3.6, 1) + " km/h";
}
const fmtDate = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}
const stravaLink = (a) => `https://www.strava.com/activities/${a.id}`;

// ---------- état ----------
let ALL = [];
let SPORT_COLOR = {};
const state = { period: "all", metric: "distance", sports: null, gran: "month", top: "kudos", search: "", sort: "date", asc: false, page: 0 };

function prepare(list) {
  for (const a of list) {
    // start_date_local : heure locale de l'activité, le "Z" final n'a pas de sens -> on le retire
    a.date = new Date(a.start.slice(0, 19));
    a.year = a.date.getFullYear();
    a.day = dayKey(a.date);
    a.dow = (a.date.getDay() + 6) % 7;
    a.hour = a.date.getHours();
  }
  list.sort((x, y) => x.date - y.date);
  // couleur fixe par sport (ordre = nombre d'activités sur tout l'historique), 8 couleurs max puis gris
  const counts = {};
  for (const a of list) counts[a.sport] = (counts[a.sport] || 0) + 1;
  const order = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
  SPORT_COLOR = {};
  order.forEach((s, i) => (SPORT_COLOR[s] = i < 8 ? `var(--series-${i + 1})` : "var(--other)"));
  return { list, order, counts };
}

function periodRange() {
  const now = new Date();
  if (state.period === "all") return [ALL.length ? ALL[0].date : now, now];
  if (state.period === "last12") return [new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1), now];
  if (state.period === "last24") return [new Date(now.getFullYear() - 2, now.getMonth(), now.getDate() + 1), now];
  if (state.period === "last36") return [new Date(now.getFullYear() - 3, now.getMonth(), now.getDate() + 1), now];
  if (state.period === "custom") return [new Date(state.from + "T00:00"), new Date(state.to + "T23:59:59")];
  const y = Number(state.period);
  return [new Date(y, 0, 1), y === now.getFullYear() ? now : new Date(y, 11, 31, 23, 59)];
}
const bySport = (a) => state.sports.has(a.sport);
function filtered() {
  const [from, to] = periodRange();
  return ALL.filter((a) => bySport(a) && a.date >= from && a.date <= to);
}

// ---------- tooltip ----------
const tip = $("#tip");
function showTip(e, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
const hideTip = () => (tip.hidden = true);

// ---------- petits outils SVG ----------
// largeur de dessin des graphiques : celle de l'écran sur téléphone (texte lisible), 1000 au plus sur ordinateur
function CW(max = 1000) {
  const main = document.querySelector("main#dash");
  const avail = (main?.clientWidth || innerWidth) - (innerWidth < 800 ? 44 : 60);
  return Math.round(Math.max(300, Math.min(max, avail)));
}
let lastW = innerWidth;
addEventListener("resize", () => {
  clearTimeout(window.__rz);
  window.__rz = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 60 && ALL.length) { lastW = innerWidth; render(); } }, 300);
});
function svg(w, h) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", `0 0 ${w} ${h}`);
  return s;
}
function el(parent, tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  parent.appendChild(n);
  return n;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function shortNum(v) {
  if (v >= 10000) return fmtNum(v / 1000, 0) + " k";
  // jusqu'à 2 décimales, sans zéros inutiles : 1 250 → « 1,25 k », 2 500 → « 2,5 k »
  if (v >= 1000) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v / 1000) + " k";
  return fmtNum(v, v < 10 && v % 1 ? 1 : 0);
}
function yAxis(s, W, H, pad, max) {
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, y = H - pad.b - ((H - pad.t - pad.b) * i) / 4;
    el(s, "line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: i ? "grid-line" : "base-line" });
    el(s, "text", { x: pad.l - 6, y: y + 4, "text-anchor": "end" }, shortNum(v));
  }
}

// ---------- graphique en barres empilées ----------
// buckets : [{ label, tip, parts: { sport: valeur } }]
function stackedBars(container, buckets, metric, { height = 260, width = CW(), labelEvery } = {}) {
  container.innerHTML = "";
  if (!buckets.length) return (container.innerHTML = '<p class="empty">Rien sur cette période.</p>');
  const W = width, H = height, pad = { t: 10, r: 8, b: 26, l: 44 };
  const totals = buckets.map((b) => Object.values(b.parts).reduce((x, y) => x + y, 0));
  const max = niceMax(Math.max(...totals));
  const s = svg(W, H);
  yAxis(s, W, H, pad, max);
  const n = buckets.length, slot = (W - pad.l - pad.r) / n;
  const bw = Math.max(1, Math.min(48, slot - (slot > 6 ? 2 : 0)));
  const sy = (v) => ((H - pad.t - pad.b) * v) / max;
  const every = labelEvery || Math.ceil(n / Math.floor((W - pad.l) / 70));
  const order = Object.keys(SPORT_COLOR);
  buckets.forEach((b, i) => {
    const x = pad.l + i * slot + (slot - bw) / 2;
    let y = H - pad.b;
    const sports = order.filter((sp) => b.parts[sp] > 0);
    sports.forEach((sp, j) => {
      const h = sy(b.parts[sp]);
      const gap = j < sports.length - 1 && h > 3 ? 1 : 0; // fine séparation entre segments
      el(s, "rect", { x, y: y - h + gap, width: bw, height: Math.max(0, h - gap), fill: SPORT_COLOR[sp], rx: j === sports.length - 1 ? Math.min(3, bw / 3) : 0 });
      y -= h;
    });
    if (i % every === 0) el(s, "text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle" }, b.label);
    const hit = el(s, "rect", { x: pad.l + i * slot, y: pad.t, width: slot, height: H - pad.t - pad.b, class: "hit" });
    hit.addEventListener("mousemove", (e) => {
      const rows = sports.slice().reverse().map((sp) =>
        `<div class="row"><span><i class="dot" style="background:${SPORT_COLOR[sp]}"></i> ${sportName(sp)}</span><span>${metric.fmt(b.parts[sp])}</span></div>`).join("");
      showTip(e, `<b>${b.tip} : ${metric.fmt(totals[i])}</b>${sports.length > 1 ? rows : ""}`);
    });
    hit.addEventListener("mouseleave", hideTip);
  });
  container.appendChild(s);
}

// ---------- rendu ----------
function renderFilters(order, counts) {
  const years = [...new Set(ALL.map((a) => a.year))].sort((a, b) => b - a);
  $("#fPeriod").innerHTML =
    `<option value="all">Tout l'historique</option><option value="last12">12 derniers mois</option><option value="last24">2 dernières années</option><option value="last36">3 dernières années</option>` +
    years.map((y) => `<option value="${y}">${y}</option>`).join("") +
    `<option value="custom">Choisir deux dates…</option>`;
  $("#fPeriod").value = state.period;
  $("#fRange").hidden = state.period !== "custom";
  const chips = $("#fSports");
  chips.innerHTML =
    `<button class="chip" data-all="1">Tous</button>` +
    // les 7 sports principaux toujours visibles, les autres derrière « +N »
    order.map((s, i) => `<button class="chip ${state.sports.has(s) ? "on" : ""} ${i >= 7 ? "extra" : ""}" data-sport="${s}"><i class="dot" style="background:${SPORT_COLOR[s]}"></i>${esc(sportName(s))} <span class="muted">${counts[s]}</span></button>`).join("") +
    (order.length > 7 ? `<button class="chip more" data-more="1">+${order.length - 7}</button>` : "");
  chips.classList.toggle("all", state.sports.size === order.length);
}

function renderKpis(list) {
  const sum = (f) => list.reduce((t, a) => t + f(a), 0);
  const days = [...new Set(list.map((a) => a.day))].sort();
  // plus longue série de jours consécutifs
  let best = 0, cur = 0, prev = null;
  for (const d of days) {
    const t = new Date(d + "T12:00").getTime();
    cur = prev != null && Math.round((t - prev) / 86400000) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = t;
  }
  const [from, to] = periodRange();
  const weeks = Math.max(1, (to - from) / (7 * 86400000));
  const km = sum((a) => a.distance) / 1000, h = sum((a) => a.moving_time) / 3600;
  const tiles = [
    ["Activités", fmtNum(list.length), `${fmtNum(list.length / weeks, 1)} par semaine`],
    ["Distance", fmtNum(km, 0) + " km", `${fmtNum(km / weeks, 1)} km par semaine`],
    ["Temps en mouvement", fmtHours(h), `${fmtHours(h / weeks)} par semaine`],
    ["Dénivelé +", fmtNum(sum((a) => a.elevation || 0), 0) + " m", `${fmtNum(sum((a) => a.elevation || 0) / 8849, 1)} × l'Everest`],
    ["Jours actifs", fmtNum(days.length), `plus longue série : ${best} j`],
    ["Kudos reçus", fmtNum(sum((a) => a.kudos || 0)), `${fmtNum(sum((a) => a.prs || 0))} records perso`],
  ];
  $("#kpis").innerHTML = tiles.map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
}

function renderVolume(list) {
  const metric = METRICS[state.metric];
  $("#volTitle").textContent = `${metric.label} par ${{ week: "semaine", month: "mois", year: "année" }[state.gran]}`;
  const [from, to] = periodRange();
  const buckets = [], index = new Map();
  const add = (key, label, tipText) => { const b = { label, tip: tipText, parts: {} }; index.set(key, b); buckets.push(b); };
  if (state.gran === "year") {
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) add(String(y), String(y), String(y));
  } else if (state.gran === "month") {
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d.setMonth(d.getMonth() + 1)) {
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      add(k, d.getMonth() === 0 || buckets.length === 0 ? `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : MONTHS[d.getMonth()], `${MONTHS[d.getMonth()]} ${d.getFullYear()}`);
    }
  } else {
    for (let d = mondayOf(from); d <= to; d.setDate(d.getDate() + 7)) {
      add(dayKey(d), `${d.getDate()} ${MONTHS[d.getMonth()]}`, `Semaine du ${fmtDate(d)}`);
    }
  }
  const keyOf = { year: (a) => String(a.year), month: (a) => `${a.year}-${a.date.getMonth()}`, week: (a) => dayKey(mondayOf(a.date)) }[state.gran];
  for (const a of list) {
    const b = index.get(keyOf(a));
    if (b) b.parts[a.sport] = (b.parts[a.sport] || 0) + metric.val(a);
  }
  stackedBars($("#chartVolume"), buckets, metric);
}

function renderCumul() {
  const metric = METRICS[state.metric];
  $("#cumTitle").textContent = `${CUM_LABEL[state.metric]}, année par année`;
  const c = $("#chartCumul");
  c.innerHTML = "";
  // suit la période choisie : seules les activités de la période comptent
  const [pFrom, pTo] = periodRange();
  const list = ALL.filter((a) => bySport(a) && a.date >= pFrom && a.date <= pTo);
  const years = [...new Set(list.map((a) => a.year))].sort();
  if (!years.length) return (c.innerHTML = '<p class="empty">Rien à afficher.</p>');
  const now = new Date(), thisYear = now.getFullYear();
  const doy = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000);
  const series = {};
  for (const y of years) series[y] = new Float64Array(366);
  for (const a of list) series[a.year][doy(a.date)] += metric.val(a);
  for (const y of years) for (let i = 1; i < 366; i++) series[y][i] += series[y][i - 1];
  const lastDay = (y) => (y === pTo.getFullYear() ? doy(pTo) : 365);
  const max = niceMax(Math.max(...years.map((y) => series[y][lastDay(y)])));
  const W = CW(), H = 300, pad = { t: 10, r: 60, b: 26, l: 44 };
  const s = svg(W, H);
  yAxis(s, W, H, pad, max);
  const sx = (i) => pad.l + ((W - pad.l - pad.r) * i) / 365;
  const sy = (v) => H - pad.b - ((H - pad.t - pad.b) * v) / max;
  for (let m = 0; m < 12; m++) {
    const x = sx(doy(new Date(2001, m, 1)));
    el(s, "text", { x: x + 2, y: H - 8 }, MONTHS[m]);
  }
  // année en cours en bleu, précédente en orange, les autres en gris discret
  const style = (y) => y === years.at(-1) ? { stroke: "var(--series-1)", w: 2.5 } : y === years.at(-2) ? { stroke: "var(--series-2)", w: 2 } : { stroke: "var(--other)", w: 1 };
  const ordered = years.slice().sort((a, b) => (style(a).w - style(b).w));
  for (const y of ordered) {
    const pts = [];
    for (let i = 0; i <= lastDay(y); i += 2) pts.push(`${sx(i).toFixed(1)},${sy(series[y][i]).toFixed(1)}`);
    pts.push(`${sx(lastDay(y)).toFixed(1)},${sy(series[y][lastDay(y)]).toFixed(1)}`);
    const st = style(y);
    el(s, "polyline", { points: pts.join(" "), fill: "none", stroke: st.stroke, "stroke-width": st.w, "stroke-linejoin": "round" });
    if (st.w > 1) {
      el(s, "circle", { cx: sx(lastDay(y)), cy: sy(series[y][lastDay(y)]), r: 4, fill: st.stroke, stroke: "var(--surface-1)", "stroke-width": 2 });
      el(s, "text", { x: sx(lastDay(y)) + 8, y: sy(series[y][lastDay(y)]) + 4, style: "fill:var(--text-secondary);font-weight:600" }, y);
    }
  }
  // réticule
  const cross = el(s, "line", { y1: pad.t, y2: H - pad.b, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" });
  const hit = el(s, "rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, class: "hit" });
  hit.addEventListener("mousemove", (e) => {
    const r = s.getBoundingClientRect();
    const i = Math.max(0, Math.min(365, Math.round((((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r) * 365)));
    cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("visibility", "visible");
    const d = new Date(2001, 0, 1 + i);
    const rows = years.filter((y) => i <= lastDay(y)).sort((a, b) => series[b][i] - series[a][i] || b - a).map((y) =>
      `<div class="row"><span><i class="dot" style="background:${style(y).stroke}"></i> ${y}</span><span>${metric.fmt(series[y][i])}</span></div>`).join("");
    showTip(e, `<b>Au ${d.getDate()} ${MONTHS[d.getMonth()]}</b>${rows}`);
  });
  hit.addEventListener("mouseleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
  c.appendChild(s);
  const leg = document.createElement("div");
  leg.className = "legend";
  leg.innerHTML = years.slice().reverse().slice(0, 2).map((y) => `<span><i style="background:${style(y).stroke}"></i>${y}</span>`).join("") +
    (years.length > 2 ? `<span><i style="background:var(--other)"></i>années précédentes</span>` : "");
  c.appendChild(leg);
}

// ---------- cumul de tous les temps ----------
// une seule courbe depuis la première activité ; suit le filtre de sport, pas celui de période
// (la période choisie est surlignée en fond)
function renderAllTime() {
  const metric = METRICS[state.metric];
  $("#allTitle").textContent = `${CUM_LABEL[state.metric]} depuis le début`;
  const c = $("#chartAll");
  c.innerHTML = "";
  const list = ALL.filter(bySport);
  if (!list.length) { c.innerHTML = '<p class="empty">Rien à afficher.</p>'; return; }
  const DAY = 86400000;
  const t0 = new Date(list[0].date.getFullYear(), list[0].date.getMonth(), list[0].date.getDate()).getTime();
  const t1 = Date.now();
  const days = Math.ceil((t1 - t0) / DAY) + 1;
  const perDay = new Float64Array(days);
  for (const a of list) perDay[Math.floor((a.date - t0) / DAY)] += metric.val(a);
  const cum = new Float64Array(days);
  for (let i = 0; i < days; i++) cum[i] = (i ? cum[i - 1] : 0) + perDay[i];
  const total = cum[days - 1];
  const gain = (i, n) => cum[i] - (i - n >= 0 ? cum[i - n] : 0);
  $("#allInfo").textContent = `${metric.fmt(total)} au total`;

  const W = CW(), H = 320, pad = { t: 14, r: 16, b: 26, l: 52 };
  const s = svg(W, H);
  const max = niceMax(total);
  const sx = (i) => pad.l + (i / (days - 1)) * (W - pad.l - pad.r);
  const sy = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  // période choisie en fond
  const [pf, pt] = periodRange();
  if (state.period !== "all") {
    const i0 = Math.max(0, Math.floor((pf - t0) / DAY)), i1 = Math.min(days - 1, Math.floor((pt - t0) / DAY));
    if (i1 > i0) el(s, "rect", { x: sx(i0), y: pad.t, width: sx(i1) - sx(i0), height: H - pad.t - pad.b, fill: "var(--series-1)", opacity: 0.08 });
  }
  yAxis(s, W, H, pad, max);
  // repères d'années
  for (let y = new Date(t0).getFullYear() + 1; y <= new Date(t1).getFullYear(); y++) {
    const i = Math.floor((new Date(y, 0, 1) - t0) / DAY);
    el(s, "line", { x1: sx(i), x2: sx(i), y1: pad.t, y2: H - pad.b, class: "grid-line" });
    el(s, "text", { x: sx(i) + 3, y: H - 8 }, y);
  }
  // courbe (1 point tous les 3 jours suffit)
  const pts = [];
  for (let i = 0; i < days; i += 3) pts.push(`${sx(i).toFixed(1)},${sy(cum[i]).toFixed(1)}`);
  pts.push(`${sx(days - 1).toFixed(1)},${sy(total).toFixed(1)}`);
  const area = `${sx(0)},${sy(0)} ${pts.join(" ")} ${sx(days - 1)},${sy(0)}`;
  el(s, "polygon", { points: area, fill: "var(--series-1)", opacity: 0.12 });
  el(s, "polyline", { points: pts.join(" "), fill: "none", stroke: "var(--series-1)", "stroke-width": 2.5, "stroke-linejoin": "round" });
  el(s, "circle", { cx: sx(days - 1), cy: sy(total), r: 4.5, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2 });

  // réticule : cumul à la date, et ce qui a été ajouté sur 30 jours et 12 mois
  const cross = el(s, "line", { y1: pad.t, y2: H - pad.b, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" });
  const dot = el(s, "circle", { r: 4.5, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2, visibility: "hidden" });
  const hit = el(s, "rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, class: "hit" });
  hit.addEventListener("mousemove", (e) => {
    const r = s.getBoundingClientRect();
    const i = Math.max(0, Math.min(days - 1, Math.round(((((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r)) * (days - 1))));
    for (const n of [cross]) { n.setAttribute("x1", sx(i)); n.setAttribute("x2", sx(i)); n.setAttribute("visibility", "visible"); }
    dot.setAttribute("cx", sx(i)); dot.setAttribute("cy", sy(cum[i])); dot.setAttribute("visibility", "visible");
    showTip(e, `<b>${fmtDate(new Date(t0 + i * DAY))}</b>
      <div class="row"><span>Cumul</span><span>${metric.fmt(cum[i])}</span></div>
      <div class="row"><span>30 jours précédents</span><span>+${metric.fmt(gain(i, 30))}</span></div>
      <div class="row"><span>12 mois précédents</span><span>+${metric.fmt(gain(i, 365))}</span></div>`);
  });
  hit.addEventListener("mouseleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
  c.appendChild(s);

  // quand ça accélère vraiment : les 12 mois glissants les plus chargés, et le point de bascule (moitié du total)
  let bestI = 365, bestG = -1;
  for (let i = 365; i < days; i++) { const g = gain(i, 365); if (g > bestG) { bestG = g; bestI = i; } }
  const half = cum.findIndex((v) => v >= total / 2);
  const note = document.createElement("p");
  note.className = "muted";
  const fmtD = (i) => fmtDate(new Date(t0 + i * DAY));
  note.innerHTML = `La moitié du total a été faite après le <b>${fmtD(half)}</b>, soit sur les ${fmtNum((days - half) / 365.25, 1)} dernières années sur ${fmtNum(days / 365.25, 1)}.` +
    (days > 365 ? ` Les 12 mois les plus chargés : du ${fmtD(bestI - 365)} au ${fmtD(bestI)} (+${metric.fmt(bestG)}).` : "") +
    (state.period !== "all" ? " La bande bleutée montre la période choisie." : "");
  c.appendChild(note);
}

function renderHeatmap() {
  const metric = METRICS[state.metric];
  const c = $("#heatmap");
  c.innerHTML = "";
  // même période que le reste de la page
  const [pFrom, pTo] = periodRange();
  const from = new Date(pFrom.getFullYear(), pFrom.getMonth(), pFrom.getDate());
  const to = new Date(pTo.getFullYear(), pTo.getMonth(), pTo.getDate());
  const perDay = new Map();
  for (const a of ALL) {
    if (!bySport(a) || a.date < pFrom || a.date > pTo) continue;
    const e = perDay.get(a.day) || { v: 0, acts: [] };
    e.v += metric.val(a); e.acts.push(a);
    perDay.set(a.day, e);
  }
  // seuils par quantiles des jours actifs de toute la période -> 5 niveaux d'une seule teinte
  const vals = [...perDay.values()].map((e) => e.v).sort((a, b) => a - b);
  const q = [0.2, 0.4, 0.6, 0.8].map((p) => vals[Math.floor(p * (vals.length - 1))] ?? 0);
  const level = (v) => (v <= 0 ? 0 : 1 + q.filter((t) => v > t).length);

  // jusqu'à un an : une seule bande ; au-delà : une bande par année, la plus récente en haut
  const strips = [];
  if ((to - from) / 86400000 <= 370) strips.push({ f: from, t: to, start: mondayOf(from), label: null });
  else for (let y = to.getFullYear(); y >= from.getFullYear(); y--) {
    strips.push({ f: new Date(Math.max(from, new Date(y, 0, 1))), t: new Date(Math.min(to, new Date(y, 11, 31))), start: mondayOf(new Date(y, 0, 1)), label: y, weeks: 54 });
  }
  const total = [...perDay.keys()].length;
  $("#heatYear").textContent = `du ${fmtDate(from)} au ${fmtDate(to)} · ${fmtNum(total)} jours actifs`;

  const cell = 15, gap = 3, padL = 30;
  for (const st of strips) {
    const padT = 18;
    const weeks = st.weeks || Math.ceil((st.t - st.start) / (7 * 86400000)) + 1;
    const W = padL + weeks * (cell + gap), H = padT + 7 * (cell + gap);
    const narrow = innerWidth < 800;
    if (st.label != null) {
      const active = [...perDay.keys()].filter((k) => k.startsWith(st.label + "-")).length;
      const h = document.createElement("h3");
      h.className = "sub-title heat-year";
      h.textContent = `${st.label} · ${active} jours actifs`;
      c.appendChild(h);
    }
    const s = svg(W, H);
    s.style.maxWidth = Math.round(W * 1.3) + "px"; // période courte : on ne gonfle pas les cases
    if (narrow) s.style.minWidth = Math.round(W * 0.75) + "px"; // téléphone : on fait défiler plutôt que d'écraser les cases
    [0, 2, 4].forEach((d) => el(s, "text", { x: 0, y: padT + d * (cell + gap) + cell - 3 }, DAYS[d]));
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(st.start.getFullYear(), st.start.getMonth(), st.start.getDate() + w * 7 + d);
        if (day < st.f || day > st.t) continue;
        if (day.getMonth() !== lastMonth && (d === 0 || day.getDate() === 1)) {
          lastMonth = day.getMonth();
          el(s, "text", { x: padL + w * (cell + gap), y: 11 }, MONTHS[lastMonth]);
        }
        const e = perDay.get(dayKey(day));
        const r = el(s, "rect", { x: padL + w * (cell + gap), y: padT + d * (cell + gap), width: cell, height: cell, rx: 3, fill: `var(--seq-${level(e?.v || 0)})` });
        r.addEventListener("mousemove", (ev) => showTip(ev, `<b>${day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b>` +
          (e ? e.acts.map((a) => `<div class="row"><span><i class="dot" style="background:${SPORT_COLOR[a.sport]}"></i> ${esc(a.name)}</span></div>`).join("") + `<div class="row"><span>Total</span><span>${metric.fmt(e.v)}</span></div>` : "Repos")));
        r.addEventListener("mouseleave", hideTip);
      }
    }
    c.appendChild(s);
  }
  const leg = document.createElement("div");
  leg.className = "legend";
  leg.innerHTML = `<span>moins</span>` + [0, 1, 2, 3, 4, 5].map((l) => `<span><i style="width:12px;height:12px;border-radius:3px;background:var(--seq-${l})"></i></span>`).join("") + `<span>plus</span>`;
  c.appendChild(leg);
}

function renderSports(list) {
  const metric = METRICS[state.metric];
  const tot = {}, n = {};
  for (const a of list) { tot[a.sport] = (tot[a.sport] || 0) + metric.val(a); n[a.sport] = (n[a.sport] || 0) + 1; }
  const rows = Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
  const max = Math.max(...Object.values(tot), 0);
  const all = Object.values(tot).reduce((a, b) => a + b, 0);
  $("#chartSports").innerHTML = rows.length ? rows.map((sp) => `
    <div class="hbar" title="${n[sp]} activités, ${fmtNum((tot[sp] / all) * 100, 0)} %">
      <span>${esc(sportName(sp))}</span>
      <div class="track"><div class="fill" style="width:${(tot[sp] / max) * 100}%;background:${SPORT_COLOR[sp]}"></div></div>
      <span class="val">${metric.fmt(tot[sp])}</span>
    </div>`).join("") : '<p class="empty">Rien sur cette période.</p>';
}

function simpleBars(container, labels, values, metric, title) {
  const buckets = labels.map((l, i) => ({ label: l, tip: title(i), parts: values[i] }));
  stackedBars(container, buckets, metric, { height: 170, width: CW(480), labelEvery: labels.length > 12 ? 3 : (CW() < 500 ? 2 : 1) });
}
function renderWhen(list) {
  const metric = METRICS[state.metric];
  const wd = DAYS.map(() => ({})), hr = Array.from({ length: 24 }, () => ({}));
  for (const a of list) {
    wd[a.dow][a.sport] = (wd[a.dow][a.sport] || 0) + metric.val(a);
    hr[a.hour][a.sport] = (hr[a.hour][a.sport] || 0) + metric.val(a);
  }
  const DAYS_LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  simpleBars($("#chartWeekday"), DAYS, wd, metric, (i) => DAYS_LONG[i]);
  simpleBars($("#chartHour"), hr.map((_, i) => `${i} h`), hr, metric, (i) => `Départ entre ${i} h et ${i + 1} h`);
}

function renderRecords(list) {
  const groups = {};
  for (const a of list) (groups[a.sport] ||= []).push(a);
  const sports = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length).slice(0, 6);
  const link = (a, v) => `<a href="${stravaLink(a)}" target="_blank" rel="noopener" title="${esc(a.name)} · ${fmtDate(a.date)}">${v}</a>`;
  const top = (arr, f) => arr.reduce((b, a) => (f(a) > f(b) ? a : b), arr[0]);
  $("#records").innerHTML = sports.map((sp) => {
    const acts = groups[sp];
    const rows = [];
    const longest = top(acts, (a) => a.distance);
    if (longest.distance > 0) rows.push(["Plus longue distance", link(longest, fmtNum(longest.distance / 1000, 1) + " km")]);
    const longT = top(acts, (a) => a.moving_time);
    rows.push(["Plus longue durée", link(longT, fmtDuration(longT.moving_time))]);
    const dplus = top(acts, (a) => a.elevation || 0);
    if (dplus.elevation > 0) rows.push(["Plus gros D+", link(dplus, fmtNum(dplus.elevation, 0) + " m")]);
    // meilleure vitesse moyenne sur une sortie d'au moins X km (approximation : moyenne de toute la sortie)
    const thresholds = sp === "Swim" ? [1, 2, 3.8] : PACE_SPORTS.has(sp) ? [5, 10, 21.1, 42.2] : [20, 50, 100, 160];
    for (const t of thresholds) {
      const ok = acts.filter((a) => a.distance >= t * 1000 * 0.98 && a.avg_speed);
      if (ok.length) { const b = top(ok, (a) => a.avg_speed); rows.push([`Meilleure moyenne ≥ ${fmtNum(t, t % 1 ? 1 : 0)} km`, link(b, fmtSpeed(b))]); }
    }
    if (acts.some((a) => a.avg_hr)) { const h = top(acts.filter((a) => a.max_hr), (a) => a.max_hr); if (h) rows.push(["FC max relevée", link(h, Math.round(h.max_hr) + " bpm")]); }
    return `<div class="rec"><h3><i class="dot" style="background:${SPORT_COLOR[sp]}"></i>${esc(sportName(sp))} <span class="muted">${acts.length}</span></h3>
      <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table></div>`;
  }).join("") || '<p class="empty">Rien sur cette période.</p>';
}

function renderYears() {
  const ys = {};
  for (const a of ALL) {
    if (!bySport(a)) continue;
    const y = (ys[a.year] ||= { n: 0, d: 0, t: 0, e: 0, days: new Set() });
    y.n++; y.d += a.distance; y.t += a.moving_time; y.e += a.elevation || 0; y.days.add(a.day);
  }
  const rows = Object.keys(ys).sort((a, b) => b - a);
  $("#years").innerHTML = `<table><thead><tr><th>Année</th><th>Activités</th><th>Jours actifs</th><th>Distance</th><th>Temps</th><th>Dénivelé +</th><th>Km / activité</th></tr></thead><tbody>` +
    rows.map((y) => { const r = ys[y]; return `<tr><td>${y}</td><td>${fmtNum(r.n)}</td><td>${fmtNum(r.days.size)}</td><td>${fmtNum(r.d / 1000, 0)} km</td><td>${fmtHours(r.t / 3600)}</td><td>${fmtNum(r.e, 0)} m</td><td>${fmtNum(r.d / 1000 / r.n, 1)}</td></tr>`; }).join("") +
    `</tbody></table>`;
}

const COLS = [
  { k: "date", l: "Date", v: (a) => a.date, f: (a) => fmtDate(a.date), cls: "l" },
  { k: "name", l: "Nom", v: (a) => a.name.toLowerCase(), f: (a) => `<a href="${stravaLink(a)}" target="_blank" rel="noopener">${esc(a.name)}</a>`, cls: "l name" },
  { k: "sport", l: "Sport", v: (a) => sportName(a.sport), f: (a) => `<i class="dot" style="background:${SPORT_COLOR[a.sport]}"></i> ${esc(sportName(a.sport))}`, cls: "l" },
  { k: "distance", l: "Distance", v: (a) => a.distance, f: (a) => (a.distance ? fmtNum(a.distance / 1000, 2) + " km" : "–") },
  { k: "time", l: "Durée", v: (a) => a.moving_time, f: (a) => fmtDuration(a.moving_time) },
  { k: "speed", l: "Allure / vitesse", v: (a) => a.avg_speed || 0, f: fmtSpeed },
  { k: "elev", l: "D+", v: (a) => a.elevation || 0, f: (a) => fmtNum(a.elevation || 0, 0) + " m" },
  { k: "hr", l: "FC moy.", v: (a) => a.avg_hr || 0, f: (a) => (a.avg_hr ? Math.round(a.avg_hr) : "–") },
  { k: "kudos", l: "Kudos", v: (a) => a.kudos || 0, f: (a) => a.kudos ?? 0 },
  { k: "comments", l: "Comm.", v: (a) => a.comments || 0, f: (a) => a.comments ?? "–" },
];
const PAGE = 50;
function renderList(list) {
  const q = state.search.trim().toLowerCase();
  const rows = q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list.slice();
  const col = COLS.find((c) => c.k === state.sort);
  rows.sort((x, y) => { const a = col.v(x), b = col.v(y); return (a < b ? -1 : a > b ? 1 : 0) * (state.asc ? 1 : -1); });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * PAGE, (state.page + 1) * PAGE);
  $("#list").innerHTML = `<table><thead><tr>${COLS.map((c) => `<th data-k="${c.k}" class="${c.cls || ""} ${c.k === state.sort ? "sorted" + (state.asc ? " asc" : "") : ""}">${c.l}</th>`).join("")}</tr></thead><tbody>` +
    slice.map((a) => `<tr>${COLS.map((c) => `<td class="${c.cls || ""}">${c.f(a)}</td>`).join("")}</tr>`).join("") + `</tbody></table>` +
    (rows.length ? "" : '<p class="empty">Aucune activité.</p>');
  $("#pager").innerHTML = `${fmtNum(rows.length)} activités · page ${state.page + 1} / ${pages}
    <button class="ghost" data-p="-1" ${state.page ? "" : "disabled"}>‹</button><button class="ghost" data-p="1" ${state.page < pages - 1 ? "" : "disabled"}>›</button>`;
}

// classement des activités les plus aimées / commentées (dans les filtres en cours)
const TOP_N = 20;
function renderTop(list) {
  const key = state.top, other = key === "kudos" ? "comments" : "kudos";
  const word = { kudos: ["kudo", "kudos"], comments: ["commentaire", "commentaires"] };
  $("#topTitle").textContent = key === "kudos" ? "Les plus kudosées" : "Les plus commentées";
  const ranked = list.filter((a) => (a[key] || 0) > 0)
    .sort((x, y) => (y[key] || 0) - (x[key] || 0) || (y[other] || 0) - (x[other] || 0) || y.date - x.date)
    .slice(0, TOP_N);
  if (!ranked.length) {
    const noData = key === "comments" && list.length && list.every((a) => a.comments == null);
    $("#top").innerHTML = `<p class="empty">${noData ? "Nombre de commentaires inconnu : clique sur « Tout recharger » pour le récupérer." : "Aucune activité avec des " + word[key][1] + " sur cette période."}</p>`;
    return;
  }
  const max = ranked[0][key];
  // rang ex aequo : même valeur = même rang
  let rank = 0, prev = null;
  // remplissage colonne par colonne (1 à 10 à gauche, 11 à 20 à droite)
  const half = Math.ceil(ranked.length / 2);
  $("#top").innerHTML = `<ol style="grid-template-rows:repeat(${half},auto);grid-auto-flow:column">` + ranked.map((a, i) => {
    if (a[key] !== prev) { rank = i + 1; prev = a[key]; }
    const n = a[key], o = a[other] || 0;
    return `<li><span class="rk">${rank}</span>
      <span class="nm"><a href="${stravaLink(a)}" target="_blank" rel="noopener" title="${esc(a.name)}">${esc(a.name)}</a>
        <span class="sub"><i class="dot" style="background:${SPORT_COLOR[a.sport]}"></i>${esc(sportName(a.sport))} · ${fmtDate(a.date)}${a.distance ? " · " + fmtNum(a.distance / 1000, 1) + " km" : ""}${o ? ` · ${o} ${word[other][o > 1 ? 1 : 0]}` : ""}</span></span>
      <span class="sc" title="${n} ${word[key][n > 1 ? 1 : 0]}"><span class="bar" style="width:${(n / max) * 100}%"></span><span class="n">${n}</span></span></li>`;
  }).join("") + `</ol>`;
}

// ---------- carte ----------
let map = null, trackLayer = null, TRACKS = null, MISSING = 0, mapKey = null, mapBounds = null;
const decoded = new Map();
// décodage du format « encoded polyline » de Google / Strava
function decodePolyline(str) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}
const cssColor = (v) => getComputedStyle(document.body).getPropertyValue(v.slice(4, -1)).trim() || "#888";

function renderMap(list) {
  if (!window.L) { $("#map").innerHTML = '<p class="empty">Carte indisponible (pas de connexion internet ?).</p>'; return; }
  if (!TRACKS) return;
  if (!map) {
    map = L.map("map", { preferCanvas: true, renderer: L.canvas({ tolerance: 6 }), zoomSnap: 0.5 });
    // tuiles OpenStreetMap standard, passées en gris en CSS pour faire ressortir les tracés
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    trackLayer = L.layerGroup().addTo(map);
    map.setView([46.6, 2.4], 5);
  }
  trackLayer.clearLayers();
  const colors = {};
  for (const [sp, v] of Object.entries(SPORT_COLOR)) colors[sp] = cssColor(v);
  const heatColor = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#fc5200";
  const bounds = L.latLngBounds([]);
  let shown = 0, noGps = 0;
  // les plus anciennes d'abord : les récentes passent par-dessus
  for (const a of list) {
    const p = TRACKS[a.id];
    if (!p) { noGps++; continue; }
    if (!decoded.has(a.id)) decoded.set(a.id, decodePolyline(p));
    const pts = decoded.get(a.id);
    if (pts.length < 2) { noGps++; continue; }
    // mode chaleur : une seule couleur très transparente, les passages répétés s'additionnent
    const base = mapMode === "heat" ? { color: heatColor, weight: 3, opacity: 0.12 } : { color: colors[a.sport], weight: 2, opacity: 0.55 };
    const line = L.polyline(pts, base);
    line.on("mouseover", () => line.setStyle({ weight: 4, opacity: 1 }).bringToFront());
    line.on("mouseout", () => line.setStyle(base));
    line.on("click", (e) => L.popup().setLatLng(e.latlng).setContent(
      `<b>${esc(a.name)}</b>${esc(sportName(a.sport))} · ${fmtDate(a.date)}<br>` +
      `${a.distance ? fmtNum(a.distance / 1000, 1) + " km · " : ""}${fmtDuration(a.moving_time)}${a.elevation ? " · " + fmtNum(a.elevation, 0) + " m D+" : ""}<br>` +
      `<a href="${stravaLink(a)}" target="_blank" rel="noopener">Voir sur Strava</a>`).openOn(map));
    trackLayer.addLayer(line);
    bounds.extend(line.getBounds());
    shown++;
  }
  $("#mapInfo").textContent = `${fmtNum(shown)} tracés` + (noGps ? ` · ${fmtNum(noGps)} sans GPS` : "") +
    (MISSING ? ` · ${fmtNum(MISSING)} à récupérer avec « Tout recharger »` : "");
  mapBounds = bounds.isValid() ? bounds : null;
  // on ne recadre que si la période ou les sports changent (pas pour un changement de mesure)
  const key = state.period + "|" + [...state.sports].sort().join(",");
  if (key !== mapKey) { mapKey = key; fitMap(); }
}
function fitMap() {
  if (!map || !mapBounds) return;
  // cadrage sur la zone la plus fréquentée : on ignore les 5 % de départs les plus éloignés
  const starts = [];
  trackLayer.eachLayer((l) => starts.push(l.getLatLngs()[0]));
  if (starts.length > 20) {
    const c = L.latLng(median(starts.map((p) => p.lat)), median(starts.map((p) => p.lng)));
    const near = starts.map((p) => [p, c.distanceTo(p)]).sort((x, y) => x[1] - y[1]).slice(0, Math.ceil(starts.length * 0.95));
    const b = L.latLngBounds([]);
    const keep = new Set(near.map((x) => x[0]));
    trackLayer.eachLayer((l) => { if (keep.has(l.getLatLngs()[0])) b.extend(l.getBounds()); });
    return map.fitBounds(b, { padding: [20, 20] });
  }
  map.fitBounds(mapBounds, { padding: [20, 20] });
}
function median(arr) { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
$("#mapFit").addEventListener("click", fitMap);

// ---------- FC selon l'allure ----------
const FC_GROUPS = {
  run: { label: "course", sports: ["Run", "VirtualRun"], pace: true, range: [150, 600] },
  trail: { label: "trail", sports: ["TrailRun"], pace: true, effort: true, range: [150, 900] },
  ride: { label: "vélo", sports: ["Ride", "GravelRide", "MountainBikeRide", "VirtualRide"], pace: false, range: [8, 55] },
};
const fcState = { recent: 5, group: "run", since: localStorage.getItem("fcSince") || "2025-12-22", until: "", flat: true, detail: "km", skipFirst: true, flatOnly: true };
let SPLITS = null, KMJOB = null, kmPoll = null;

async function loadSplits() {
  const r = await api("/api/splits");
  SPLITS = r.splits; KMJOB = r.kmJob;
  renderFc();
  clearTimeout(kmPoll);
  if (KMJOB.running) kmPoll = setTimeout(loadSplits, 10000);
}
// sorties de la période qui ont une FC mais pas encore leur détail au km
function kmMissing() {
  const since = fcState.since;
  const all = Object.values(FC_GROUPS).flatMap((g) => g.sports);
  const until = fcState.until || "9999";
  return ALL.filter((a) => all.includes(a.sport) && a.avg_hr && a.start >= since && a.start.slice(0, 10) <= until && !(SPLITS && a.id in SPLITS)).length;
}
function renderKmStatus() {
  const box = $("#fcKmStatus");
  if (fcState.detail !== "km" || !SPLITS) { box.hidden = true; return; }
  const missing = kmMissing();
  const j = KMJOB || {};
  if (j.running) {
    const wait = j.waitingUntil ? ` · pause imposée par Strava jusqu'à ${new Date(j.waitingUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "";
    box.innerHTML = `<span>Téléchargement du détail au km : ${j.done} / ${j.total} sorties${wait}</span><progress max="${j.total}" value="${j.done}"></progress><span class="muted">Les graphiques se complètent au fur et à mesure.</span>`;
  } else if (missing) {
    const min = Math.ceil(missing / 95) * 15;
    box.innerHTML = `<span>${missing} sorties ${fcRangeTxt()} n'ont pas encore leur détail au km (1 requête Strava par sortie, environ ${min} min à cause des limites de Strava).</span><button id="kmGo">Télécharger</button>` +
      (j.error ? `<span>⚠ ${esc(j.error)}</span>` : "");
    $("#kmGo").addEventListener("click", async () => {
      await api(`/api/splits/sync?since=${encodeURIComponent(fcState.since)}`, { method: "POST" });
      setTimeout(loadSplits, 1500);
    });
  } else { box.hidden = true; return; }
  box.hidden = false;
}
const fmtPace = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// fin de la période FC : la date choisie (fin de journée) ou maintenant
const fcEnd = () => (fcState.until ? new Date(fcState.until + "T23:59:59") : new Date());
const fcRangeTxt = () => `du ${fmtDate(new Date(fcState.since + "T00:00"))} au ${fmtDate(fcEnd())}`;
function fcData() {
  const g = FC_GROUPS[fcState.group];
  const since = new Date(fcState.since + "T00:00");
  const until = fcEnd();
  const pts = [];
  let skipped = 0;
  if (fcState.detail === "km") {
    for (const a of ALL) {
      if (!g.sports.includes(a.sport) || a.date < since || a.date > until || !a.avg_hr) continue;
      const sp = SPLITS?.[a.id]?.splits;
      if (!sp) continue;
      for (const s of sp) {
        if (s.d < 800 || s.t < 60) continue; // bout de km final trop court
        if (fcState.skipFirst && s.k === 1) continue;
        const grade = (s.up - s.dn) / s.d;
        let x;
        if (!g.pace) {
          if (fcState.flatOnly && Math.abs(grade) > 0.02) continue;
          x = (s.d / s.t) * 3.6;
        } else x = fcState.flat ? (s.t / s.gd) * 1000 : (s.t / s.d) * 1000; // allure (à plat équivalente : pente corrigée)
        if (x < g.range[0] || x > g.range[1]) { skipped++; continue; }
        pts.push({ a, x, y: s.hr, km: s.k, grade });
      }
    }
    return { g, pts, skipped };
  }
  for (const a of ALL) {
    if (!g.sports.includes(a.sport) || a.date < since || a.date > until || !a.avg_hr || !a.distance || a.moving_time < 600) continue;
    let x;
    if (!g.pace) x = a.avg_speed * 3.6; // km/h
    else if (g.effort && fcState.flat) x = a.moving_time / ((a.distance + (a.elevation || 0) * 10) / 1000); // s par km-effort
    else x = 1000 / a.avg_speed; // s/km
    if (x < g.range[0] || x > g.range[1]) { skipped++; continue; }
    pts.push({ a, x, y: a.avg_hr });
  }
  return { g, pts, skipped };
}
function linReg(pts) {
  const n = pts.length;
  const mx = pts.reduce((t, p) => t + p.x, 0) / n, my = pts.reduce((t, p) => t + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return { b, a: my - b * mx, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, mx, my };
}
const monthLabel = (k) => `${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}`;

function renderFc() {
  const KM = fcState.detail === "km";
  if (KM && !SPLITS) { loadSplits(); return; }
  renderKmStatus();
  renderDrift();
  renderZones();
  const { g, pts, skipped } = fcData();
  const flatOn = g.pace && (g.effort || KM);
  $("#fcFlatWrap").hidden = !flatOn;
  $("#fcFirstWrap").hidden = !KM;
  $("#fcFlatOnlyWrap").hidden = !(KM && !g.pace);
  const unit = KM ? ["km", "km"] : ["sortie", "sorties"];
  const sinceTxt = fcRangeTxt();
  const xLabel = g.pace ? (flatOn && fcState.flat ? "allure à plat équivalente (min/km)" : "allure (min/km)") : "vitesse (km/h)";
  const fmtX = g.pace ? (v) => fmtPace(v) + " /km" : (v) => fmtNum(v, 1) + " km/h";
  if (pts.length < 3) {
    $("#fcSummary").innerHTML = "";
    $("#fcScatter").innerHTML = `<p class="empty">Pas assez de ${unit[1]} de ${g.label} avec la FC ${sinceTxt}${KM ? " (détail au km pas encore téléchargé ?)" : ""}.</p>`;
    $("#fcTrend").innerHTML = $("#fcBins").innerHTML = $("#fcEvo").innerHTML = "";
    return;
  }
  const reg = linReg(pts);
  const xs = pts.map((p) => p.x).sort((a, b) => a - b);
  // allure de référence : la médiane, arrondie
  const xref = g.pace ? Math.round(median(xs) / 15) * 15 : Math.round(median(xs));
  // effet d'un pas : 10 s/km plus vite, ou 1 km/h de plus
  const step = g.pace ? -reg.b * 10 : reg.b;

  // tendance mensuelle : FC de chaque sortie ramenée à l'allure de référence
  const months = new Map();
  for (const p of pts) {
    const k = `${p.a.year}-${String(p.a.date.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(p.y - reg.b * (p.x - xref));
  }
  const trend = [...months.entries()].sort().map(([k, v]) => ({ k, n: v.length, v: v.reduce((a, b) => a + b, 0) / v.length }))
    .filter((t) => t.n >= (KM ? 10 : 2));
  // début contre fin : moyenne (pondérée par le nombre de sorties) des 3 premiers et des 3 derniers mois
  const k = Math.min(3, Math.floor(trend.length / 2));
  const wavg = (arr) => arr.reduce((t, m) => t + m.v * m.n, 0) / arr.reduce((t, m) => t + m.n, 0);
  const head = trend.slice(0, k), tail = trend.slice(-k);
  const delta = k ? wavg(tail) - wavg(head) : null;
  const span = (arr) => arr.length < 2 ? monthLabel(arr[0].k)
    : `${arr[0].k.slice(0, 4) === arr.at(-1).k.slice(0, 4) ? MONTHS[+arr[0].k.slice(5) - 1] : monthLabel(arr[0].k)}-${monthLabel(arr.at(-1).k)}`;
  const r = reg.r * (g.pace ? -1 : 1);

  $("#fcSummary").innerHTML = [
    [KM ? "Km analysés" : "Sorties analysées", fmtNum(pts.length), KM ? `sur ${new Set(pts.map((p) => p.a.id)).size} sorties ${sinceTxt}` : skipped ? `${skipped} écartée(s), allure hors norme` : `${sinceTxt}`],
    ["FC moyenne", fmtNum(reg.my, 0) + " bpm", `pour ${fmtX(reg.mx)} en moyenne`],
    ["Coût d'une accélération", (step >= 0 ? "+" : "") + fmtNum(step, 1) + " bpm", g.pace ? "par 10 s/km plus vite" : "par km/h en plus"],
    ["Lien FC / allure", fmtNum(r, 2), Math.abs(r) > 0.7 ? "fort" : Math.abs(r) > 0.4 ? "moyen : terrain, chaleur, fatigue jouent" : "faible : l'allure explique peu la FC"],
    ["Évolution à " + fmtX(xref), delta == null ? "–" : (delta >= 0 ? "+" : "") + fmtNum(delta, 1) + " bpm",
      delta == null ? "pas assez de mois" : `${span(head)} → ${span(tail)}` + (delta < -1 ? " · en progrès" : delta > 1 ? " · FC en hausse" : " · stable")],
  ].map(([l, v, sub]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join("");

  // ---- évolution dans le temps : chaque sortie + moyenne du mois ----
  {
    $("#fcEvoTitle").textContent = `Évolution de ma FC en ${g.label} ${sinceTxt}`;
    const ec = $("#fcEvo");
    ec.innerHTML = "";
    const W = CW(), H = 300, pad = { t: 22, r: 16, b: 30, l: 44 };
    const s = svg(W, H);
    const tStart = new Date(fcState.since + "T00:00").getTime(), tEnd = Math.min(Date.now(), fcEnd().getTime());
    const ys = pts.map((p) => p.y);
    const y0 = Math.floor((Math.min(...ys) - 5) / 10) * 10, y1 = Math.ceil((Math.max(...ys) + 5) / 10) * 10;
    const sx = (t) => pad.l + ((t - tStart) / (tEnd - tStart)) * (W - pad.l - pad.r);
    const sy = (v) => H - pad.b - ((v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    for (let v = y0; v <= y1; v += 10) {
      el(s, "line", { x1: pad.l, x2: W - pad.r, y1: sy(v), y2: sy(v), class: v === y0 ? "base-line" : "grid-line" });
      el(s, "text", { x: pad.l - 6, y: sy(v) + 4, "text-anchor": "end" }, v);
    }
    el(s, "text", { x: pad.l, y: 10 }, "FC moyenne (bpm)");
    for (let d = new Date(new Date(tStart).getFullYear(), new Date(tStart).getMonth() + 1, 1); d.getTime() < tEnd; d.setMonth(d.getMonth() + 1)) {
      el(s, "line", { x1: sx(d), x2: sx(d), y1: H - pad.b, y2: H - pad.b + 4, class: "base-line" });
      el(s, "text", { x: sx(d) + 3, y: H - pad.b + 16 }, d.getMonth() === 0 ? `${MONTHS[0]} ${String(d.getFullYear()).slice(2)}` : MONTHS[d.getMonth()]);
    }
    // sorties : points discrets
    for (const p of pts) {
      const dot = el(s, "circle", { cx: sx(p.a.date), cy: sy(p.y), r: KM ? 2 : 3.5, fill: "var(--seq-2)", "fill-opacity": KM ? 0.6 : 1, style: "cursor:pointer" });
      dot.addEventListener("mousemove", (e) => showTip(e, `<b>${esc(p.a.name)}${p.km ? " · km " + p.km : ""}</b>${fmtDate(p.a.date)} · ${fmtNum(p.a.distance / 1000, 1)} km<div class="row"><span>FC moyenne</span><span>${Math.round(p.y)} bpm</span></div><div class="row"><span>${g.pace ? "Allure" : "Vitesse"}</span><span>${fmtX(p.x)}</span></div>`));
      dot.addEventListener("mouseleave", hideTip);
      dot.addEventListener("click", () => window.open(stravaLink(p.a), "_blank", "noopener"));
    }
    // moyennes du mois, placées au milieu du mois : brute et ramenée à l'allure de référence
    const mid = (k) => new Date(+k.slice(0, 4), +k.slice(5) - 1, 15).getTime();
    const raw = new Map();
    for (const p of pts) {
      const k = `${p.a.year}-${String(p.a.date.getMonth() + 1).padStart(2, "0")}`;
      if (!raw.has(k)) raw.set(k, []);
      raw.get(k).push(p.y);
    }
    const rawLine = [...raw.entries()].sort().filter(([, v]) => v.length >= 2).map(([k, v]) => ({ k, n: v.length, v: v.reduce((a, b) => a + b, 0) / v.length }));
    const lines = [
      { data: rawLine, color: "var(--series-1)", name: "FC moyenne du mois" },
      { data: trend, color: "var(--series-2)", name: `FC du mois ramenée à ${fmtX(xref)}` },
    ];
    for (const ln of lines) {
      if (ln.data.length < 2) continue;
      el(s, "polyline", { points: ln.data.map((t) => `${sx(Math.min(mid(t.k), tEnd))},${sy(t.v)}`).join(" "), fill: "none", stroke: ln.color, "stroke-width": 2.5, "stroke-linejoin": "round" });
      for (const t of ln.data) {
        const cx = sx(Math.min(mid(t.k), tEnd)), cy = sy(t.v);
        el(s, "circle", { cx, cy, r: 4.5, fill: ln.color, stroke: "var(--surface-1)", "stroke-width": 2 });
        const hit = el(s, "circle", { cx, cy, r: 12, class: "hit" });
        hit.addEventListener("mousemove", (e) => showTip(e, `<b>${monthLabel(t.k)}</b>${ln.name} : ${fmtNum(t.v, 0)} bpm<br>${t.n} ${unit[1]}`));
        hit.addEventListener("mouseleave", hideTip);
      }
    }
    ec.appendChild(s);
    const leg = document.createElement("div");
    leg.className = "legend";
    leg.innerHTML = `<span><i style="width:8px;height:8px;border-radius:50%;background:var(--seq-2)"></i>une sortie</span>` +
      lines.map((ln) => `<span><i style="background:${ln.color}"></i>${ln.name}</span>`).join("") +
      `<span class="muted">La courbe orange enlève l'effet de l'allure : si elle descend, tu as besoin de moins de battements pour aller aussi vite.</span>`;
    ec.appendChild(leg);
  }

  // ---- nuage de points ----
  const c = $("#fcScatter");
  c.innerHTML = "";
  const W = CW(), H = 380, pad = { t: 22, r: 16, b: 40, l: 44 };
  const s = svg(W, H);
  const xmin = xs[0], xmax = xs.at(-1), xp = (xmax - xmin) * 0.05 || 1;
  // en allure, le plus rapide à droite (axe inversé)
  const x0 = g.pace ? xmax + xp : xmin - xp, x1 = g.pace ? xmin - xp : xmax + xp;
  const ys = pts.map((p) => p.y);
  const y0 = Math.floor((Math.min(...ys) - 5) / 10) * 10, y1 = Math.ceil((Math.max(...ys) + 5) / 10) * 10;
  const sx = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (v) => H - pad.b - ((v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  for (let v = y0; v <= y1; v += 10) {
    el(s, "line", { x1: pad.l, x2: W - pad.r, y1: sy(v), y2: sy(v), class: v === y0 ? "base-line" : "grid-line" });
    el(s, "text", { x: pad.l - 6, y: sy(v) + 4, "text-anchor": "end" }, v);
  }
  const tickStep = g.pace ? (xmax - xmin > 240 ? 60 : 30) : (xmax - xmin > 20 ? 5 : 2);
  for (let v = Math.ceil(Math.min(x0, x1) / tickStep) * tickStep; v <= Math.max(x0, x1); v += tickStep) {
    el(s, "line", { x1: sx(v), x2: sx(v), y1: H - pad.b, y2: H - pad.b + 4, class: "base-line" });
    el(s, "text", { x: sx(v), y: H - pad.b + 16, "text-anchor": "middle" }, g.pace ? fmtPace(v) : v);
  }
  el(s, "text", { x: W - pad.r, y: H - 4, "text-anchor": "end" }, xLabel + (g.pace ? " · plus rapide →" : " →"));
  el(s, "text", { x: pad.l, y: 10 }, "FC moyenne (bpm)");
  // couleur selon la date : 4 tranches, de la plus ancienne (clair) à la plus récente (foncé)
  const t0 = Math.min(...pts.map((p) => p.a.date)), t1 = Math.max(...pts.map((p) => p.a.date));
  const bin = (d) => Math.min(3, Math.floor(((d - t0) / (t1 - t0 || 1)) * 4));
  const binColor = ["var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)"];
  el(s, "line", { x1: sx(xmin), y1: sy(reg.a + reg.b * xmin), x2: sx(xmax), y2: sy(reg.a + reg.b * xmax), stroke: "var(--series-2)", "stroke-width": 2, "stroke-dasharray": "6 4" });
  // les N dernières sorties : dessinées par-dessus, en sombre, avec un numéro (1 = la plus récente)
  const recentActs = [...new Map(pts.map((p) => [p.a.id, p.a])).values()].sort((a, b) => b.date - a.date).slice(0, fcState.recent);
  const recentIds = new Set(recentActs.map((a) => a.id));
  const order = pts.slice().sort((a, b) => (recentIds.has(a.a.id) - recentIds.has(b.a.id)) || a.a.date - b.a.date);
  for (const p of order) {
    const gap = p.y - (reg.a + reg.b * p.x);
    const isRecent = recentIds.has(p.a.id);
    const dot = el(s, "circle", { cx: sx(p.x), cy: sy(p.y), r: isRecent ? (KM ? 4 : 6) : KM ? 3 : 5, fill: isRecent ? "var(--text-primary)" : binColor[bin(p.a.date)],
      "fill-opacity": isRecent || !recentIds.size ? 1 : 0.55, stroke: "var(--surface-1)", "stroke-width": KM ? 0.5 : 1.5, style: "cursor:pointer" });
    dot.addEventListener("mousemove", (e) => showTip(e, `<b>${esc(p.a.name)}${p.km ? " · km " + p.km : ""}</b>${fmtDate(p.a.date)} · ${fmtNum(p.a.distance / 1000, 1)} km${p.a.elevation ? " · " + fmtNum(p.a.elevation, 0) + " m D+" : ""}
      <div class="row"><span>${g.pace ? "Allure" : "Vitesse"}</span><span>${fmtX(p.x)}</span></div>
      <div class="row"><span>FC moyenne</span><span>${Math.round(p.y)} bpm</span></div>
      <div class="row"><span>Écart à la tendance</span><span>${(gap >= 0 ? "+" : "") + fmtNum(gap, 0)} bpm</span></div>`));
    dot.addEventListener("mouseleave", hideTip);
    dot.addEventListener("click", () => window.open(stravaLink(p.a), "_blank", "noopener"));
  }
  const gapTxt = (v) => (Math.round(v) === 0 ? "±0" : (v > 0 ? "+" : "") + fmtNum(v, 0));
  // numéro de chaque sortie récente, posé sur son point (ou au centre de ses km)
  const recentInfo = recentActs.map((a, i) => {
    const mine = pts.filter((p) => p.a.id === a.id);
    const x = mine.reduce((t, p) => t + p.x, 0) / mine.length, y = mine.reduce((t, p) => t + p.y, 0) / mine.length;
    return { a, n: i + 1, x, y, gap: y - (reg.a + reg.b * x) };
  });
  for (const r of recentInfo.slice().reverse()) {
    const g0 = el(s, "g", { style: "cursor:pointer" });
    el(g0, "circle", { cx: sx(r.x), cy: sy(r.y) - (KM ? 0 : 13), r: 9, fill: "var(--text-primary)", stroke: "var(--surface-1)", "stroke-width": 2 });
    el(g0, "text", { x: sx(r.x), y: sy(r.y) - (KM ? 0 : 13) + 4, "text-anchor": "middle", style: "fill:var(--surface-1);font-weight:700;font-size:11px" }, r.n);
    g0.addEventListener("mousemove", (e) => showTip(e, `<b>${r.n === 1 ? "Dernière sortie" : r.n + "e plus récente"}</b>${esc(r.a.name)} · ${fmtDate(r.a.date)}
      <div class="row"><span>${g.pace ? "Allure" : "Vitesse"}${KM ? " moyenne des km" : ""}</span><span>${fmtX(r.x)}</span></div>
      <div class="row"><span>FC moyenne</span><span>${Math.round(r.y)} bpm</span></div>
      <div class="row"><span>Écart à la tendance</span><span>${gapTxt(r.gap)} bpm</span></div>`));
    g0.addEventListener("mouseleave", hideTip);
    g0.addEventListener("click", () => window.open(stravaLink(r.a), "_blank", "noopener"));
  }
  c.appendChild(s);
  const fmtMonth = (d) => `${MONTHS[new Date(d).getMonth()]} ${new Date(d).getFullYear()}`;
  const leg = document.createElement("div");
  leg.className = "legend";
  leg.innerHTML = `<span>${fmtMonth(t0)}</span>` + binColor.map((col) => `<span><i style="width:10px;height:10px;border-radius:50%;background:${col}"></i></span>`).join("") +
    `<span>${fmtMonth(t1)}</span><span><i style="background:var(--series-2)"></i>tendance</span>` +
    (recentInfo.length ? `<span><i style="width:10px;height:10px;border-radius:50%;background:var(--text-primary)"></i>${recentInfo.length} dernières sorties</span>` : "") +
    `<span class="muted">Sous la ligne : FC plus basse que d'habitude pour cette allure. Clic sur un point : la sortie sur Strava.</span>`;
  c.appendChild(leg);
  if (recentInfo.length) {
    const lst = document.createElement("div");
    lst.className = "recent-list";
    lst.innerHTML = recentInfo.map((r) => `<div><span class="n">${r.n}</span><a href="${stravaLink(r.a)}" target="_blank" rel="noopener" title="${esc(r.a.name)}">${fmtDate(r.a.date)} · ${esc(r.a.name)}</a>
      <span class="gap">${fmtX(r.x)} · ${Math.round(r.y)} bpm · ${gapTxt(r.gap)}</span></div>`).join("");
    c.appendChild(lst);
  }

  // ---- évolution mois par mois ----
  $("#fcTrendTitle").textContent = `FC estimée à ${fmtX(xref)}, mois par mois`;
  const tc = $("#fcTrend");
  tc.innerHTML = "";
  if (trend.length < 2) {
    tc.innerHTML = '<p class="empty">Il faut au moins deux mois avec deux sorties chacun.</p>';
  } else {
    const TW = CW(480), TH = 220, tp = { t: 12, r: 12, b: 26, l: 36 };
    const ts = svg(TW, TH);
    const tv = trend.map((t) => t.v);
    const ty0 = Math.floor((Math.min(...tv) - 3) / 5) * 5, ty1 = Math.ceil((Math.max(...tv) + 3) / 5) * 5;
    const tx = (i) => tp.l + (i / (trend.length - 1)) * (TW - tp.l - tp.r);
    const ty = (v) => TH - tp.b - ((v - ty0) / (ty1 - ty0)) * (TH - tp.t - tp.b);
    for (let v = ty0; v <= ty1; v += 5) {
      el(ts, "line", { x1: tp.l, x2: TW - tp.r, y1: ty(v), y2: ty(v), class: v === ty0 ? "base-line" : "grid-line" });
      el(ts, "text", { x: tp.l - 6, y: ty(v) + 4, "text-anchor": "end" }, v);
    }
    const every = Math.ceil(trend.length / 6);
    el(ts, "polyline", { points: trend.map((t, i) => `${tx(i)},${ty(t.v)}`).join(" "), fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round" });
    trend.forEach((t, i) => {
      if (i % every === 0 || i === trend.length - 1) el(ts, "text", { x: tx(i), y: TH - 8, "text-anchor": i === 0 ? "start" : i === trend.length - 1 ? "end" : "middle" }, `${MONTHS[+t.k.slice(5) - 1]} ${t.k.slice(2, 4)}`);
      el(ts, "circle", { cx: tx(i), cy: ty(t.v), r: 4.5, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2 });
      const hit = el(ts, "circle", { cx: tx(i), cy: ty(t.v), r: 14, class: "hit" });
      hit.addEventListener("mousemove", (e) => showTip(e, `<b>${monthLabel(t.k)}</b>FC estimée à ${fmtX(xref)} : ${fmtNum(t.v, 0)} bpm<br>${t.n} ${unit[1]}`));
      hit.addEventListener("mouseleave", hideTip);
    });
    tc.appendChild(ts);
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "Chaque sortie est ramenée à la même allure grâce à la tendance du nuage, puis on fait la moyenne du mois. Une courbe qui descend : même allure pour moins de battements.";
    tc.appendChild(note);
  }

  // ---- tranches ----
  const w = g.pace ? 30 : 2;
  const bins = new Map();
  for (const p of pts) {
    const k = Math.floor(p.x / w) * w;
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(p.y);
  }
  const keys = [...bins.keys()].sort((a, b) => (g.pace ? a - b : b - a));
  $("#fcBins").innerHTML = `<table><thead><tr><th>${g.pace ? "Allure" : "Vitesse"}</th><th>${KM ? "Km" : "Sorties"}</th><th>FC moy.</th><th>FC min – max</th></tr></thead><tbody>` +
    keys.map((k) => {
      const v = bins.get(k);
      const label = g.pace ? `${fmtPace(k)} – ${fmtPace(k + w)} /km` : `${k} – ${k + w} km/h`;
      return `<tr><td>${label}</td><td>${v.length}</td><td>${fmtNum(v.reduce((a, b) => a + b, 0) / v.length, 0)} bpm</td><td>${Math.round(Math.min(...v))} – ${Math.round(Math.max(...v))}</td></tr>`;
    }).join("") + `</tbody></table>`;
}
$("#fcSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  fcState.group = b.dataset.g;
  e.currentTarget.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderFc();
});
$("#fcSince").value = fcState.since;
$("#fcUntil").value = fcState.until || dayKey(new Date());
$("#fcUntil").addEventListener("change", (e) => {
  // aujourd'hui ou vide = jusqu'à maintenant (la période suit les nouvelles sorties)
  fcState.until = e.target.value && e.target.value < dayKey(new Date()) ? e.target.value : "";
  renderFc();
});
$("#fcSince").addEventListener("change", (e) => {
  if (!e.target.value) return;
  fcState.since = e.target.value;
  localStorage.setItem("fcSince", fcState.since);
  renderFc();
});
$("#fcFlat").addEventListener("change", (e) => { fcState.flat = e.target.checked; renderFc(); });
$("#fcRecent").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  fcState.recent = +b.dataset.n;
  e.currentTarget.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderFc();
});
$("#fcFirst").addEventListener("change", (e) => { fcState.skipFirst = e.target.checked; renderFc(); });
$("#fcFlatOnly").addEventListener("change", (e) => { fcState.flatOnly = e.target.checked; renderFc(); });
$("#fcDetail").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  fcState.detail = b.dataset.d === "km" ? "km" : "sortie";
  e.currentTarget.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderFc();
});

// ---------- qui commente le plus ----------
let COMMENTS = null, COMJOB = null, ME = null, comPoll = null;
async function loadComments() {
  const r = await api("/api/comments");
  COMMENTS = r.comments; COMJOB = r.comJob; ME = r.me;
  renderCommenters(filtered());
  renderCommunity();
  renderBilan();
  clearTimeout(comPoll);
  if (COMJOB.running) comPoll = setTimeout(loadComments, 5000);
}
// mes propres réponses : même id, ou même prénom et même initiale (Strava abrège le nom)
function isMe(c) {
  if (!ME) return false;
  if (c.aid && ME.id) return c.aid === ME.id;
  const [first, ...rest] = c.who.split(" ");
  return first === ME.firstname && (rest.join(" ")[0] || "") === (ME.lastname || "")[0];
}
function renderCommenters(list) {
  if (!COMMENTS) { loadComments(); return; }
  // statut du téléchargement
  const missing = ALL.filter((a) => a.comments > 0 && COMMENTS[a.id]?.n !== a.comments).length;
  const box = $("#comStatus"), j = COMJOB || {};
  if (j.running) {
    const wait = j.waitingUntil ? ` · pause imposée par Strava jusqu'à ${new Date(j.waitingUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "";
    box.innerHTML = `<span>Téléchargement des commentaires : ${j.done} / ${j.total} sorties${wait}</span><progress max="${j.total}" value="${j.done}"></progress>`;
    box.hidden = false;
  } else if (missing) {
    box.innerHTML = `<span>${missing} sorties commentées dont je ne connais pas encore les auteurs (1 requête Strava par sortie).</span><button id="comGo">Télécharger les commentaires</button>` + (j.error ? `<span>⚠ ${esc(j.error)}</span>` : "");
    box.hidden = false;
    $("#comGo").addEventListener("click", async () => { await api("/api/comments/sync", { method: "POST" }); setTimeout(loadComments, 1500); });
  } else box.hidden = true;

  const people = new Map();
  for (const a of list) {
    const saved = COMMENTS[a.id];
    if (!saved) continue;
    for (const c of saved.list) {
      if (isMe(c)) continue;
      const p = people.get(c.who) || { who: c.who, n: 0, acts: new Set(), last: null };
      p.n++; p.acts.add(a.id);
      if (!p.last || c.at > p.last.at) p.last = { ...c, a };
      people.set(c.who, p);
    }
  }
  const ranked = [...people.values()].sort((x, y) => y.n - x.n || y.acts.size - x.acts.size || (y.last.at > x.last.at ? 1 : -1)).slice(0, 25);
  if (!ranked.length) { $("#commenters").innerHTML = '<p class="empty">Aucun commentaire connu sur cette période.</p>'; return; }
  const max = ranked[0].n;
  let rank = 0, prev = null;
  $("#commenters").innerHTML = `<table><thead><tr><th></th><th class="l">Qui</th><th>Commentaires</th><th class="l"></th><th>Sorties commentées</th><th class="l">Dernier commentaire</th></tr></thead><tbody>` +
    ranked.map((p, i) => {
      if (p.n !== prev) { rank = i + 1; prev = p.n; }
      return `<tr><td class="rk">${rank}</td><td class="l"><b>${esc(p.who)}</b></td><td>${p.n}</td>
        <td class="l barcell"><span style="width:${(p.n / max) * 100}%"></span></td><td>${p.acts.size}</td>
        <td class="l txt" title="${esc(p.last.text)}">${fmtDate(new Date(p.last.at))} · <a href="${stravaLink(p.last.a)}" target="_blank" rel="noopener">${esc(p.last.text)}</a></td></tr>`;
    }).join("") + `</tbody></table>` +
    `<p class="muted">${fmtNum(people.size)} personnes ont commenté sur la période (dans les filtres en cours).</p>`;
}

// ---------- lieux de départ et d'arrivée fréquents ----------
const PLACE_RADIUS = 250; // m : deux points plus proches = même lieu
const PLACES_SHOWN = 15;
let placeLayer = null, placesOn = true, PLACES = [];

function distM(a, b) {
  const k = Math.PI / 180, x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k), y = (b[0] - a[0]) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}
// regroupement glouton : chaque point rejoint le lieu le plus proche à moins de PLACE_RADIUS
function clusterPlaces(list) {
  const places = [];
  const add = (pt, a, kind) => {
    let best = null, bd = PLACE_RADIUS;
    for (const p of places) { const d = distM(p.c, pt); if (d < bd) { bd = d; best = p; } }
    if (!best) { best = { c: [...pt], sum: [0, 0], n: 0, starts: 0, ends: 0, acts: new Set(), sports: {}, last: null }; places.push(best); }
    best.sum[0] += pt[0]; best.sum[1] += pt[1]; best.n++;
    best.c = [best.sum[0] / best.n, best.sum[1] / best.n];
    best[kind]++;
    if (!best.acts.has(a.id)) { best.acts.add(a.id); best.sports[a.sport] = (best.sports[a.sport] || 0) + 1; }
    if (!best.last || a.date > best.last.date) best.last = a;
  };
  let loops = 0;
  for (const a of list) {
    const p = TRACKS?.[a.id];
    if (!p) continue;
    if (!decoded.has(a.id)) decoded.set(a.id, decodePolyline(p));
    const pts = decoded.get(a.id);
    if (pts.length < 2) continue;
    add(pts[0], a, "starts");
    add(pts.at(-1), a, "ends");
    if (distM(pts[0], pts.at(-1)) < PLACE_RADIUS) loops++;
  }
  places.sort((x, y) => y.acts.size - x.acts.size || y.n - x.n);
  return { places, loops };
}

// adresse par géocodage inverse OpenStreetMap (Nominatim) : 1 requête / s max, résultats gardés dans le navigateur
const GEO_KEY = "geocache-v1";
let geoCache = {};
try { geoCache = JSON.parse(localStorage.getItem(GEO_KEY) || "{}"); } catch {}
const geoQueue = [];
let geoBusy = false;
const geoId = (c) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
function formatAddress(r) {
  const ad = r.address || {};
  const road = ad.road || ad.pedestrian || ad.footway || ad.path || ad.cycleway || ad.square || ad.track || "";
  const street = [ad.house_number, road].filter(Boolean).join(" ");
  const city = ad.city || ad.town || ad.village || ad.municipality || ad.hamlet || "";
  const place = r.name && r.name !== road ? r.name : "";
  return [place, street, [ad.postcode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || r.display_name || "Adresse inconnue";
}
function geocode(c) {
  const id = geoId(c);
  if (geoCache[id]) return Promise.resolve(geoCache[id]);
  return new Promise((resolve) => { geoQueue.push({ c, id, resolve }); pumpGeo(); });
}
async function pumpGeo() {
  if (geoBusy || !geoQueue.length) return;
  geoBusy = true;
  const { c, id, resolve } = geoQueue.shift();
  let txt = null;
  if (geoCache[id]) txt = geoCache[id];
  else {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c[0].toFixed(5)}&lon=${c[1].toFixed(5)}&zoom=18&addressdetails=1&accept-language=fr`);
      if (r.ok) {
        txt = formatAddress(await r.json());
        geoCache[id] = txt;
        try { localStorage.setItem(GEO_KEY, JSON.stringify(geoCache)); } catch {}
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1100));
  }
  resolve(txt);
  geoBusy = false;
  pumpGeo();
}

function renderPlaces(list) {
  const box = $("#places");
  if (!TRACKS) { box.innerHTML = '<p class="empty">Tracés pas encore chargés.</p>'; return; }
  // site public discret : pas de lieux de départ (ils trahiraient le domicile), ni d'adresses
  if (document.body.classList.contains("nogps")) { PLACES = []; drawPlaceMarkers(); renderExplore(list, null); return; }
  const { places, loops } = clusterPlaces(list);
  const withGps = list.filter((a) => TRACKS[a.id]).length;
  PLACES = places.slice(0, PLACES_SHOWN);
  const sportsTxt = (p) => Object.entries(p.sports).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([s, n]) => `<i class="dot" style="background:${SPORT_COLOR[s]}"></i> ${esc(sportName(s))} ${n}`).join(" · ");
  if (!PLACES.length) { box.innerHTML = '<p class="empty">Aucun tracé sur cette période.</p>'; drawPlaceMarkers(); return; }
  const top3 = PLACES.slice(0, 3).reduce((t, p) => t + p.acts.size, 0);
  $("#placesInfo").textContent = `${fmtNum(loops)} boucles sur ${fmtNum(withGps)} tracés · les 3 premiers lieux concentrent ${fmtNum((top3 / Math.max(1, withGps)) * 100, 0)} % des sorties`;
  box.innerHTML = `<table><thead><tr><th></th><th class="l">Adresse</th><th>Sorties</th><th>Départs</th><th>Arrivées</th><th class="l">Sports</th><th>Dernière fois</th></tr></thead><tbody>` +
    PLACES.map((p, i) => `<tr data-i="${i}" class="place-row"><td class="rk">${i + 1}</td>
      <td class="l addr" data-geo="${geoId(p.c)}">${esc(geoCache[geoId(p.c)] || "…")}</td>
      <td>${p.acts.size}</td><td>${p.starts}</td><td>${p.ends}</td><td class="l">${sportsTxt(p)}</td>
      <td><a href="${stravaLink(p.last)}" target="_blank" rel="noopener">${fmtDate(p.last.date)}</a></td></tr>`).join("") +
    `</tbody></table><p class="muted">Un lieu regroupe les départs et arrivées à moins de ${PLACE_RADIUS} m les uns des autres. Clic sur une ligne : zoom sur la carte. Adresses : © OpenStreetMap (Nominatim).</p>`;
  // adresses manquantes, une par seconde
  PLACES.forEach((p) => {
    const id = geoId(p.c);
    if (geoCache[id]) return;
    geocode(p.c).then((txt) => {
      box.querySelectorAll(`td[data-geo="${id}"]`).forEach((td) => (td.textContent = txt || "Adresse introuvable"));
      placeLayer?.eachLayer((m) => m.options.geo === id && m.setTooltipContent(placeTip(p, txt)));
    });
  });
  drawPlaceMarkers();
  renderExplore(list, places[0]);
}
const placeTip = (p, addr) => `<b>${esc(addr || geoCache[geoId(p.c)] || "Lieu fréquent")}</b><br>${p.acts.size} sorties · ${p.starts} départs · ${p.ends} arrivées`;
function drawPlaceMarkers() {
  if (!map) return;
  if (!placeLayer) placeLayer = L.layerGroup().addTo(map);
  placeLayer.clearLayers();
  if (!placesOn) return;
  const max = Math.max(1, ...PLACES.map((p) => p.acts.size));
  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#fc5200";
  PLACES.forEach((p, i) => {
    const m = L.circleMarker(p.c, { radius: 7 + 13 * Math.sqrt(p.acts.size / max), color: "#fff", weight: 2, fillColor: accent, fillOpacity: 0.85, geo: geoId(p.c) });
    m.bindTooltip(placeTip(p), { direction: "top" });
    m.addTo(placeLayer);
    const label = L.marker(p.c, { interactive: false, icon: L.divIcon({ className: "place-num", html: String(i + 1), iconSize: [20, 20] }) });
    label.addTo(placeLayer);
  });
}
$("#places").addEventListener("click", (e) => {
  const tr = e.target.closest("tr.place-row");
  if (!tr || e.target.closest("a")) return;
  const p = PLACES[+tr.dataset.i];
  map?.setView(p.c, 15);
  $("#map").scrollIntoView({ block: "center", behavior: "smooth" });
});
$("#placesToggle").addEventListener("change", (e) => { placesOn = e.target.checked; drawPlaceMarkers(); });

// ---------- sorties en groupe ----------
function renderGroups(list) {
  const known = list.filter((a) => a.athletes != null);
  if (!known.length) {
    $("#groupKpis").innerHTML = "";
    $("#groupSports").innerHTML = $("#groupLast").innerHTML = "";
    $("#groupYears").innerHTML = `<p class="empty">${list.length ? "Le nombre de participants n'est pas encore connu : clique sur « Tout recharger »." : "Rien sur cette période."}</p>`;
    return;
  }
  const group = known.filter((a) => a.athletes > 1);
  const pct = (n, d) => (d ? fmtNum((n / d) * 100, 0) : "0") + " %";
  const bar = (n, d) => `<span class="share"><span style="width:${d ? (n / d) * 100 : 0}%"></span></span>`;
  const biggest = group.reduce((b, a) => (!b || a.athletes > b.athletes ? a : b), null);
  const last = group.reduce((b, a) => (!b || a.date > b.date ? a : b), null);
  // médiane plutôt que moyenne : une course officielle à 150 personnes fausserait tout
  const med = (arr) => (arr.length ? median(arr) : 0);
  const avg = med(group.map((a) => a.athletes));
  const link = (a, txt) => `<a href="${stravaLink(a)}" target="_blank" rel="noopener" title="${esc(a.name)}">${txt}</a>`;
  $("#groupKpis").innerHTML = [
    ["En groupe", fmtNum(group.length), `${pct(group.length, known.length)} des sorties`],
    ["Seul", fmtNum(known.length - group.length), pct(known.length - group.length, known.length)],
    ["Taille habituelle", group.length ? fmtNum(avg, 0) + " pers." : "–", "médiane, moi compris"],
    ["Plus grand groupe", biggest ? link(biggest, biggest.athletes + " pers.") : "–", biggest ? `${esc(biggest.name)} · ${fmtDate(biggest.date)}` : ""],
    ["Dernière en groupe", last ? link(last, fmtDate(last.date)) : "–", last ? `${esc(last.name)} · ${last.athletes} pers.` : ""],
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  // par sport
  const bySp = {};
  for (const a of known) {
    const r = (bySp[a.sport] ||= { n: 0, g: 0, sizes: [], last: null });
    r.n++;
    if (a.athletes > 1) { r.g++; r.sizes.push(a.athletes); if (!r.last || a.date > r.last.date) r.last = a; }
  }
  $("#groupSports").innerHTML = `<table><thead><tr><th class="l">Sport</th><th>En groupe</th><th class="l">Part</th><th>Taille méd.</th><th>Dernière</th></tr></thead><tbody>` +
    Object.entries(bySp).filter(([, r]) => r.g).sort((x, y) => y[1].g - x[1].g).map(([sp, r]) =>
      `<tr><td class="l"><i class="dot" style="background:${SPORT_COLOR[sp]}"></i> ${esc(sportName(sp))}</td><td>${r.g} / ${r.n}</td>
        <td class="l">${pct(r.g, r.n)}${bar(r.g, r.n)}</td><td>${fmtNum(med(r.sizes), 0)}</td><td>${link(r.last, fmtDate(r.last.date))}</td></tr>`).join("") +
    `</tbody></table>`;

  // dernières sorties en groupe
  $("#groupLast").innerHTML = `<table><thead><tr><th class="l">Date</th><th class="l">Sortie</th><th>Pers.</th></tr></thead><tbody>` +
    group.slice().sort((x, y) => y.date - x.date).slice(0, 8).map((a) =>
      `<tr><td class="l">${fmtDate(a.date)}</td><td class="l name"><i class="dot" style="background:${SPORT_COLOR[a.sport]}"></i> ${link(a, esc(a.name))}</td><td>${a.athletes}</td></tr>`).join("") +
    `</tbody></table>`;

  // par année
  const ys = {};
  for (const a of known) {
    const r = (ys[a.year] ||= { n: 0, g: 0, sizes: [], max: 0 });
    r.n++;
    if (a.athletes > 1) { r.g++; r.sizes.push(a.athletes); r.max = Math.max(r.max, a.athletes); }
  }
  $("#groupYears").innerHTML = `<table><thead><tr><th class="l">Année</th><th>Sorties</th><th>En groupe</th><th class="l">Part</th><th>Taille méd.</th><th>Plus grand</th></tr></thead><tbody>` +
    Object.keys(ys).sort((a, b) => b - a).map((y) => {
      const r = ys[y];
      return `<tr><td class="l">${y}</td><td>${r.n}</td><td>${r.g}</td><td class="l">${pct(r.g, r.n)}${bar(r.g, r.n)}</td><td>${r.g ? fmtNum(med(r.sizes), 0) : "–"}</td><td>${r.max || "–"}</td></tr>`;
    }).join("") + `</tbody></table>`;
}

// ---------- qui me met le plus de kudos ----------
let KUDOS = null, KUDJOB = null, kudPoll = null;
async function loadKudos() {
  const r = await api("/api/kudos");
  KUDOS = r.kudos; KUDJOB = r.kudJob;
  renderKudoers(filtered());
  renderCommunity();
  renderBilan();
  clearTimeout(kudPoll);
  if (KUDJOB.running) kudPoll = setTimeout(loadKudos, 8000);
}
function renderKudoers(list) {
  if (!KUDOS) { loadKudos(); return; }
  const missing = ALL.filter((a) => a.kudos > 0 && KUDOS[a.id]?.n !== a.kudos).length;
  const box = $("#kudStatus"), j = KUDJOB || {};
  if (j.running) {
    let wait = "";
    if (j.waitingUntil) {
      const w = new Date(j.waitingUntil), tomorrow = w.toDateString() !== new Date().toDateString();
      wait = ` · quota Strava atteint, reprise ${tomorrow ? "demain à " : "à "}${w.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    box.innerHTML = `<span>Téléchargement des kudos : ${j.done} / ${j.total} sorties, des plus récentes aux plus anciennes${wait}</span><progress max="${j.total}" value="${j.done}"></progress>`;
    box.hidden = false;
  } else if (missing) {
    box.innerHTML = `<span>${missing} sorties dont je ne connais pas encore les kudos (1 requête Strava par sortie, Strava en autorise 1 000 par jour).</span><button id="kudGo">Télécharger les kudos</button>` + (j.error ? `<span>⚠ ${esc(j.error)}</span>` : "");
    box.hidden = false;
    $("#kudGo").addEventListener("click", async () => { await api("/api/kudos/sync", { method: "POST" }); setTimeout(loadKudos, 1500); });
  } else box.hidden = true;

  // seules les sorties dont on connaît les kudos comptent
  const covered = list.filter((a) => KUDOS[a.id]);
  const withKudos = list.filter((a) => a.kudos > 0).length;
  $("#kudInfo").textContent = covered.length < withKudos ? `sur ${covered.length} des ${withKudos} sorties kudosées de la période (téléchargement en cours)` : "";
  const people = new Map();
  for (const a of covered) for (const who of KUDOS[a.id].list) {
    const p = people.get(who) || { who, n: 0, last: null, sports: {} };
    p.n++;
    p.sports[a.sport] = (p.sports[a.sport] || 0) + 1;
    if (!p.last || a.date > p.last.date) p.last = a;
    people.set(who, p);
  }
  const ranked = [...people.values()].sort((x, y) => y.n - x.n || y.last.date - x.last.date).slice(0, 25);
  if (!ranked.length) { $("#kudoers").innerHTML = '<p class="empty">Aucun kudo connu sur cette période.</p>'; return; }
  const max = ranked[0].n;
  let rank = 0, prev = null;
  $("#kudoers").innerHTML = `<table><thead><tr><th></th><th class="l">Qui</th><th>Kudos</th><th class="l"></th><th>Part de mes sorties</th><th class="l">Sport le plus kudosé</th><th>Dernier kudo</th></tr></thead><tbody>` +
    ranked.map((p, i) => {
      if (p.n !== prev) { rank = i + 1; prev = p.n; }
      const [sp, sn] = Object.entries(p.sports).sort((a, b) => b[1] - a[1])[0];
      return `<tr><td class="rk">${rank}</td><td class="l"><b>${esc(p.who)}</b></td><td>${p.n}</td>
        <td class="l barcell"><span style="width:${(p.n / max) * 100}%"></span></td>
        <td>${fmtNum((p.n / covered.length) * 100, 0)} %</td>
        <td class="l"><i class="dot" style="background:${SPORT_COLOR[sp]}"></i> ${esc(sportName(sp))} (${sn})</td>
        <td><a href="${stravaLink(p.last)}" target="_blank" rel="noopener" title="${esc(p.last.name)}">${fmtDate(p.last.date)}</a></td></tr>`;
    }).join("") + `</tbody></table><p class="muted">${fmtNum(people.size)} personnes différentes. Strava n'affiche que l'initiale du nom : deux personnes au même prénom et même initiale sont comptées ensemble.</p>`;
}

// ---------- page « Records & détails » (fiche détaillée de chaque sortie) ----------
let DETAILS = null, DETJOB = null, detPoll = null;
async function loadDetails() {
  const r = await api("/api/details");
  DETAILS = r.details; DETJOB = r.detJob;
  renderDetails(filtered());
  renderBilan();
  renderZones();
  clearTimeout(detPoll);
  if (DETJOB.running) detPoll = setTimeout(loadDetails, 15000);
}
const EFFORTS = [
  ["400m", "400 m"], ["1/2 mile", "½ mile"], ["1K", "1 km"], ["1 mile", "1 mile"], ["2 mile", "2 miles"], ["5K", "5 km"],
  ["10K", "10 km"], ["15K", "15 km"], ["10 mile", "10 miles"], ["20K", "20 km"], ["Half-Marathon", "Semi-marathon"], ["30K", "30 km"], ["Marathon", "Marathon"],
];
const RACE_TYPES = new Set([1, 11]); // course officielle (course à pied, vélo)
const dlink = (a, txt) => `<a href="${stravaLink(a)}" target="_blank" rel="noopener" title="${esc(a.name)}">${txt}</a>`;

function renderDetails(list) {
  if (!DETAILS) { loadDetails(); return; }
  // statut du téléchargement
  const missing = ALL.filter((a) => !(a.id in DETAILS)).length;
  const box = $("#detStatus"), j = DETJOB || {};
  if (j.running) {
    let wait = "";
    if (j.waitingUntil) {
      const w = new Date(j.waitingUntil), tomorrow = w.toDateString() !== new Date().toDateString();
      wait = ` · quota Strava atteint, reprise ${tomorrow ? "demain à " : "à "}${w.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    box.innerHTML = `<span>Téléchargement des fiches détaillées : ${j.done} / ${j.total} sorties, des plus récentes aux plus anciennes${wait}</span><progress max="${j.total}" value="${j.done}"></progress><span class="muted">La page se complète au fur et à mesure.</span>`;
    box.hidden = false;
  } else if (missing) {
    box.innerHTML = `<span>${missing} sorties sans fiche détaillée (1 requête Strava par sortie, 1 000 par jour au plus).</span><button id="detGo">Télécharger les fiches</button>` + (j.error ? `<span>⚠ ${esc(j.error)}</span>` : "");
    box.hidden = false;
    $("#detGo").addEventListener("click", async () => { await api("/api/details/sync", { method: "POST" }); setTimeout(loadDetails, 1500); });
  } else box.hidden = true;

  const covered = list.filter((a) => DETAILS[a.id] && !DETAILS[a.id].missing);
  const D = (a) => DETAILS[a.id];
  $("#detCoverage").textContent = covered.length < list.length ? `fiches connues pour ${fmtNum(covered.length)} des ${fmtNum(list.length)} sorties de la période` : "";

  // ---- chiffres ----
  const races = covered.filter((a) => RACE_TYPES.has(D(a).wt));
  const cal = covered.reduce((t, a) => t + (D(a).cal || 0), 0);
  const prs = covered.reduce((t, a) => t + D(a).best.filter((e) => e.pr === 1).length, 0);
  const segPr = covered.reduce((t, a) => t + D(a).segs.filter((e) => e.pr === 1).length, 0);
  $("#detKpis").innerHTML = [
    ["Courses officielles", fmtNum(races.length), "marquées « course » sur Strava"],
    ["Calories", fmtNum(cal, 0) + " kcal", `≈ ${fmtNum(cal / 250, 0)} pains au chocolat`],
    ["Records battus", fmtNum(prs), "meilleurs efforts en course à pied"],
    ["Records de segment", fmtNum(segPr), "sur " + fmtNum(covered.reduce((t, a) => t + D(a).segs.length, 0)) + " passages"],
    ["Photos", fmtNum(covered.reduce((t, a) => t + (D(a).photos || 0), 0)), `${fmtNum(covered.filter((a) => D(a).desc).length)} sorties avec une description`],
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  // ---- records (meilleurs efforts) ----
  const byEffort = new Map();
  for (const a of covered) for (const e of D(a).best) {
    if (!byEffort.has(e.name)) byEffort.set(e.name, []);
    byEffort.get(e.name).push({ ...e, a });
  }
  const rows = EFFORTS.filter(([k]) => byEffort.has(k)).map(([k, label]) => {
    const arr = byEffort.get(k).sort((x, y) => x.t - y.t);
    const b = arr[0];
    const others = arr.slice(1, 3).map((e) => dlink(e.a, fmtDuration(e.t))).join(" · ");
    return `<tr><td class="l"><b>${label}</b></td><td><b>${dlink(b.a, fmtDuration(b.t))}</b></td><td>${fmtPace(b.t / (b.d / 1000))} /km</td>
      <td>${fmtDate(b.a.date)}</td><td class="l muted">${others || "–"}</td><td>${arr.length}</td></tr>`;
  });
  $("#detRecords").innerHTML = rows.length
    ? `<table><thead><tr><th class="l">Distance</th><th>Record</th><th>Allure</th><th>Date</th><th class="l">2e et 3e</th><th>Fois</th></tr></thead><tbody>${rows.join("")}</tbody></table>
       <p class="muted">Meilleurs temps calculés par Strava à l'intérieur de tes courses (n'importe quel morceau de la sortie), sur la période et les sports choisis.</p>`
    : '<p class="empty">Aucun meilleur effort connu sur cette période (ils n\'existent que pour la course à pied).</p>';

  // ---- courses officielles ----
  $("#detRaces").innerHTML = races.length
    ? `<table><thead><tr><th class="l">Date</th><th class="l">Course</th><th class="l">Sport</th><th>Distance</th><th>Temps</th><th>Allure / vitesse</th><th>D+</th><th>FC moy.</th></tr></thead><tbody>` +
      races.slice().sort((x, y) => y.date - x.date).map((a) => `<tr><td class="l">${fmtDate(a.date)}</td><td class="l name">${dlink(a, esc(a.name))}</td>
        <td class="l"><i class="dot" style="background:${SPORT_COLOR[a.sport]}"></i> ${esc(sportName(a.sport))}</td><td>${fmtNum(a.distance / 1000, 2)} km</td>
        <td>${fmtDuration(a.elapsed_time)}</td><td>${fmtSpeed(a)}</td><td>${fmtNum(a.elevation || 0, 0)} m</td><td>${a.avg_hr ? Math.round(a.avg_hr) : "–"}</td></tr>`).join("") + `</tbody></table>`
    : '<p class="empty">Aucune sortie marquée « course » sur cette période. Sur Strava, le type de sortie se règle dans « Modifier l\'activité ».</p>';

  // ---- segments ----
  const segs = new Map();
  for (const a of covered) for (const e of D(a).segs) {
    if (!e.id) continue;
    const s = segs.get(e.id) || { id: e.id, name: e.name, city: e.city, d: e.d, grade: e.grade, n: 0, best: null, last: null, prs: 0, kom: null, all: [] };
    s.n++;
    s.all.push({ t: e.t, a, pr: e.pr });
    if (!s.best || e.t < s.best.t) s.best = { t: e.t, a };
    if (!s.last || a.date > s.last.date) s.last = a;
    if (e.pr === 1) s.prs++;
    if (e.kom && (!s.kom || e.kom < s.kom.rank)) s.kom = { rank: e.kom, a };
    segs.set(e.id, s);
  }
  const segList = [...segs.values()].sort((x, y) => y.n - x.n).slice(0, 25);
  $("#detSegs").innerHTML = segList.length
    ? `<table><thead><tr><th class="l">Segment</th><th>Distance</th><th>Pente</th><th>Passages</th><th>Meilleur temps</th><th>Records</th><th>Dernier passage</th></tr></thead><tbody>` +
      segList.map((s) => `<tr data-seg="${s.id}" class="${s.id === selSeg ? "sel" : ""}"><td class="l name" title="${esc(s.name)}">${esc(s.name)}${s.city ? ` <span class="muted">${esc(s.city)}</span>` : ""}</td>
        <td>${fmtNum((s.d || 0) / 1000, 2)} km</td><td>${s.grade != null ? fmtNum(s.grade, 1) + " %" : "–"}</td><td>${s.n}</td>
        <td>${dlink(s.best.a, fmtDuration(s.best.t))} <span class="muted">${fmtDate(s.best.a.date)}</span></td><td>${s.prs || "–"}</td><td>${fmtDate(s.last.date)}</td></tr>`).join("") + `</tbody></table>`
    : '<p class="empty">Aucun segment connu sur cette période.</p>';
  SEGS = segs;
  renderSegDetail();
  const tops = [...segs.values()].filter((s) => s.kom && s.kom.rank <= 10).sort((x, y) => x.kom.rank - y.kom.rank);
  $("#detKoms").innerHTML = tops.length
    ? `<table><thead><tr><th>Place</th><th class="l">Segment</th><th>Date</th></tr></thead><tbody>` +
      tops.map((s) => `<tr><td><b>${s.kom.rank === 1 ? "1re (KOM/QOM)" : s.kom.rank + "e"}</b></td><td class="l name">${esc(s.name)}</td><td>${dlink(s.kom.a, fmtDate(s.kom.a.date))}</td></tr>`).join("") + `</tbody></table>`
    : '<p class="empty">Aucun top 10 au classement d\'un segment sur cette période.</p>';

  // ---- matériel et appareils ----
  const gear = new Map(), dev = new Map();
  const bump = (m, key, a, extra = {}) => {
    const g = m.get(key) || { key, n: 0, km: 0, t: 0, first: a, last: a, sports: {}, ...extra };
    g.n++; g.km += a.distance / 1000; g.t += a.moving_time;
    if (a.date < g.first.date) g.first = a;
    if (a.date > g.last.date) g.last = a;
    g.sports[a.sport] = (g.sports[a.sport] || 0) + 1;
    m.set(key, g);
  };
  // le matériel vient du résumé de chaque sortie (toutes connues), le nom des fiches détaillées
  const gearName = {};
  for (const d of Object.values(DETAILS)) if (d.gear) gearName[d.gear.id] = d.gear.name;
  for (const a of ALL) if (a.gear) bump(gear, a.gear, a, { name: gearName[a.gear] || null });
  for (const a of covered) if (D(a).device) bump(dev, D(a).device, a);
  const sportsOf = (g) => Object.entries(g.sports).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([s]) => `<i class="dot" style="background:${SPORT_COLOR[s]}"></i> ${esc(sportName(s))}`).join(" ");
  const usageTable = (m, label) => m.size
    ? `<table><thead><tr><th class="l">${label}</th><th class="l">Sports</th><th>Sorties</th><th>Km</th><th>Temps</th><th>Depuis</th><th>Dernière fois</th></tr></thead><tbody>` +
      [...m.values()].sort((x, y) => y.km - x.km).map((g) => `<tr><td class="l"><b>${esc(g.key)}</b></td><td class="l">${sportsOf(g)}</td><td>${g.n}</td>
        <td>${fmtNum(g.km, 0)}</td><td>${fmtHours(g.t / 3600)}</td><td>${fmtDate(g.first.date)}</td><td>${fmtDate(g.last.date)}</td></tr>`).join("") + `</tbody></table>`
    : '<p class="empty">Rien de connu sur cette période.</p>';
  $("#detGear").innerHTML = gear.size
    ? `<table><thead><tr><th class="l">Matériel</th><th class="l">Sports</th><th>Sorties</th><th>Km</th><th class="l">Usure</th><th>Depuis</th><th>Dernière fois</th></tr></thead><tbody>` +
      [...gear.values()].sort((x, y) => y.last.date - x.last.date).map((g) => {
        const shoe = String(g.key).startsWith("g");
        const pct = Math.min(1, g.km / 800);
        const col = g.km > 800 ? "var(--series-8)" : g.km > 600 ? "var(--series-4)" : "var(--series-3)";
        const wear = shoe ? `<span class="wear"><span style="width:${pct * 100}%;background:${col}"></span></span>${g.km > 800 ? "à changer" : g.km > 600 ? "bien usées" : "ok"}` : "–";
        const retired = (Date.now() - g.last.date) / 86400000 > 120;
        return `<tr${retired ? ' style="opacity:.55"' : ""}><td class="l"><b>${esc(g.name || "Matériel sans nom (" + g.key + ")")}</b>${retired ? ' <span class="muted">plus utilisé</span>' : ""}</td><td class="l">${sportsOf(g)}</td><td>${g.n}</td>
          <td>${fmtNum(g.km, 0)}</td><td class="l">${wear}</td><td>${fmtDate(g.first.date)}</td><td>${fmtDate(g.last.date)}</td></tr>`;
      }).join("") + `</tbody></table>` + (Object.keys(gearName).length < gear.size ? `<p class="muted">Certains noms arriveront avec les fiches détaillées.</p>` : "")
    : '<p class="empty">Aucun matériel déclaré sur Strava.</p>';
  renderRecordProgress(covered);
  renderPredictions();
  $("#detDevices").innerHTML = usageTable(dev, "Appareil");
}

// ---------- forme, fatigue, fraîcheur ----------
// Charge d'une sortie ≈ « TSS cardiaque » : 100 = 1 h au seuil (seuil estimé à 85 % de la réserve cardiaque).
// Forme = moyenne exponentielle de la charge sur 42 jours, fatigue = sur 7 jours, fraîcheur = forme − fatigue (de la veille).
const fmState = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("forme") || "{}"); } catch {}
  return { rest: s.rest || 50, max: s.max || null };
})();
const saveFm = () => { try { localStorage.setItem("forme", JSON.stringify({ rest: fmState.rest, max: fmState.max })); } catch {} };

function autoMaxHr() {
  // 99e centile des FC max des 2 dernières années (évite les pics aberrants)
  const since = new Date(); since.setFullYear(since.getFullYear() - 2);
  const v = ALL.filter((a) => a.date >= since && a.max_hr && a.max_hr < 225).map((a) => a.max_hr).sort((x, y) => x - y);
  return v.length ? Math.round(v[Math.floor(v.length * 0.99)]) : 190;
}

function loadOf(a, hrMax, perSportRate) {
  if (a.avg_hr && a.moving_time) {
    const hrr = Math.max(0, Math.min(1.1, (a.avg_hr - fmState.rest) / (hrMax - fmState.rest)));
    return { load: (a.moving_time / 3600) * (hrr / 0.85) ** 2 * 100, est: false };
  }
  // sans cardio : charge horaire habituelle du sport (médiane), sinon 40 par heure
  return { load: (a.moving_time / 3600) * (perSportRate[a.sport] ?? 40), est: true };
}

function renderForme(listAll) {
  const box = $("#fmChart");
  if (!box) return;
  const hrMax = fmState.max || autoMaxHr();
  $("#fmMax").placeholder = autoMaxHr();
  const acts = ALL.filter(bySport);
  if (!acts.length) { box.innerHTML = '<p class="empty">Rien à afficher.</p>'; $("#fmKpis").innerHTML = ""; $("#fmTsb").innerHTML = ""; return; }
  // charge horaire médiane par sport, pour les sorties sans cardio
  const rates = {};
  for (const a of acts) if (a.avg_hr && a.moving_time > 600) (rates[a.sport] ||= []).push(loadOf(a, hrMax, {}).load / (a.moving_time / 3600));
  const perSportRate = Object.fromEntries(Object.entries(rates).map(([s, v]) => [s, median(v)]));

  const DAY = 86400000;
  const t0 = new Date(acts[0].date.getFullYear(), acts[0].date.getMonth(), acts[0].date.getDate()).getTime();
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((today - t0) / DAY) + 1;
  const load = new Float64Array(days), dayActs = Array.from({ length: days }, () => []);
  let estimated = 0;
  for (const a of acts) {
    const i = Math.round((new Date(a.date.getFullYear(), a.date.getMonth(), a.date.getDate()) - t0) / DAY);
    if (i < 0 || i >= days) continue; // sortie datée après aujourd'hui (fuseau horaire) : ignorée
    const l = loadOf(a, hrMax, perSportRate);
    load[i] += l.load; dayActs[i].push({ a, ...l });
    if (l.est) estimated++;
  }
  const ctl = new Float64Array(days), atl = new Float64Array(days), tsb = new Float64Array(days);
  const kc = 1 - Math.exp(-1 / 42), ka = 1 - Math.exp(-1 / 7);
  for (let i = 0; i < days; i++) {
    const pc = i ? ctl[i - 1] : 0, pa = i ? atl[i - 1] : 0;
    tsb[i] = pc - pa; // fraîcheur du matin : avant la séance du jour
    ctl[i] = pc + (load[i] - pc) * kc;
    atl[i] = pa + (load[i] - pa) * ka;
  }
  const L = days - 1;
  const ramp = ctl[L] - ctl[Math.max(0, L - 7)];
  const status = (v) => v > 15 ? ["Très frais", "repos long : la forme commence à baisser"] : v > 5 ? ["Frais", "bon moment pour une course"]
    : v > -10 ? ["Équilibré", "entraînement d'entretien"] : v > -30 ? ["En charge", "zone de progression"] : ["Surcharge", "risque de fatigue excessive"];
  const [st, stTxt] = status(tsb[L]);
  const peakI = ctl.reduce((b, v, i) => (v > ctl[b] ? i : b), 0);
  const fmtD = (i) => fmtDate(new Date(t0 + i * DAY));
  $("#fmKpis").innerHTML = [
    ["Forme", fmtNum(ctl[L], 0), `charge moyenne sur 6 semaines · record ${fmtNum(ctl[peakI], 0)} le ${fmtD(peakI)}`],
    ["Fatigue", fmtNum(atl[L], 0), "charge moyenne sur 7 jours"],
    ["Fraîcheur", (tsb[L] > 0 ? "+" : "") + fmtNum(tsb[L], 0), `${st} : ${stTxt}`],
    ["Évolution de la forme", (ramp >= 0 ? "+" : "") + fmtNum(ramp, 1), ramp > 8 ? "sur 7 jours : hausse très rapide, attention" : ramp > 3 ? "sur 7 jours : belle montée" : ramp < -3 ? "sur 7 jours : en baisse" : "sur 7 jours : stable"],
    ["Charge des 7 derniers jours", fmtNum(load.slice(Math.max(0, L - 6)).reduce((t, v) => t + v, 0), 0), `${dayActs.slice(Math.max(0, L - 6)).flat().length} sorties`],
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  // fenêtre affichée : la période choisie (au moins 60 jours)
  const [pf, pt] = periodRange();
  let i0 = Math.max(0, Math.round((new Date(pf.getFullYear(), pf.getMonth(), pf.getDate()) - t0) / DAY));
  const i1 = Math.min(L, Math.round((new Date(pt.getFullYear(), pt.getMonth(), pt.getDate()) - t0) / DAY));
  if (i1 - i0 < 60) i0 = Math.max(0, i1 - 60);
  const n = i1 - i0 + 1;
  const races = new Set();
  if (DETAILS) for (const a of acts) if (RACE_TYPES.has(DETAILS[a.id]?.wt)) races.add(Math.round((new Date(a.date.getFullYear(), a.date.getMonth(), a.date.getDate()) - t0) / DAY));

  const W = CW(), pad = { t: 14, r: 16, b: 26, l: 44 };
  const sx = (i) => pad.l + ((i - i0) / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const monthTicks = (s, H) => {
    let last = -1;
    for (let i = i0; i <= i1; i++) {
      const d = new Date(t0 + i * DAY);
      if (d.getDate() === 1 && d.getMonth() !== last) {
        last = d.getMonth();
        if (n > 500 && d.getMonth() !== 0) continue;
        el(s, "text", { x: sx(i) + 2, y: H - 8 }, d.getMonth() === 0 ? String(d.getFullYear()) : MONTHS[d.getMonth()]);
        el(s, "line", { x1: sx(i), x2: sx(i), y1: pad.t, y2: H - pad.b, class: "grid-line" });
      }
    }
  };
  const poly = (arr, sy) => { const p = []; const step = n > 900 ? 2 : 1; for (let i = i0; i <= i1; i += step) p.push(`${sx(i).toFixed(1)},${sy(arr[i]).toFixed(1)}`); return p.join(" "); };

  // ---- graphe 1 : charge du jour (barres), forme et fatigue (courbes), même unité ----
  {
    const H = 300, s = svg(W, H);
    let mx = 0;
    for (let i = i0; i <= i1; i++) mx = Math.max(mx, ctl[i], atl[i], Math.min(load[i], 250));
    const max = niceMax(mx);
    const sy = (v) => H - pad.b - (Math.min(v, max) / max) * (H - pad.t - pad.b);
    yAxis(s, W, H, pad, max);
    monthTicks(s, H);
    const bw = Math.max(1, (W - pad.l - pad.r) / n - 1);
    for (let i = i0; i <= i1; i++) if (load[i] > 0) el(s, "rect", { x: sx(i) - bw / 2, y: sy(load[i]), width: bw, height: H - pad.b - sy(load[i]), fill: "var(--axis)", opacity: 0.55 });
    for (const i of races) if (i >= i0 && i <= i1) {
      el(s, "line", { x1: sx(i), x2: sx(i), y1: pad.t, y2: H - pad.b, stroke: "var(--accent)", "stroke-dasharray": "3 3" });
      el(s, "text", { x: sx(i), y: pad.t - 3, "text-anchor": "middle", style: "fill:var(--accent)" }, "course");
    }
    el(s, "polyline", { points: poly(atl, sy), fill: "none", stroke: "var(--series-2)", "stroke-width": 1.8, "stroke-linejoin": "round" });
    el(s, "polyline", { points: poly(ctl, sy), fill: "none", stroke: "var(--series-1)", "stroke-width": 2.6, "stroke-linejoin": "round" });
    hover(s, H, sy);
    box.innerHTML = "";
    box.appendChild(s);
    const leg = document.createElement("div");
    leg.className = "legend";
    leg.innerHTML = `<span><i style="background:var(--series-1);height:3px"></i>Forme (6 semaines)</span><span><i style="background:var(--series-2)"></i>Fatigue (7 jours)</span><span><i style="background:var(--axis);height:8px;width:8px"></i>Charge du jour</span>` +
      (races.size ? `<span><i style="background:var(--accent)"></i>Course officielle</span>` : "");
    box.appendChild(leg);
  }
  // ---- graphe 2 : fraîcheur, avec ses zones ----
  {
    const H = 200, s = svg(W, H);
    let lo = 0, hi = 0;
    for (let i = i0; i <= i1; i++) { lo = Math.min(lo, tsb[i]); hi = Math.max(hi, tsb[i]); }
    lo = Math.min(-35, Math.floor(lo / 10) * 10); hi = Math.max(25, Math.ceil(hi / 10) * 10);
    const sy = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
    const zone = (a, b, col, label) => {
      el(s, "rect", { x: pad.l, y: sy(Math.min(b, hi)), width: W - pad.l - pad.r, height: sy(Math.max(a, lo)) - sy(Math.min(b, hi)), fill: col, opacity: 0.09 });
      el(s, "text", { x: W - pad.r - 4, y: sy(Math.min(b, hi)) + 12, "text-anchor": "end" }, label);
    };
    zone(5, 999, "var(--series-3)", "frais");
    zone(-10, 5, "var(--other)", "équilibré");
    zone(-30, -10, "var(--series-1)", "en charge");
    zone(-999, -30, "var(--series-8)", "surcharge");
    for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) el(s, "text", { x: pad.l - 6, y: sy(v) + 4, "text-anchor": "end" }, v);
    el(s, "line", { x1: pad.l, x2: W - pad.r, y1: sy(0), y2: sy(0), class: "base-line" });
    monthTicks(s, H);
    el(s, "polyline", { points: poly(tsb, sy), fill: "none", stroke: "var(--text-primary)", "stroke-width": 1.8, "stroke-linejoin": "round" });
    hover(s, H, sy, true);
    $("#fmTsb").innerHTML = "";
    $("#fmTsb").appendChild(s);
  }
  // réticule commun
  function hover(s, H, sy, isTsb) {
    const cross = el(s, "line", { y1: pad.t, y2: H - pad.b, stroke: "var(--axis)", visibility: "hidden" });
    const hit = el(s, "rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, class: "hit" });
    hit.addEventListener("mousemove", (e) => {
      const r = s.getBoundingClientRect();
      const i = Math.max(i0, Math.min(i1, Math.round(i0 + ((((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
      cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("visibility", "visible");
      const list = dayActs[i].map((x) => `<div class="row"><span><i class="dot" style="background:${SPORT_COLOR[x.a.sport]}"></i> ${esc(x.a.name)}</span><span>${fmtNum(x.load, 0)}${x.est ? "*" : ""}</span></div>`).join("");
      showTip(e, `<b>${fmtD(i)}</b>
        <div class="row"><span>Forme</span><span>${fmtNum(ctl[i], 0)}</span></div>
        <div class="row"><span>Fatigue</span><span>${fmtNum(atl[i], 0)}</span></div>
        <div class="row"><span>Fraîcheur</span><span>${tsb[i] > 0 ? "+" : ""}${fmtNum(tsb[i], 0)} · ${status(tsb[i])[0].toLowerCase()}</span></div>` +
        (list ? `<div style="margin-top:4px">${list}</div>` : `<div class="row"><span>Repos</span></div>`));
    });
    hit.addEventListener("mouseleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
  }
  $("#fmNote").textContent = `FC max ${hrMax} bpm${fmState.max ? "" : " (estimée)"}, FC de repos ${fmState.rest} bpm. ` +
    (estimated ? `${fmtNum(estimated)} sorties sans cardio : charge estimée d'après la durée (marquées * au survol).` : "");
}
$("#fmRest").value = fmState.rest;
$("#fmMax").value = fmState.max || "";
$("#fmRest").addEventListener("change", (e) => { const v = +e.target.value; if (v >= 30 && v <= 100) { fmState.rest = v; saveFm(); renderForme(); } });
$("#fmMax").addEventListener("change", (e) => { const v = +e.target.value; fmState.max = v >= 140 && v <= 230 ? v : null; if (!fmState.max) e.target.value = ""; saveFm(); renderForme(); });

function render() {
  const list = filtered();
  renderKpis(list);
  renderMap(list);
  renderPlaces(list);
  renderFc();
  renderVolume(list);
  renderGoal();
  renderCumul();
  renderAllTime();
  renderHeatmap();
  renderSports(list);
  renderWhen(list);
  renderRecords(list);
  renderTop(list);
  renderGroups(list);
  renderKudosFactors(list);
  renderCommunity();
  renderKudoers(list);
  renderCommenters(list);
  renderDetails(list);
  renderForme();
  renderCompare();
  renderBilan();
  renderYears();
  renderList(list);
}

// ---------- événements ----------
$("#fPeriod").addEventListener("change", (e) => {
  state.period = e.target.value;
  if (state.period === "custom" && !state.from) {
    // par défaut : les 3 derniers mois
    const t = new Date(), f = new Date(t.getFullYear(), t.getMonth() - 3, t.getDate());
    state.from = dayKey(f); state.to = dayKey(t);
    $("#fFrom").value = state.from; $("#fTo").value = state.to;
  }
  $("#fRange").hidden = state.period !== "custom";
  state.page = 0;
  render();
});
for (const id of ["#fFrom", "#fTo"]) $(id).addEventListener("change", () => {
  let f = $("#fFrom").value, t = $("#fTo").value;
  if (!f || !t) return;
  if (f > t) [f, t] = [t, f]; // dates inversées : on remet dans l'ordre
  $("#fFrom").value = state.from = f; $("#fTo").value = state.to = t;
  state.page = 0;
  render();
});
$("#fMetric").addEventListener("change", (e) => { state.metric = e.target.value; render(); });
$("#fMetricSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  e.currentTarget.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  $("#fMetric").value = b.dataset.m;
  $("#fMetric").dispatchEvent(new Event("change"));
});
$("#fSports").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  if (b.dataset.more) {
    const open = e.currentTarget.classList.toggle("open");
    b.textContent = open ? "moins" : `+${e.currentTarget.querySelectorAll(".chip.extra").length}`;
    return;
  }
  const all = Object.keys(SPORT_COLOR);
  if (b.dataset.all) state.sports = new Set(all);
  else if (e.ctrlKey || e.metaKey || state.sports.size === all.length) {
    // premier clic : on isole ce sport ; Ctrl+clic ou clics suivants : on ajoute / retire
    if (state.sports.size === all.length && !(e.ctrlKey || e.metaKey)) state.sports = new Set([b.dataset.sport]);
    else state.sports.has(b.dataset.sport) ? state.sports.delete(b.dataset.sport) : state.sports.add(b.dataset.sport);
  } else {
    state.sports.has(b.dataset.sport) ? state.sports.delete(b.dataset.sport) : state.sports.add(b.dataset.sport);
  }
  if (!state.sports.size) state.sports = new Set(all);
  document.querySelectorAll("#fSports .chip[data-sport]").forEach((c) => c.classList.toggle("on", state.sports.has(c.dataset.sport)));
  $("#fSports").classList.toggle("all", state.sports.size === all.length);
  state.page = 0;
  render();
});
document.querySelector(".card-head .seg[aria-label='Granularité']").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.gran = b.dataset.gran;
  e.currentTarget.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderVolume(filtered());
});
$("#topSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.top = b.dataset.top;
  e.currentTarget.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderTop(filtered());
});
$("#search").addEventListener("input", (e) => { state.search = e.target.value; state.page = 0; renderList(filtered()); });
$("#list").addEventListener("click", (e) => {
  const th = e.target.closest("th");
  if (!th) return;
  if (state.sort === th.dataset.k) state.asc = !state.asc;
  else { state.sort = th.dataset.k; state.asc = ["name", "sport"].includes(th.dataset.k); }
  renderList(filtered());
});
$("#pager").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  state.page += Number(b.dataset.p);
  renderList(filtered());
  $("#list").scrollIntoView({ block: "start" });
});

// ---------- chargement et synchro ----------
// site public (export statique) : les données viennent de fichiers, rien n'est envoyé
const STATIC = document.documentElement.dataset.static === "1";
async function api(path, opts) {
  if (STATIC) {
    if (opts?.method === "POST") return {};
    const name = path.split("?")[0].replace(/^\/api\//, "");
    const r = await fetch(`data/${name}.json`, { cache: "no-cache" }); // données toujours à jour après une publication
    return r.ok ? r.json() : {};
  }
  const r = await fetch(path, opts);
  return r.json();
}
let polling = null;
let knownSports = new Set();
async function startSync(full) {
  if (full && !confirm("Recharger tout l'historique depuis Strava ? (quelques requêtes par tranche de 200 activités)")) return;
  await api(`/api/sync${full ? "?full=1" : ""}`, { method: "POST" });
  pollStatus();
}
function pollStatus() {
  clearTimeout(polling);
  polling = setTimeout(async () => {
    const st = await api("/api/status");
    showStatus(st);
    if (st.sync.running) pollStatus();
    else await loadData();
  }, 1500);
}
function showStatus(st) {
  const s = st.sync;
  $("#btnSync").disabled = $("#btnFull").disabled = s.running;
  if (s.running) $("#syncInfo").textContent = `Synchro… ${s.fetched} activités`;
  else if (st.static) $("#syncInfo").textContent = `Données du ${new Date(st.exportedAt || st.lastSync).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
  else if (s.error) $("#syncInfo").textContent = "⚠ " + s.error;
  else $("#syncInfo").textContent = st.lastSync ? `À jour · ${new Date(st.lastSync).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "";
  renderJobs(st);
}

async function loadData() {
  const data = await api("/api/activities");
  const { list, order, counts } = prepare(data.activities);
  ALL = list;
  // un sport apparu lors d'une synchro est sélectionné d'office
  if (!state.sports) state.sports = new Set(order);
  else for (const s of order) if (!knownSports.has(s)) state.sports.add(s);
  knownSports = new Set(order);
  renderFilters(order, counts);
  $("#dash").hidden = false;
  try {
    const t = await api("/api/tracks");
    TRACKS = t.tracks; MISSING = t.missing; decoded.clear();
  } catch { TRACKS = {}; }
  render();
  map?.invalidateSize();
}

function showSetup(st) {
  const m = $("#setup");
  m.hidden = false;
  if (!st.configured) {
    m.innerHTML = `<div class="card"><h2>Première mise en route</h2>
      <ol>
        <li>Va sur <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> et crée une application (nom libre, site : <code>http://localhost</code>).</li>
        <li>Dans <b>Authorization Callback Domain</b>, mets <code>localhost</code>.</li>
        <li>Copie <code>.env.example</code> en <code>.env</code> et colle le <b>Client ID</b> et le <b>Client Secret</b>.</li>
        <li>Relance <code>npm start</code> puis recharge cette page.</li>
      </ol></div>`;
  } else {
    m.innerHTML = `<div class="card"><h2>Connecte ton compte</h2>
      <p>L'appli lit tes activités (y compris privées) et les garde sur ton ordinateur, dans <code>data/</code>. Rien n'est envoyé ailleurs.</p>
      <a class="strava-btn" href="/auth/login">Se connecter avec Strava</a></div>`;
  }
}

async function boot() {
  const st = await api("/api/status");
  if (st.lite) {
    // version légère : analyse par sortie seulement, pas de page records
    document.body.classList.add("lite");
    $("#liteBadge").hidden = false;
    document.title = "Mes stats Strava (léger)";
    fcState.detail = "sortie";
    if (location.hash === "#det") location.hash = "";
  }
  if (st.static) {
    document.body.classList.add("static");
    neutralTexts(st.athlete?.firstname);
    // site public : « Les stats de Prénom » plutôt que « Mes stats »
    if (st.athlete?.firstname) $(".brand span:last-child").textContent = `Stats de ${st.athlete.firstname}`;
    showPage(); // met à jour le titre de l'onglet
    if (!st.privacy?.names) document.body.classList.add("nonames");
    // lieux de départ et adresses (ils situent le domicile) : seulement si l'export les inclut
    if (!st.privacy?.places) { document.body.classList.add("nogps"); placesOn = false; }
  }
  if (!st.connected) return showSetup(st);
  const ath = st.athlete;
  $("#who").textContent = ath ? `${ath.firstname} ${ath.lastname}`.trim() + (st.demo ? " (démo)" : "") : "";
  const av = $("#avatar");
  if (ath?.profile && /^https:/.test(ath.profile)) av.style.backgroundImage = `url("${ath.profile}")`;
  else av.textContent = ath ? (ath.firstname[0] || "") + (ath.lastname?.[0] || "") : "";
  if (!st.demo) {
    $("#btnSync").hidden = $("#btnFull").hidden = $("#btnLogout").hidden = !!st.static;
  }
  showStatus(st);
  await loadData();
  if (st.sync.running) pollStatus();
  else if (!st.demo && st.count === 0) startSync(false);
}
$("#btnSync").addEventListener("click", () => startSync(false));
$("#btnFull").addEventListener("click", () => startSync(true));
$("#btnLogout").addEventListener("click", async () => {
  if (!confirm("Oublier la connexion Strava ? (les activités déjà téléchargées restent sur le disque)")) return;
  await api("/auth/logout", { method: "POST" });
  location.reload();
});
// ---------- pages : tableau de bord / fréquence cardiaque ----------
const PAGES = {
  overview: ["Vue d'ensemble", "Tes chiffres clés et le volume de tes sorties, sur la période et les sports choisis."],
  carte: ["Carte et lieux", "Tous tes tracés et les endroits d'où tu pars le plus souvent."],
  progression: ["Progression", "Comment ton volume s'accumule au fil des années, et ta régularité."],
  forme: ["Forme et fatigue", "Ta charge d'entraînement jour après jour : quand tu progresses, quand tu en fais trop, quand tu es frais."],
  fc: ["Fréquence cardiaque", "Ta FC selon l'allure et son évolution : à allure égale, une FC plus basse est un signe de progrès."],
  det: ["Records et détails", "Tes meilleurs temps, courses officielles, segments et matériel."],
  social: ["Communauté", "Qui te suit de près : kudos, commentaires et sorties en groupe."],
  activites: ["Activités", "La liste complète, à trier et à fouiller."],
  comparer: ["Comparer", "Deux périodes côte à côte : est-ce que tu en fais plus, plus vite, plus régulièrement ?"],
  bilan: ["Bilan de l'année", "Ton année en un coup d'œil, à garder ou à imprimer."],
};
function showPage() {
  if (document.body.classList.contains("lite") && location.hash === "#det") { location.hash = ""; return; }
  const page = { "#carte": "carte", "#progression": "progression", "#forme": "forme", "#fc": "fc", "#det": "det", "#social": "social", "#activites": "activites", "#comparer": "comparer", "#bilan": "bilan" }[location.hash] || "overview";
  document.body.dataset.page = page;
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.page === page));
  $("#pageTitle").textContent = PAGES[page][0];
  $("#pageDesc").textContent = PAGES[page][1];
  document.title = `${PAGES[page][0]} · ${$(".brand span:last-child").textContent === "Mes stats" ? "Mes stats Strava" : $(".brand span:last-child").textContent}`;
  // la carte a été dessinée cachée : on lui redonne sa taille puis on recadre
  if (page === "carte") setTimeout(() => { map?.invalidateSize(); fitMap(); }, 0);
  scrollTo(0, 0);
}
addEventListener("hashchange", showPage);
showPage();
boot().then(() => ($("#side").hidden = $("#dash").hidden));

// ---------- téléchargements en tâche de fond, résumés dans la barre latérale ----------
const JOB_LABELS = { kmJob: "FC au km", comJob: "Commentaires", kudJob: "Kudos", detJob: "Fiches détaillées" };
let jobsTimer = null;
function renderJobs(st) {
  const box = $("#jobs");
  const running = Object.entries(JOB_LABELS).filter(([k]) => st[k]?.running);
  box.innerHTML = running.map(([k, label]) => {
    const j = st[k], pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
    let wait = "";
    if (j.waitingUntil) {
      const w = new Date(j.waitingUntil), tomorrow = w.toDateString() !== new Date().toDateString();
      wait = ` · pause jusqu'à ${tomorrow ? "demain " : ""}${w.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return `<div class="job" title="Téléchargement depuis Strava, 1 requête par sortie">${label} <small>${j.done} / ${j.total}${wait}</small><div class="bar"><span style="width:${pct}%"></span></div></div>`;
  }).join("");
  clearTimeout(jobsTimer);
  if (running.length) jobsTimer = setTimeout(async () => renderJobs(await api("/api/status")), 15000);
}

// ---------- segments : tous les temps d'un segment ----------
let SEGS = new Map(), selSeg = null;
$("#detSegs").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-seg]");
  if (!tr || e.target.closest("a")) return;
  selSeg = +tr.dataset.seg === selSeg ? null : +tr.dataset.seg;
  $("#detSegs").querySelectorAll("tr[data-seg]").forEach((r) => r.classList.toggle("sel", +r.dataset.seg === selSeg));
  renderSegDetail();
});
function renderSegDetail() {
  const box = $("#segDetail");
  const s = selSeg && SEGS.get(selSeg);
  if (!s) { box.hidden = true; return; }
  box.hidden = false;
  const all = s.all.slice().sort((x, y) => x.a.date - y.a.date);
  box.innerHTML = `<h3 class="sub-title">${esc(s.name)} · ${all.length} passages · record ${fmtDuration(s.best.t)}</h3>`;
  box.appendChild(timeChart(all.map((p) => ({ date: p.a.date, t: p.t, a: p.a })), { height: 200 }));
}

// petit graphe « temps au fil des dates » : points + record en cours (ligne en escalier)
function timeChart(points, { height = 160, width = CW(600) } = {}) {
  const W = width, H = height, pad = { t: 12, r: 10, b: 22, l: 46 };
  const s = svg(W, H);
  if (!points.length) return s;
  const t0 = points[0].date.getTime(), t1 = Math.max(points.at(-1).date.getTime(), t0 + 86400000);
  const ts = points.map((p) => p.t);
  let lo = Math.min(...ts), hi = Math.max(...ts);
  const padY = (hi - lo) * 0.1 || 10; lo -= padY; hi += padY;
  const sx = (d) => pad.l + ((d - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const sy = (t) => pad.t + ((t - lo) / (hi - lo)) * (H - pad.t - pad.b);
  for (let k = 0; k <= 3; k++) {
    const v = lo + ((hi - lo) * k) / 3;
    el(s, "line", { x1: pad.l, x2: W - pad.r, y1: sy(v), y2: sy(v), class: k === 3 ? "base-line" : "grid-line" });
    el(s, "text", { x: pad.l - 6, y: sy(v) + 4, "text-anchor": "end" }, fmtDuration(v));
  }
  const y0 = new Date(t0).getFullYear(), y1 = new Date(t1).getFullYear();
  for (let y = y0 + 1; y <= y1; y++) el(s, "text", { x: sx(new Date(y, 0, 1)) + 2, y: H - 6 }, y);
  if (y0 === y1) { el(s, "text", { x: pad.l, y: H - 6 }, fmtDate(new Date(t0))); el(s, "text", { x: W - pad.r, y: H - 6, "text-anchor": "end" }, fmtDate(new Date(t1))); }
  let best = Infinity; const step = [];
  for (const p of points) { if (p.t < best) { if (step.length) step.push(`${sx(p.date)},${sy(best)}`); best = p.t; } step.push(`${sx(p.date)},${sy(best)}`); }
  step.push(`${sx(t1)},${sy(best)}`);
  el(s, "polyline", { points: step.join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 2 });
  for (const p of points) {
    const c = el(s, "circle", { cx: sx(p.date), cy: sy(p.t), r: 3.5, fill: "var(--series-1)", style: "cursor:pointer" });
    c.addEventListener("mousemove", (e) => showTip(e, `<b>${fmtDate(p.date)}</b>${fmtDuration(p.t)}<br>${esc(p.a.name)}`));
    c.addEventListener("mouseleave", hideTip);
    c.addEventListener("click", () => window.open(stravaLink(p.a), "_blank", "noopener"));
  }
  return s;
}

// ---------- progression des records ----------
function renderRecordProgress(covered) {
  const box = $("#detProg");
  const want = [["1K", "1 km"], ["5K", "5 km"], ["10K", "10 km"], ["Half-Marathon", "Semi-marathon"]];
  box.innerHTML = "";
  let any = false;
  for (const [k, label] of want) {
    // meilleur temps de chaque mois
    const months = new Map();
    for (const a of covered) for (const e of DETAILS[a.id].best) if (e.name === k) {
      const m = `${a.year}-${a.date.getMonth()}`;
      if (!months.has(m) || e.t < months.get(m).t) months.set(m, { date: a.date, t: e.t, a });
    }
    const pts = [...months.values()].sort((x, y) => x.date - y.date);
    if (pts.length < 2) continue;
    any = true;
    const div = document.createElement("div");
    div.className = "mini";
    const best = pts.reduce((b, p) => (p.t < b.t ? p : b));
    div.innerHTML = `<h3>${label}<span>record ${fmtDuration(best.t)} · ${fmtDate(best.date)}</span></h3>`;
    div.appendChild(timeChart(pts, { height: 170, width: CW(520) }));
    box.appendChild(div);
  }
  if (!any) box.innerHTML = '<p class="empty">Pas encore assez de fiches détaillées de course à pied sur cette période.</p>';
}

// ---------- temps estimés (Riegel) ----------
function renderPredictions() {
  const DIST = { "1K": 1000, "1 mile": 1609, "2 mile": 3219, "5K": 5000, "10K": 10000, "15K": 15000, "10 mile": 16093, "20K": 20000, "Half-Marathon": 21097, "30K": 30000, "Marathon": 42195 };
  const since = new Date(); since.setMonth(since.getMonth() - 6);
  const best = {};
  for (const a of ALL) {
    if (a.date < since || !DETAILS[a.id]?.best) continue;
    for (const e of DETAILS[a.id].best) if (DIST[e.name] && (!best[e.name] || e.t < best[e.name].t)) best[e.name] = { t: e.t, d: DIST[e.name], a };
  }
  const sources = Object.entries(best);
  const targets = [["5K", "5 km"], ["10K", "10 km"], ["Half-Marathon", "Semi-marathon"], ["Marathon", "Marathon"]];
  if (!sources.length) { $("#detPred").innerHTML = '<p class="empty">Pas encore de meilleurs efforts sur les 6 derniers mois.</p>'; return; }
  $("#detPred").innerHTML = targets.map(([k, label]) => {
    const D = DIST[k];
    // meilleure performance ramenée à la distance visée, à partir d'efforts d'au moins 1/3 de la distance
    // (un semi « lent » fait en trail ne doit pas cacher un 10 km rapide)
    const usable = sources.filter(([, s]) => s.d >= Math.max(1000, D / 3));
    if (!usable.length) return "";
    const pred = (s) => s.t * (D / s.d) ** 1.06;
    const [name, src] = usable.sort((x, y) => pred(x[1]) - pred(y[1]))[0];
    const t = pred(src);
    const real = best[k];
    return `<div class="kpi"><div class="l">${label}</div><div class="v">${fmtDuration(t)}</div>
      <div class="s">${fmtPace(t / (D / 1000))} /km · d'après ${dlink(src.a, EFFORTS.find((x) => x[0] === name)?.[1] || name)} en ${fmtDuration(src.t)}${real && name !== k ? ` · réalisé : ${fmtDuration(real.t)}` : ""}</div></div>`;
  }).join("");
}

// ---------- dérive cardiaque (découplage allure / FC) ----------
function renderDrift() {
  const g = FC_GROUPS[fcState.group];
  const box = $("#fcDrift"), kp = $("#fcDriftKpis");
  const since = new Date(fcState.since + "T00:00"), until = fcEnd();
  const rows = [];
  let irregular = 0;
  for (const a of ALL) {
    if (!g.sports.includes(a.sport) || a.date < since || a.date > until) continue;
    const sp = SPLITS?.[a.id]?.splits?.filter((s) => s.k > 1 && s.d >= 800 && s.t > 0 && s.hr > 0);
    if (!sp || sp.length < 7) continue;
    const dist = (s) => (g.pace && fcState.flat ? s.gd : s.d);
    const speeds = sp.map((s) => dist(s) / s.t);
    const m = speeds.reduce((x, y) => x + y, 0) / speeds.length;
    const cv = Math.sqrt(speeds.reduce((t, v) => t + (v - m) ** 2, 0) / speeds.length) / m;
    if (cv > (g.pace ? 0.1 : 0.15)) { irregular++; continue; }
    const half = Math.floor(sp.length / 2);
    const ef = (arr) => arr.reduce((t, s) => t + dist(s), 0) / arr.reduce((t, s) => t + s.t, 0) / (arr.reduce((t, s) => t + s.hr * s.t, 0) / arr.reduce((t, s) => t + s.t, 0));
    const d = (ef(sp.slice(0, half)) / ef(sp.slice(half)) - 1) * 100;
    rows.push({ a, d, km: sp.length + 1 });
  }
  if (rows.length < 3) {
    kp.innerHTML = "";
    box.innerHTML = `<p class="empty">${SPLITS ? "Pas assez de sorties régulières d'au moins 8 km sur cette période." : "Il faut le détail au km (voir plus haut)."}</p>`;
    return;
  }
  rows.sort((x, y) => x.a.date - y.a.date);
  const med = (arr) => median(arr.map((r) => r.d));
  const third = Math.max(1, Math.floor(rows.length / 3));
  const early = med(rows.slice(0, third)), late = med(rows.slice(-third));
  const good = rows.filter((r) => r.d < 5).length;
  kp.innerHTML = [
    ["Dérive habituelle", fmtNum(med(rows), 1) + " %", `médiane de ${rows.length} sorties${irregular ? ` (${irregular} irrégulières écartées)` : ""}`],
    ["Sorties sous 5 %", `${fmtNum((good / rows.length) * 100, 0)} %`, "endurance qui tient la distance"],
    ["Début → fin de période", `${fmtNum(early, 1)} → ${fmtNum(late, 1)} %`, late < early - 1 ? "ça s'améliore" : late > early + 1 ? "ça se dégrade" : "stable"],
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  const W = CW(), H = 260, pad = { t: 14, r: 16, b: 26, l: 44 };
  const s = svg(W, H);
  const t0 = rows[0].a.date.getTime(), t1 = Math.max(rows.at(-1).a.date.getTime(), t0 + 86400000);
  const ds = rows.map((r) => r.d);
  const lo = Math.min(-5, Math.floor(Math.min(...ds) / 5) * 5), hi = Math.max(15, Math.ceil(Math.max(...ds) / 5) * 5);
  const sx = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const sy = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  el(s, "rect", { x: pad.l, y: sy(5), width: W - pad.l - pad.r, height: sy(lo) - sy(5), fill: "var(--series-3)", opacity: 0.08 });
  for (let v = lo; v <= hi; v += 5) {
    el(s, "line", { x1: pad.l, x2: W - pad.r, y1: sy(v), y2: sy(v), class: v === 0 ? "base-line" : "grid-line" });
    el(s, "text", { x: pad.l - 6, y: sy(v) + 4, "text-anchor": "end" }, v + " %");
  }
  el(s, "text", { x: W - pad.r - 4, y: sy(5) + 14, "text-anchor": "end" }, "bonne endurance (< 5 %)");
  for (let d = new Date(new Date(t0).getFullYear(), new Date(t0).getMonth() + 1, 1); d.getTime() < t1; d.setMonth(d.getMonth() + 1))
    el(s, "text", { x: sx(d) + 2, y: H - 8 }, d.getMonth() === 0 ? String(d.getFullYear()) : MONTHS[d.getMonth()]);
  // moyenne glissante sur 5 sorties
  const roll = rows.map((r, i) => { const w = rows.slice(Math.max(0, i - 4), i + 1); return w.reduce((t, x) => t + x.d, 0) / w.length; });
  el(s, "polyline", { points: rows.map((r, i) => `${sx(r.a.date)},${sy(roll[i])}`).join(" "), fill: "none", stroke: "var(--series-2)", "stroke-width": 2.2, "stroke-linejoin": "round" });
  for (const r of rows) {
    const c = el(s, "circle", { cx: sx(r.a.date), cy: sy(Math.max(lo, Math.min(hi, r.d))), r: 2.5 + Math.min(4, r.km / 6), fill: "var(--series-1)", "fill-opacity": 0.75, stroke: "var(--surface-1)", "stroke-width": 1, style: "cursor:pointer" });
    c.addEventListener("mousemove", (e) => showTip(e, `<b>${esc(r.a.name)}</b>${fmtDate(r.a.date)} · ${fmtNum(r.a.distance / 1000, 1)} km<div class="row"><span>Dérive</span><span>${r.d > 0 ? "+" : ""}${fmtNum(r.d, 1)} %</span></div>`));
    c.addEventListener("mouseleave", hideTip);
    c.addEventListener("click", () => window.open(stravaLink(r.a), "_blank", "noopener"));
  }
  box.innerHTML = "";
  box.appendChild(s);
  const leg = document.createElement("div");
  leg.className = "legend";
  leg.innerHTML = `<span><i style="width:8px;height:8px;border-radius:50%;background:var(--series-1)"></i>une sortie (plus grosse = plus longue)</span><span><i style="background:var(--series-2)"></i>moyenne sur 5 sorties</span>`;
  box.appendChild(leg);
}

// ---------- objectif de l'année ----------
// un objectif de km par année (et par choix de sports), indépendant de la mesure affichée
// objectif de km de l'année en cours, pour un groupe de sports choisi dans le bloc (indépendant des filtres du haut)
const GOAL_SPORTS = {
  run: { label: "course à pied", sports: ["Run", "TrailRun", "VirtualRun"] },
  ride: { label: "vélo", sports: ["Ride", "GravelRide", "MountainBikeRide", "VirtualRide", "EBikeRide", "EMountainBikeRide"] },
  all: { label: "tous sports", sports: null },
};
let goalSport = (() => { try { return localStorage.getItem("goalSport") || "run"; } catch { return "run"; } })();
const inGoal = (a) => !GOAL_SPORTS[goalSport].sports || GOAL_SPORTS[goalSport].sports.includes(a.sport);
const goalKey = () => new Date().getFullYear() + "|km|" + goalSport;
function getGoals() { try { return JSON.parse(localStorage.getItem("goals") || "{}"); } catch { return {}; } }
function renderGoal() {
  const metric = METRICS.distance;
  const now = new Date(), y = now.getFullYear();
  const start = new Date(y, 0, 1), end = new Date(y + 1, 0, 1);
  const yearDays = (end - start) / 86400000, dayIdx = Math.floor((now - start) / 86400000) + 1;
  const acts = ALL.filter((a) => inGoal(a) && a.year === y);
  const prev = ALL.filter((a) => inGoal(a) && a.year === y - 1);
  const done = acts.reduce((t, a) => t + metric.val(a), 0);
  const lastYear = prev.reduce((t, a) => t + metric.val(a), 0);
  const goals = getGoals();
  // objectif par défaut : faire 10 % de mieux que l'an dernier
  const goal = goals[goalKey()] ?? Math.round((lastYear * 1.1 || done * (yearDays / dayIdx)) / 10) * 10;
  const unit = "km";
  $("#goalUnit").textContent = unit;
  if (document.activeElement !== $("#goalInput")) $("#goalInput").value = Math.round(goal);
  $("#goalTitle").textContent = STATIC ? `Km cumulés par année : ${GOAL_SPORTS[goalSport].label}` : `Objectif ${y} : km de ${GOAL_SPORTS[goalSport].label}`;
  document.querySelectorAll("#goalSport button").forEach((b) => b.classList.toggle("on", b.dataset.g === goalSport));
  const expected = goal * (dayIdx / yearDays);
  const proj = done * (yearDays / dayIdx);
  const pct = goal ? done / goal : 0;
  $("#goalFill").style.width = Math.min(100, pct * 100) + "%";
  $("#goalMark").style.left = Math.min(100, (dayIdx / yearDays) * 100) + "%";
  const diff = done - expected;
  const perDay = goal / yearDays;
  const remainWeeks = (yearDays - dayIdx) / 7;
  const need = Math.max(0, goal - done) / Math.max(1, remainWeeks);
  $("#goalKpis").innerHTML = [
    ["Fait", metric.fmt(done), `${fmtNum(pct * 100, 0)} % de ${metric.fmt(goal)}`],
    [diff >= 0 ? "En avance" : "En retard", metric.fmt(Math.abs(diff)), `soit ${fmtNum(Math.abs(diff) / perDay, 0)} jours ${diff >= 0 ? "d'avance" : "de retard"}`],
    ["Projection au 31 déc.", metric.fmt(proj), proj >= goal ? "objectif atteint à ce rythme" : `il manquerait ${metric.fmt(goal - proj)}`],
    ["Il faut", metric.fmt(need) + " / sem.", done >= goal ? "objectif déjà atteint" : `pendant les ${fmtNum(remainWeeks, 0)} semaines restantes`],
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  // courbe : cette année, l'objectif en ligne droite, l'an dernier en pointillés
  const W = STATIC ? CW() : CW(520), H = STATIC ? 280 : 200, pad = { t: 10, r: 10, b: 22, l: 44 }; // site public : graphe seul, en pleine largeur
  const s = svg(W, H);
  const cum = (list, yy) => { const arr = new Float64Array(366); for (const a of list) arr[Math.floor((a.date - new Date(yy, 0, 1)) / 86400000)] += metric.val(a); for (let i = 1; i < 366; i++) arr[i] += arr[i - 1]; return arr; };
  const cy = cum(acts, y), cp = cum(prev, y - 1);
  // site public : toutes les années disponibles, l'année en cours en couleur principale
  const others = STATIC ? [...new Set(ALL.filter(inGoal).map((a) => a.year))].filter((yy) => yy !== y).sort((a, b) => b - a) : [];
  const otherCum = others.map((yy, i) => ({ yy, arr: cum(ALL.filter((a) => inGoal(a) && a.year === yy), yy), color: i < 7 ? `var(--series-${[1, 3, 4, 5, 6, 7, 8][i]})` : "var(--other)" })); // pas series-2 : trop proche de l'orange de l'année en cours
  const max = niceMax(Math.max(STATIC ? 0 : goal, cp[365], cy[dayIdx - 1], ...otherCum.map((o) => o.arr[365])));
  yAxis(s, W, H, pad, max);
  const sx = (i) => pad.l + (i / 365) * (W - pad.l - pad.r), sy = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  [0, 3, 6, 9].forEach((m) => el(s, "text", { x: sx(Math.floor((new Date(y, m, 1) - start) / 86400000)) + 2, y: H - 6 }, MONTHS[m]));
  if (!STATIC) el(s, "line", { x1: sx(0), y1: sy(0), x2: sx(365), y2: sy(goal), stroke: "var(--axis)", "stroke-width": 1.5, "stroke-dasharray": "5 4" });
  const line = (arr, n, attrs) => { const p = []; for (let i = 0; i < n; i += 2) p.push(`${sx(i).toFixed(1)},${sy(arr[i]).toFixed(1)}`); p.push(`${sx(n - 1)},${sy(arr[n - 1])}`); el(s, "polyline", { points: p.join(" "), fill: "none", ...attrs }); };
  if (STATIC) [...otherCum].reverse().forEach((o, i) => line(o.arr, 366, { stroke: o.color, "stroke-width": o.yy === y - 1 ? 2 : 1.4, "stroke-opacity": o.yy === y - 1 ? 1 : 0.8 }));
  else if (prev.length) line(cp, 366, { stroke: "var(--other)", "stroke-width": 1.5 });
  line(cy, dayIdx, { stroke: "var(--accent)", "stroke-width": 2.5, "stroke-linejoin": "round" });
  el(s, "circle", { cx: sx(dayIdx - 1), cy: sy(cy[dayIdx - 1]), r: 4.5, fill: "var(--accent)", stroke: "var(--surface-1)", "stroke-width": 2 });
  $("#goalChart").innerHTML = "";
  $("#goalChart").appendChild(s);
  const leg = document.createElement("div");
  leg.className = "legend";
  if (STATIC) leg.innerHTML = `<span><i style="background:var(--accent);height:3px"></i>${y} (${metric.fmt(done)})</span>` + otherCum.map((o) => `<span><i style="background:${o.color}"></i>${o.yy} (${metric.fmt(o.arr[365])})</span>`).join("");
  else leg.innerHTML = `<span><i style="background:var(--accent);height:3px"></i>${y}</span>${prev.length ? `<span><i style="background:var(--other)"></i>${y - 1} (${metric.fmt(lastYear)})</span>` : ""}${STATIC ? "" : `<span><i style="background:var(--axis)"></i>rythme de l'objectif</span>`}`;
  $("#goalChart").appendChild(leg);
}
$("#goalSport").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  goalSport = b.dataset.g;
  try { localStorage.setItem("goalSport", goalSport); } catch {}
  $("#goalInput").blur();
  renderGoal();
});
$("#goalInput").addEventListener("change", (e) => {
  const v = +e.target.value;
  const g = getGoals();
  if (v > 0) g[goalKey()] = v; else delete g[goalKey()];
  try { localStorage.setItem("goals", JSON.stringify(g)); } catch {}
  renderGoal();
});

// ---------- mode d'affichage de la carte ----------
let mapMode = "sport";
$("#mapMode").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  mapMode = b.dataset.mode;
  e.currentTarget.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  const keep = mapKey;
  renderMap(filtered());
  mapKey = keep;
});

// ---------- exploration : cases d'environ 1 km, sortie la plus lointaine ----------
function renderExplore(list, home) {
  const cellOf = (p) => `${Math.floor(p[0] * 90)},${Math.floor(p[1] * 64)}`; // ≈ 1,2 km × 1,1 km sous nos latitudes
  const firstYear = new Map();
  let far = null;
  for (const a of list) {
    const pts = decoded.get(a.id) || (TRACKS?.[a.id] ? decodePolyline(TRACKS[a.id]) : null);
    if (!pts) continue;
    if (!decoded.has(a.id)) decoded.set(a.id, pts);
    for (let i = 0; i < pts.length; i += 2) {
      const c = cellOf(pts[i]);
      const fy = firstYear.get(c);
      if (fy == null || a.year < fy) firstYear.set(c, a.year);
      if (home) { const d = distM(home.c, pts[i]); if (!far || d > far.d) far = { d, a }; }
    }
  }
  const byYear = {};
  for (const y of firstYear.values()) byYear[y] = (byYear[y] || 0) + 1;
  const years = Object.keys(byYear).sort();
  const thisY = new Date().getFullYear();
  const bestY = years.reduce((b, y) => (!b || byYear[y] > byYear[b] ? y : b), null);
  $("#exploreKpis").innerHTML = [
    ["Cases explorées", fmtNum(firstYear.size), `≈ ${fmtNum(firstYear.size * 1.3, 0)} km² parcourus`],
    [`Nouvelles en ${thisY}`, fmtNum(byYear[thisY] || 0), "jamais visitées avant"],
    ["Année la plus exploratrice", bestY || "–", bestY ? `${fmtNum(byYear[bestY])} nouvelles cases` : ""],
    ["Le plus loin de ton lieu n°1", far ? fmtNum(far.d / 1000, 0) + " km" : "–", far ? `${dlink(far.a, esc(far.a.name))} · ${fmtDate(far.a.date)}` : ""],
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
  // nouvelles cases par année
  const box = $("#exploreYears");
  box.innerHTML = "";
  if (years.length < 2) return;
  const W = CW(), H = 170, pad = { t: 10, r: 10, b: 24, l: 44 };
  const s = svg(W, H);
  const max = niceMax(Math.max(...years.map((y) => byYear[y])));
  yAxis(s, W, H, pad, max);
  const slot = (W - pad.l - pad.r) / years.length;
  years.forEach((y, i) => {
    const h = (byYear[y] / max) * (H - pad.t - pad.b);
    const x = pad.l + i * slot + slot * 0.2;
    const r = el(s, "rect", { x, y: H - pad.b - h, width: slot * 0.6, height: h, rx: 3, fill: +y === thisY ? "var(--accent)" : "var(--series-1)" });
    r.addEventListener("mousemove", (e) => showTip(e, `<b>${y}</b>${fmtNum(byYear[y])} nouvelles cases`));
    r.addEventListener("mouseleave", hideTip);
    el(s, "text", { x: x + slot * 0.3, y: H - 8, "text-anchor": "middle" }, y);
  });
  box.appendChild(s);
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = "Nouvelles cases découvertes chaque année : une année haute = beaucoup de nouveaux coins.";
  box.appendChild(p);
}

// ---------- ce qui fait des kudos ----------
function renderKudosFactors(list) {
  const box = $("#kudFactors");
  const acts = list.filter((a) => a.kudos != null);
  if (acts.length < 10) { box.innerHTML = '<p class="empty">Pas assez de sorties sur cette période.</p>'; return; }
  const groupBy = (title, keyOf, order) => {
    const m = new Map();
    for (const a of acts) { const k = keyOf(a); if (k == null) continue; const r = m.get(k) || { n: 0, k: 0 }; r.n++; r.k += a.kudos; m.set(k, r); }
    let rows = [...m.entries()].filter(([, r]) => r.n >= 3);
    rows = order ? order.filter((k) => m.has(k) && m.get(k).n >= 3).map((k) => [k, m.get(k)]) : rows.sort((x, y) => y[1].k / y[1].n - x[1].k / x[1].n).slice(0, 6);
    if (rows.length < 2) return "";
    const max = Math.max(...rows.map(([, r]) => r.k / r.n));
    return `<div class="factor"><h3>${title}</h3>` + rows.map(([k, r]) => `<div class="hbar"><span>${esc(k)}</span>
      <div class="track"><div class="fill" style="width:${(r.k / r.n / max) * 100}%;background:var(--series-2)"></div></div>
      <span class="val">${fmtNum(r.k / r.n, 1)} <small>(${r.n})</small></span></div>`).join("") + `</div>`;
  };
  const distBucket = (a) => { const km = a.distance / 1000; return !km ? "sans distance" : km < 5 ? "< 5 km" : km < 10 ? "5 – 10 km" : km < 20 ? "10 – 20 km" : km < 50 ? "20 – 50 km" : km < 100 ? "50 – 100 km" : "100 km et +"; };
  const moment = (a) => (a.hour < 10 ? "matin" : a.hour < 14 ? "midi" : a.hour < 18 ? "après-midi" : "soir");
  const DAYS_LONG = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const det = (a) => DETAILS?.[a.id] && !DETAILS[a.id].missing ? DETAILS[a.id] : null;
  box.innerHTML = [
    groupBy("Par sport", (a) => sportName(a.sport)),
    groupBy("Par distance", distBucket, ["< 5 km", "5 – 10 km", "10 – 20 km", "20 – 50 km", "50 – 100 km", "100 km et +"]),
    groupBy("Par moment de départ", moment, ["matin", "midi", "après-midi", "soir"]),
    groupBy("Par jour", (a) => DAYS_LONG[a.dow], DAYS_LONG),
    groupBy("Seul ou en groupe", (a) => (a.athletes == null ? null : a.athletes > 1 ? "en groupe" : "seul"), ["seul", "en groupe"]),
    groupBy("Avec ou sans photo", (a) => (det(a) ? (det(a).photos ? "avec photo" : "sans photo") : null), ["sans photo", "avec photo"]),
    groupBy("Record battu", (a) => (a.prs ? "avec record" : "sans record"), ["sans record", "avec record"]),
  ].join("") + `<p class="muted" style="grid-column:1/-1">Entre parenthèses : nombre de sorties. Les photos ne sont connues que pour les sorties dont la fiche détaillée est téléchargée.</p>`;
}

// ---------- évolution de la communauté ----------
function renderCommunity() {
  const acts = ALL.filter(bySport);
  const years = {};
  const firstSeen = new Map();
  for (const a of acts.slice().sort((x, y) => x.date - y.date)) {
    const r = (years[a.year] ||= { n: 0, kudos: 0, com: 0, kudoers: new Set(), commenters: new Set(), covered: 0, withKudos: 0, newPeople: 0 });
    r.n++; r.kudos += a.kudos || 0; r.com += a.comments || 0;
    if (a.kudos > 0) r.withKudos++;
    const kl = KUDOS?.[a.id]?.list;
    if (kl) { r.covered++; for (const w of kl) { r.kudoers.add(w); if (!firstSeen.has(w)) { firstSeen.set(w, a.year); r.newPeople++; } } }
    for (const c of COMMENTS?.[a.id]?.list || []) if (!isMe(c)) r.commenters.add(c.who);
  }
  const ys = Object.keys(years).sort((a, b) => b - a);
  if (!ys.length) { $("#community").innerHTML = '<p class="empty">Rien à afficher.</p>'; return; }
  const maxK = Math.max(...ys.map((y) => years[y].kudos / years[y].n));
  $("#community").innerHTML = `<table><thead><tr><th class="l">Année</th><th>Sorties</th><th class="l">Kudos par sortie</th><th>Commentaires</th><th>Personnes qui ont kudosé</th><th>Nouvelles têtes</th><th>Commentateurs</th></tr></thead><tbody>` +
    ys.map((y) => {
      const r = years[y];
      const cov = r.withKudos ? r.covered / r.withKudos : 1;
      const partial = cov < 0.98 ? ` <span class="muted" title="kudos téléchargés pour ${fmtNum(cov * 100, 0)} % des sorties de l'année">(${fmtNum(cov * 100, 0)} %)</span>` : "";
      return `<tr><td class="l"><b>${y}</b></td><td>${r.n}</td>
        <td class="l">${fmtNum(r.kudos / r.n, 1)}<span class="share"><span style="width:${(r.kudos / r.n / maxK) * 100}%;background:var(--series-2)"></span></span></td>
        <td>${r.com}</td><td>${r.covered ? fmtNum(r.kudoers.size) + partial : "–"}</td><td>${r.covered ? fmtNum(r.newPeople) : "–"}</td><td>${r.commenters.size || "–"}</td></tr>`;
    }).join("") + `</tbody></table><p class="muted">« Nouvelles têtes » : personnes qui te mettent un kudo pour la première fois. Le pourcentage entre parenthèses indique la part des kudos de l'année déjà téléchargée.</p>`;
}
// ---------- comparer deux périodes ----------
const cmpState = { a: null, b: null };
function cmpPreset(kind) {
  const now = new Date(), d = (x) => dayKey(x);
  const y = now.getFullYear(), m = now.getMonth(), day = now.getDate();
  switch (kind) {
    case "ytd": return [[d(new Date(y, 0, 1)), d(now)], [d(new Date(y - 1, 0, 1)), d(new Date(y - 1, m, day))]];
    case "12m": return [[d(new Date(y - 1, m, day + 1)), d(now)], [d(new Date(y - 2, m, day + 1)), d(new Date(y - 1, m, day))]];
    case "years": return [[d(new Date(y - 1, 0, 1)), d(new Date(y - 1, 11, 31))], [d(new Date(y - 2, 0, 1)), d(new Date(y - 2, 11, 31))]];
    case "month": return [[d(new Date(y, m, 1)), d(now)], [d(new Date(y, m - 1, 1)), d(new Date(y, m - 1, Math.min(day, new Date(y, m, 0).getDate())))]];
  }
}
function applyCmpPreset(kind) {
  const [a, b] = cmpPreset(kind);
  cmpState.a = a; cmpState.b = b;
  $("#cmpA1").value = a[0]; $("#cmpA2").value = a[1]; $("#cmpB1").value = b[0]; $("#cmpB2").value = b[1];
}
function renderCompare() {
  if (!cmpState.a) applyCmpPreset("ytd");
  const range = ([f, t]) => [new Date(f + "T00:00"), new Date(t + "T23:59:59")];
  const [a0, a1] = range(cmpState.a), [b0, b1] = range(cmpState.b);
  const A = ALL.filter((x) => bySport(x) && x.date >= a0 && x.date <= a1), B = ALL.filter((x) => bySport(x) && x.date >= b0 && x.date <= b1);
  const weeks = (f, t) => Math.max(1, (t - f) / (7 * 86400000));
  const sum = (L, f) => L.reduce((t, x) => t + f(x), 0);
  const runs = (L) => L.filter((x) => PACE_SPORTS.has(x.sport) && x.sport !== "Walk" && x.sport !== "Hike" && x.distance > 0);
  const pace = (L) => { const r = runs(L); const d = sum(r, (x) => x.distance); return d ? sum(r, (x) => x.moving_time) / (d / 1000) : null; };
  const hr = (L) => { const r = L.filter((x) => x.avg_hr); const t = sum(r, (x) => x.moving_time); return t ? sum(r, (x) => x.avg_hr * x.moving_time) / t : null; };
  const days = (L) => new Set(L.map((x) => x.day)).size;
  const longest = (L) => L.reduce((m, x) => Math.max(m, x.distance), 0) / 1000;
  const rows = [
    ["Activités", A.length, B.length, (v) => fmtNum(v)],
    ["Distance", sum(A, (x) => x.distance) / 1000, sum(B, (x) => x.distance) / 1000, (v) => fmtNum(v, 0) + " km"],
    ["Temps en mouvement", sum(A, (x) => x.moving_time) / 3600, sum(B, (x) => x.moving_time) / 3600, fmtHours],
    ["Dénivelé +", sum(A, (x) => x.elevation || 0), sum(B, (x) => x.elevation || 0), (v) => fmtNum(v, 0) + " m"],
    ["Jours actifs", days(A), days(B), (v) => fmtNum(v)],
    ["Distance par semaine", sum(A, (x) => x.distance) / 1000 / weeks(a0, a1), sum(B, (x) => x.distance) / 1000 / weeks(b0, b1), (v) => fmtNum(v, 1) + " km"],
    ["Plus longue sortie", longest(A), longest(B), (v) => fmtNum(v, 1) + " km"],
    ["Allure moyenne en course", pace(A), pace(B), (v) => fmtPace(v) + " /km", true],
    ["FC moyenne", hr(A), hr(B), (v) => fmtNum(v, 0) + " bpm", true],
    ["Kudos par sortie", A.length ? sum(A, (x) => x.kudos || 0) / A.length : null, B.length ? sum(B, (x) => x.kudos || 0) / B.length : null, (v) => fmtNum(v, 1)],
  ];
  const lbl = (r) => `${fmtDate(new Date(r[0] + "T00:00"))} → ${fmtDate(new Date(r[1] + "T00:00"))}`;
  $("#cmpTable").innerHTML = `<table><thead><tr><th class="l"></th><th>A · ${lbl(cmpState.a)}</th><th>B · ${lbl(cmpState.b)}</th><th>Écart</th></tr></thead><tbody>` +
    rows.map(([name, va, vb, f, lowerIsBetter]) => {
      if (va == null && vb == null) return "";
      let delta = "–";
      if (va != null && vb) {
        const p = ((va - vb) / vb) * 100;
        const good = lowerIsBetter ? p < 0 : p > 0;
        delta = Math.abs(p) < 0.5 ? '<span class="muted">=</span>' : `<span class="delta ${good ? "up" : "down"}">${p > 0 ? "▲" : "▼"} ${fmtNum(Math.abs(p), 0)} %</span>`;
      }
      return `<tr><td class="l"><b>${name}</b></td><td>${va == null ? "–" : f(va)}</td><td>${vb == null ? "–" : f(vb)}</td><td>${delta}</td></tr>`;
    }).join("") + `</tbody></table><p class="muted">Pour l'allure et la FC, une baisse est en vert. Les sports suivent le filtre du haut.</p>`;

  // par sport
  const bySp = {};
  for (const x of A) (bySp[x.sport] ||= [0, 0])[0] += x.distance / 1000;
  for (const x of B) (bySp[x.sport] ||= [0, 0])[1] += x.distance / 1000;
  const sp = Object.entries(bySp).filter(([, v]) => v[0] + v[1] > 1).sort((x, y) => y[1][0] + y[1][1] - x[1][0] - x[1][1]);
  const mx = Math.max(1, ...sp.flatMap(([, v]) => v));
  $("#cmpSports").innerHTML = sp.map(([s, [va, vb]]) => `<div class="cmp-row"><span><i class="dot" style="background:${SPORT_COLOR[s]}"></i> ${esc(sportName(s))}</span>
    <div class="cmp-bars"><div><span style="width:${(va / mx) * 100}%;background:var(--accent)"></span><b>${fmtNum(va, 0)} km</b></div><div><span style="width:${(vb / mx) * 100}%;background:var(--other)"></span><b>${fmtNum(vb, 0)} km</b></div></div></div>`).join("") ||
    '<p class="empty">Rien sur ces périodes.</p>';

  // cumul jour après jour depuis le début de chaque période
  const len = Math.max(Math.round((a1 - a0) / 86400000), Math.round((b1 - b0) / 86400000)) + 1;
  const cum = (L, f0, f1) => { const n = Math.round((f1 - f0) / 86400000) + 1, arr = new Float64Array(n); for (const x of L) arr[Math.floor((x.date - f0) / 86400000)] += x.distance / 1000; for (let i = 1; i < n; i++) arr[i] += arr[i - 1]; return arr; };
  const ca = cum(A, a0, a1), cb = cum(B, b0, b1);
  const W = CW(), H = 260, pad = { t: 10, r: 60, b: 24, l: 52 };
  const s = svg(W, H);
  const max = niceMax(Math.max(ca.at(-1) || 0, cb.at(-1) || 0));
  yAxis(s, W, H, pad, max);
  const sx = (i) => pad.l + (i / Math.max(1, len - 1)) * (W - pad.l - pad.r), sy = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const draw = (arr, col, w, label) => {
    const p = []; const step = arr.length > 500 ? 2 : 1;
    for (let i = 0; i < arr.length; i += step) p.push(`${sx(i).toFixed(1)},${sy(arr[i]).toFixed(1)}`);
    p.push(`${sx(arr.length - 1)},${sy(arr.at(-1))}`);
    el(s, "polyline", { points: p.join(" "), fill: "none", stroke: col, "stroke-width": w, "stroke-linejoin": "round" });
    el(s, "text", { x: sx(arr.length - 1) + 6, y: sy(arr.at(-1)) + 4, style: "fill:var(--text-secondary);font-weight:600" }, label);
  };
  draw(cb, "var(--other)", 2, "B");
  draw(ca, "var(--accent)", 2.6, "A");
  for (let k = 0; k <= 4; k++) { const i = Math.round((k / 4) * (len - 1)); el(s, "text", { x: sx(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === 4 ? "end" : "middle" }, `jour ${i + 1}`); }
  const hit = el(s, "rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, class: "hit" });
  hit.addEventListener("mousemove", (e) => {
    const r = s.getBoundingClientRect();
    const i = Math.max(0, Math.min(len - 1, Math.round(((((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r)) * (len - 1))));
    const va = ca[Math.min(i, ca.length - 1)], vb = cb[Math.min(i, cb.length - 1)];
    showTip(e, `<b>Jour ${i + 1}</b><div class="row"><span>A</span><span>${fmtNum(va, 0)} km</span></div><div class="row"><span>B</span><span>${fmtNum(vb, 0)} km</span></div><div class="row"><span>Écart</span><span>${va - vb >= 0 ? "+" : ""}${fmtNum(va - vb, 0)} km</span></div>`);
  });
  hit.addEventListener("mouseleave", hideTip);
  $("#cmpChart").innerHTML = "";
  $("#cmpChart").appendChild(s);
}
$("#cmpPreset").addEventListener("change", (e) => { if (e.target.value) { applyCmpPreset(e.target.value); renderCompare(); } });
for (const id of ["#cmpA1", "#cmpA2", "#cmpB1", "#cmpB2"]) $(id).addEventListener("change", () => {
  const v = (x) => $(x).value;
  if (!v("#cmpA1") || !v("#cmpA2") || !v("#cmpB1") || !v("#cmpB2")) return;
  cmpState.a = [v("#cmpA1"), v("#cmpA2")].sort(); cmpState.b = [v("#cmpB1"), v("#cmpB2")].sort();
  $("#cmpPreset").value = "";
  renderCompare();
});

// ---------- bilan de l'année ----------
let bilanYear = null;
const bilanGeoTried = new Set();
function renderBilan() {
  const years = [...new Set(ALL.map((a) => a.year))].sort((a, b) => b - a);
  if (!bilanYear) bilanYear = years[0];
  const sel = $("#bilanYear");
  if (sel.options.length !== years.length) sel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
  sel.value = bilanYear;
  const y = +bilanYear;
  const L = ALL.filter((a) => a.year === y), P = ALL.filter((a) => a.year === y - 1);
  if (!L.length) { $("#bilan").innerHTML = '<p class="empty">Aucune sortie cette année-là.</p>'; return; }
  const sum = (X, f) => X.reduce((t, a) => t + f(a), 0);
  const km = sum(L, (a) => a.distance) / 1000, kmP = sum(P, (a) => a.distance) / 1000;
  const hours = sum(L, (a) => a.moving_time) / 3600, dplus = sum(L, (a) => a.elevation || 0);
  const dset = [...new Set(L.map((a) => a.day))].sort();
  let best = 0, cur = 0, prev = null;
  for (const d of dset) { const t = new Date(d + "T12:00").getTime(); cur = prev != null && Math.round((t - prev) / 86400000) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = t; }
  const months = Array(12).fill(0);
  for (const a of L) months[a.date.getMonth()] += a.distance / 1000;
  const bm = months.indexOf(Math.max(...months));
  const spc = {};
  for (const a of L) spc[a.sport] = (spc[a.sport] || 0) + a.moving_time;
  const topSports = Object.entries(spc).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const top = (f) => L.reduce((b, a) => (!b || f(a) > f(b) ? a : b), null);
  const longest = top((a) => a.distance), highest = top((a) => a.elevation || 0), loved = top((a) => a.kudos || 0);
  // records de l'année (meilleurs efforts)
  const recs = {};
  for (const a of L) for (const e of DETAILS?.[a.id]?.best || []) if (["5K", "10K", "Half-Marathon"].includes(e.name) && (!recs[e.name] || e.t < recs[e.name].t)) recs[e.name] = { t: e.t, a, d: e.d };
  // un « meilleur temps » plus lent que 6 min/km vient d'une sortie tranquille ou d'un trail : pas un vrai repère
  for (const k of Object.keys(recs)) if (recs[k].t / (recs[k].d / 1000) > 360) delete recs[k];
  // qui
  const kud = new Map();
  for (const a of L) for (const w of KUDOS?.[a.id]?.list || []) kud.set(w, (kud.get(w) || 0) + 1);
  const topKud = [...kud.entries()].sort((a, b) => b[1] - a[1])[0];
  const com = new Map();
  for (const a of L) for (const c of COMMENTS?.[a.id]?.list || []) if (!isMe(c)) com.set(c.who, (com.get(c.who) || 0) + 1);
  const topCom = [...com.entries()].sort((a, b) => b[1] - a[1])[0];
  const { places } = document.body.classList.contains("nogps") ? { places: [] } : clusterPlaces(L);
  const home = places[0] ? geoCache[geoId(places[0].c)] : null;
  // adresse pas encore connue : on la cherche une fois, puis on redessine
  if (places[0] && !home && !bilanGeoTried.has(geoId(places[0].c))) {
    bilanGeoTried.add(geoId(places[0].c));
    geocode(places[0].c).then((t) => t && renderBilan());
  }
  const evol = kmP ? ((km - kmP) / kmP) * 100 : null;
  const tile = (big, label, sub = "", cls = "") => `<div class="b-tile ${cls}"><div class="b-label">${label}</div><div class="b-big">${big}</div>${sub ? `<div class="b-sub">${sub}</div>` : ""}</div>`;
  const earth = km / 40075;
  $("#bilan").innerHTML = `
    <div class="b-hero"><div class="b-label">Mon année ${y}</div><div class="b-huge">${fmtNum(km, 0)} km</div>
      <div class="b-sub">${fmtNum(L.length)} sorties · ${fmtHours(hours)} · ${fmtNum(dplus, 0)} m de D+${evol != null ? ` · ${evol >= 0 ? "+" : ""}${fmtNum(evol, 0)} % par rapport à ${y - 1}` : ""}</div></div>
    <div class="b-grid">
      ${tile(fmtNum(dset.length), "jours actifs", `soit ${fmtNum((dset.length / 365) * 100, 0)} % des jours de l'année`)}
      ${tile(best + " j", "plus longue série", "de jours d'affilée avec une sortie")}
      ${tile(MONTHS[bm], "mois le plus chargé", `${fmtNum(months[bm], 0)} km`)}
      ${tile(fmtNum(dplus / 8849, 1) + " ×", "l'Everest", `en montée cumulée`)}
      ${tile(earth >= 0.1 ? fmtNum(earth * 100, 0) + " %" : fmtNum(km / 775, 1) + " ×", earth >= 0.1 ? "du tour de la Terre" : "Paris – Marseille", "")}
      ${tile(topSports.map(([s]) => esc(sportName(s))).join(" · "), "sports favoris", "par temps passé", "b-text")}
      ${tile(longest ? fmtNum(longest.distance / 1000, 1) + " km" : "–", "sortie la plus longue", longest ? `${dlink(longest, esc(longest.name))} · ${fmtDate(longest.date)}` : "")}
      ${tile(highest?.elevation ? fmtNum(highest.elevation, 0) + " m" : "–", "plus gros dénivelé", highest?.elevation ? `${dlink(highest, esc(highest.name))} · ${fmtDate(highest.date)}` : "")}
      ${tile(loved?.kudos ? loved.kudos + " kudos" : "–", "sortie la plus aimée", loved?.kudos ? `${dlink(loved, esc(loved.name))}` : "")}
      ${Object.keys(recs).length ? tile(Object.entries(recs).map(([k, r]) => `${{ "5K": "5 km", "10K": "10 km", "Half-Marathon": "semi" }[k]} ${fmtDuration(r.t)}`).join("<br>"), "meilleurs temps", "en course à pied", "b-text") : ""}
      ${home ? tile(esc(home.split(",")[0]), "point de départ n°1", `${places[0].acts.size} sorties`, "b-text") : ""}
      ${topKud ? tile(esc(topKud[0]), "fan n°1", `${topKud[1]} kudos`, "b-text") : ""}
      ${topCom ? tile(esc(topCom[0]), "commentateur n°1", `${topCom[1]} commentaires`, "b-text") : ""}
    </div>`;
}
$("#bilanYear").addEventListener("change", (e) => { bilanYear = +e.target.value; renderBilan(); });
$("#bilanPrint").addEventListener("click", () => window.print());

// ---------- site public : textes neutres (le site s'adresse à des visiteurs, pas au propriétaire) ----------
function neutralTexts(firstname) {
  const who = firstname || "l'athlète";
  const rules = [
    [/^Quand je sors$/, "Jours et heures de sortie"],
    [/^Mes sorties marquantes$/, "Sorties marquantes"],
    [/^Toutes mes activités$/, "Toutes les activités"],
    [/^Évolution de ma FC/, "Évolution de la FC"],
    [/^Mes records en course à pied$/, "Records en course à pied"],
    [/^Mes tops 10 sur les segments$/, "Tops 10 sur les segments"],
    [/^Évolution de ma communauté$/, "Évolution de la communauté"],
    [/^Le plus loin de ton lieu n°1$/, "Sortie la plus lointaine"],
    [/^Mon année (\d{4})$/, `${who} en $1`],
    [/^Part de mes sorties$/, "Part des sorties"],
    [/^Carte de mes activités$/, "Carte des activités"],
    [/^médiane, moi compris$/, "médiane, athlète compris"],
  ];
  const fix = (node) => {
    const t = node.nodeValue, s = t.trim();
    if (!s) return;
    for (const [re, rep] of rules) if (re.test(s)) { node.nodeValue = t.replace(s, s.replace(re, rep)); return; }
  };
  const walk = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) fix(n);
  };
  walk(document.body);
  // les blocs sont redessinés à chaque changement de filtre : on repasse sur ce qui arrive
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) n.nodeType === 3 ? fix(n) : n.nodeType === 1 && walk(n);
  }).observe(document.body, { childList: true, subtree: true });
}

// ---------- zones d'entraînement ----------
// Référence : échelle d'intensité d'Olympiatoppen (I-scale, version 2 de 2024, tableau 1), en % de la FC max.
// Les allures de chaque zone viennent des données réelles : FC médiane de chaque km selon son allure à plat équivalente.
const ZONES = [
  { name: "Très facile", lo: 0.55, hi: 0.72 },
  { name: "Facile", lo: 0.72, hi: 0.82 },
  { name: "Tempo", lo: 0.82, hi: 0.87 },
  { name: "Seuil", lo: 0.87, hi: 0.92 },
  { name: "VO2max", lo: 0.92, hi: 1.0 },
];
const ROAD = ["Run", "VirtualRun"];
const hhmm = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}` : `${Math.round(s / 60)} min`);

// fenêtre de référence : les 12 derniers mois avant la fin de la période du bloc FC (24, puis tout, s'il manque des données)
function zoneWindow(fam) {
  const end = fcEnd();
  const back = (m) => { const d = new Date(end); d.setMonth(d.getMonth() - m); return d; };
  for (const m of [12, 24, null]) {
    const list = ALL.filter((a) => fam.includes(a.sport) && a.date <= end && (m == null || a.date >= back(m)));
    if (list.filter((a) => a.max_hr).length >= 10 || m == null) return { list, months: m };
  }
}
// courbe FC selon l'allure, km par km : médiane par tranche de 5 s/km, rendue décroissante (moyennes adjacentes regroupées)
function hrPaceCurve(list) {
  const bins = new Map();
  for (const a of list) {
    if (!ROAD.includes(a.sport)) continue;
    for (const s of SPLITS?.[a.id]?.splits || []) {
      if (s.k === 1 || s.d < 800 || !s.hr || !s.gd) continue; // 1er km : la FC n'est pas encore montée
      const p = (s.t / s.gd) * 1000;
      if (p < 150 || p > 480) continue;
      const b = Math.floor(p / 5) * 5;
      if (!bins.has(b)) bins.set(b, []);
      bins.get(b).push(s.hr);
    }
  }
  const pts = [...bins].filter(([, v]) => v.length >= 4).sort((x, y) => x[0] - y[0])
    .map(([b, v]) => { v.sort((x, y) => x - y); return { p: b + 2.5, hr: v[Math.floor(v.length / 2)], n: v.length }; });
  // plus on va lentement, plus la FC baisse : on lisse les inversions dues au bruit (régression isotone)
  const blocks = pts.map((q) => ({ w: q.n, v: q.hr, items: [q] }));
  for (let i = 0; i < blocks.length - 1;) {
    if (blocks[i].v < blocks[i + 1].v) {
      const a = blocks[i], b = blocks[i + 1], w = a.w + b.w;
      blocks.splice(i, 2, { w, v: (a.v * a.w + b.v * b.w) / w, items: [...a.items, ...b.items] });
      if (i) i--;
    } else i++;
  }
  const fit = blocks.flatMap((b) => b.items.map((q) => ({ ...q, fit: b.v })));
  return { pts, fit, km: pts.reduce((t, q) => t + q.n, 0) };
}
// allure à laquelle la FC réelle atteint une valeur donnée (interpolation sur la courbe lissée)
function paceAtHr(fit, h) {
  for (let i = 0; i < fit.length - 1; i++) {
    const a = fit[i], b = fit[i + 1];
    if (a.fit >= h && b.fit <= h && a.fit !== b.fit) return a.p + ((a.fit - h) / (a.fit - b.fit)) * (b.p - a.p);
  }
  return null;
}
function estimateZones(group) {
  const fam = group === "ride" ? FC_GROUPS.ride.sports : [...FC_GROUPS.run.sports, ...FC_GROUPS.trail.sports];
  const { list, months } = zoneWindow(fam);
  // FC max : 3e plus haute valeur relevée (une valeur isolée est souvent un pic du capteur)
  const maxes = list.map((a) => a.max_hr).filter((v) => v > 100 && v < 230).sort((a, b) => b - a);
  if (maxes.length < 3) return null;
  const hrMax = maxes[2];
  const bounds = ZONES.map((z) => Math.round(hrMax * z.lo)).concat(hrMax);
  let curve = null, paces = null;
  if (group !== "ride") {
    curve = hrPaceCurve(list);
    if (curve.fit.length >= 4) paces = bounds.map((h) => paceAtHr(curve.fit, h));
  }
  return { hrMax, bounds, curve, paces, months };
}
function zoneOf(hr, z) {
  let k = 0;
  for (let i = 1; i < 5; i++) if (hr >= z.bounds[i]) k = i;
  return k;
}
function renderZoneCurve(z) {
  const box = $("#zonesCurve");
  if (!z.curve || z.curve.fit.length < 4) { box.innerHTML = ""; return; }
  const W = CW(), H = 260, pad = { t: 12, r: 12, b: 34, l: 44 };
  const s = svg(W, H);
  const pts = z.curve.fit;
  const x0 = pts[0].p, x1 = pts.at(-1).p;
  const yLo = Math.min(z.bounds[1] - 8, ...pts.map((q) => q.hr)), yHi = z.hrMax + 2;
  const sx = (p) => pad.l + ((p - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (h) => H - pad.b - ((h - yLo) / (yHi - yLo)) * (H - pad.t - pad.b);
  // bandes des zones
  for (let i = 0; i < 5; i++) {
    const top = Math.min(yHi, i === 4 ? yHi : z.bounds[i + 1]), bot = Math.max(yLo, z.bounds[i]);
    if (top <= bot) continue;
    el(s, "rect", { x: pad.l, width: W - pad.l - pad.r, y: sy(top), height: sy(bot) - sy(top), fill: `var(--seq-${i + 1})`, opacity: 0.22 });
    el(s, "text", { x: W - pad.r - 4, y: sy(top) + 13, "text-anchor": "end", "font-weight": 600 }, `Z${i + 1}`);
  }
  for (let h = Math.ceil(yLo / 10) * 10; h <= yHi; h += 10) el(s, "text", { x: pad.l - 6, y: sy(h) + 4, "text-anchor": "end" }, h);
  for (let p = Math.ceil(x0 / 30) * 30; p <= x1; p += 30) el(s, "text", { x: sx(p), y: H - pad.b + 16, "text-anchor": "middle" }, fmtPace(p));
  el(s, "text", { x: pad.l + (W - pad.l - pad.r) / 2, y: H - 4, "text-anchor": "middle" }, "allure à plat équivalente (min/km)");
  // médianes réelles (taille = nombre de km), puis courbe lissée
  const maxN = Math.max(...pts.map((q) => q.n));
  for (const q of pts) {
    const c = el(s, "circle", { cx: sx(q.p), cy: sy(q.hr), r: 2 + 4 * Math.sqrt(q.n / maxN), fill: "var(--series-1)", "fill-opacity": 0.55 });
    el(c, "title", {}, `${fmtPace(q.p - 2.5)} à ${fmtPace(q.p + 2.5)} /km : FC médiane ${Math.round(q.hr)} (${q.n} km)`);
  }
  el(s, "polyline", { points: pts.map((q) => `${sx(q.p).toFixed(1)},${sy(q.fit).toFixed(1)}`).join(" "), fill: "none", stroke: "var(--series-1)", "stroke-width": 2.2, "stroke-linejoin": "round" });
  box.innerHTML = "";
  box.appendChild(s);
}
function renderZones() {
  if (!$("#zonesCard") || !ALL.length) return;
  const group = fcState.group;
  const z = estimateZones(group);
  const label = FC_GROUPS[group].label;
  $("#zonesTitle").textContent = `Zones d'entraînement (${group === "ride" ? "vélo" : "course à pied"})`;
  if (!z) {
    $("#zonesKpis").innerHTML = $("#zonesTime").innerHTML = $("#zonesCurve").innerHTML = "";
    $("#zonesTable").innerHTML = `<p class="empty">Pas assez de sorties de ${label} avec la FC pour calculer les zones.</p>`;
    return;
  }
  const showPace = group === "run" && z.paces;
  const per = z.months ? `des ${z.months} derniers mois` : "de tout l'historique";
  $("#zonesKpis").innerHTML = [
    ["FC max", `${z.hrMax} bpm`, `3e plus haute FC ${per}`],
    ...(showPace ? [["Km analysés", fmtNum(z.curve.km), `km de course sur route ${per}, FC et allure réelles`]] : []),
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  const b = z.bounds;
  const hrTxt = (i) => (i === 4 ? `${b[4]} et plus` : `${b[i]} – ${b[i + 1] - 1}`);
  const paceTxt = (i) => {
    const slow = z.paces[i], fast = z.paces[i + 1]; // FC basse = allure lente
    if (i === 4 || fast == null) return slow ? `plus vite que ${fmtPace(slow)}` : "–";
    if (slow == null) return `plus lent que ${fmtPace(fast)}`;
    return `${fmtPace(fast)} – ${fmtPace(slow)}`;
  };

  // temps passé par zone sur la période du bloc FC : détail au km quand il existe, sinon FC moyenne de la sortie
  const since = new Date(fcState.since + "T00:00"), until = fcEnd();
  const secs = [0, 0, 0, 0, 0];
  let nKm = 0, nAct = 0;
  for (const a of ALL) {
    if (!FC_GROUPS[group].sports.includes(a.sport) || a.date < since || a.date > until || !a.avg_hr) continue;
    const sp = SPLITS?.[a.id]?.splits?.filter((x) => x.hr > 0 && x.t > 0);
    if (sp?.length) { nKm++; for (const x of sp) secs[zoneOf(x.hr, z)] += x.t; }
    else { nAct++; secs[zoneOf(a.avg_hr, z)] += a.moving_time; }
  }
  const tot = secs.reduce((t, v) => t + v, 0);
  const maxS = Math.max(...secs, 1);
  $("#zonesTable").innerHTML = `<table class="zones"><thead><tr><th>Zone</th><th>% FC max</th><th>FC (bpm)</th>${showPace ? "<th>Allure réelle (/km)</th>" : ""}<th>Temps sur la période</th></tr></thead><tbody>` +
    ZONES.map((zz, i) => `<tr><td><span class="zdot" style="background:var(--seq-${i + 1})"></span><b>Z${i + 1}</b> ${zz.name}</td><td class="num">${Math.round(zz.lo * 100)} – ${Math.round(zz.hi * 100)} %</td><td class="num">${hrTxt(i)}</td>${showPace ? `<td class="num">${paceTxt(i)}</td>` : ""}
      <td><div class="zbar"><span class="trk"><i style="width:${((secs[i] / maxS) * 100).toFixed(1)}%;background:var(--seq-${i + 1})"></i></span><span>${tot ? fmtNum((secs[i] / tot) * 100, 0) + " %" : "–"}${secs[i] ? " · " + hhmm(secs[i]) : ""}</span></div></td></tr>`).join("") +
    "</tbody></table>";
  $("#zonesCurveTitle").hidden = !showPace;
  if (showPace) renderZoneCurve(z); else $("#zonesCurve").innerHTML = "";
  $("#zonesTimeTitle").textContent = `Répartition du temps ${fcRangeTxt()}`;
  $("#zonesTime").innerHTML = tot
    ? `<div class="zstack">${secs.map((v, i) => (v ? `<i style="flex:${v};background:var(--seq-${i + 1})" title="Z${i + 1} : ${fmtNum((v / tot) * 100, 0)} %"></i>` : "")).join("")}</div>
       <div class="legend">${ZONES.map((zz, i) => `<span><i style="background:var(--seq-${i + 1});height:8px;width:8px"></i>Z${i + 1} ${fmtNum((secs[i] / tot) * 100, 0)} %</span>`).join("")}</div>
       <p class="muted">${nKm} sorties analysées km par km${nAct ? `, ${nAct} d'après leur FC moyenne seulement (moins précis)` : ""}.</p>`
    : `<p class="empty">Aucune sortie de ${label} avec la FC sur cette période.</p>`;
}
