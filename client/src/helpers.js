export const fmtUSD = (n) =>
  n == null || isNaN(n)
    ? '-'
    : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtNum = (n, d = 2) => (n == null || isNaN(n) ? '-' : Number(n).toFixed(d));

export const fmtR = (n) => (n == null || isNaN(n) ? '-' : (n > 0 ? '+' : '') + Number(n).toFixed(2) + 'R');

export const pnlClass = (n) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// Compute aggregate stats from a list of decorated trades.
export function computeStats(trades) {
  const closed = trades.filter((t) => t.resultDollars != null);
  const n = closed.length;
  const wins = closed.filter((t) => t.resultDollars > 0);
  const losses = closed.filter((t) => t.resultDollars < 0);
  const grossWin = wins.reduce((s, t) => s + t.resultDollars, 0);
  const grossLoss = losses.reduce((s, t) => s + t.resultDollars, 0); // negative
  const totalPnl = closed.reduce((s, t) => s + t.resultDollars, 0);
  const rs = closed.filter((t) => t.rMultiple != null).map((t) => t.rMultiple);
  return {
    count: n,
    totalPnl,
    winRate: n ? (wins.length / n) * 100 : 0,
    winCount: wins.length,
    lossCount: losses.length,
    profitFactor: grossLoss !== 0 ? grossWin / Math.abs(grossLoss) : (grossWin > 0 ? Infinity : 0),
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.resultDollars)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.resultDollars)) : 0,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    expectancy: n ? totalPnl / n : 0,
  };
}

// Build equity curve points ordered chronologically (oldest -> newest),
// including running peak and drawdown (<=0) at each point.
export function equitySeries(trades) {
  const closed = trades
    .filter((t) => t.resultDollars != null)
    .slice()
    .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  let cum = 0, peak = 0;
  return closed.map((t, i) => {
    cum += t.resultDollars;
    peak = Math.max(peak, cum);
    return {
      i: i + 1, equity: +cum.toFixed(2), label: t.date || '', pnl: t.resultDollars,
      drawdown: +(cum - peak).toFixed(2),
    };
  });
}

export function maxDrawdown(eq) {
  return eq.reduce((worst, p) => Math.min(worst, p.drawdown), 0);
}

// Group by a key, returning per-group stats.
export function groupStats(trades, keyFn) {
  const groups = {};
  for (const t of trades) {
    const k = keyFn(t) || 'Unspecified';
    (groups[k] = groups[k] || []).push(t);
  }
  return Object.entries(groups)
    .map(([k, arr]) => ({ key: k, ...computeStats(arr) }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}

export const SESSIONS = ['London', 'NY', 'Asia'];
export const todayISO = () => new Date().toISOString().slice(0, 10);

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekdayOf(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  return WEEKDAYS[(d.getDay() + 6) % 7];
}

export function hourOf(timeStr) {
  if (!timeStr) return null;
  const h = parseInt(String(timeStr).split(':')[0], 10);
  return Number.isFinite(h) ? h : null;
}

const DEFAULT_PV = { NQ: 20, ES: 50, MNQ: 2, MES: 5 };
export const defaultPointValue = (sym) => DEFAULT_PV[String(sym || '').toUpperCase()] ?? 1;

// Client-side preview of the same metrics the server computes.
export function previewMetrics(t) {
  const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const entry = n(t.entry), stop = n(t.stopLoss);
  let exit = n(t.exit);
  let contracts = n(t.contracts) || 0;
  // Partial exits: effective exit = qty-weighted average (mirrors server computeMetrics)
  const partials = (Array.isArray(t.exits) ? t.exits : [])
    .map((p) => ({ qty: n(p && p.qty), price: n(p && p.price) }))
    .filter((p) => p.qty > 0 && p.price != null);
  let avgExit = null, exitQty = null;
  if (partials.length) {
    exitQty = partials.reduce((s, p) => s + p.qty, 0);
    avgExit = +(partials.reduce((s, p) => s + p.price * p.qty, 0) / exitQty).toFixed(4);
    exit = avgExit;
    if (!contracts) contracts = exitQty;
  }
  const pv = n(t.pointValue) || defaultPointValue(t.symbol);
  const comm = n(t.commissions) || 0;
  const dir = t.direction === 'short' ? -1 : 1;
  let points = null, dollars = null, r = null, risk = null;
  if (entry != null && exit != null) {
    points = +(dir * (exit - entry)).toFixed(4);
    dollars = +(points * pv * contracts - comm).toFixed(2);
  }
  // Manual P&L override replaces the computed dollars (mirrors server computeMetrics).
  const override = n(t.pnlOverride);
  if (override != null) dollars = override;
  if (stop != null && entry != null && contracts > 0) {
    risk = Math.abs(entry - stop) * pv * contracts;
    if (risk > 0 && dollars != null) r = +(dollars / risk).toFixed(2);
  }
  return { points, dollars, r, risk, pv, avgExit, exitQty };
}

// ---- Insights computations ----
export function drawdownSeries(trades) {
  const eq = equitySeries(trades);
  let peak = 0, maxDD = 0;
  const series = eq.map((p) => {
    peak = Math.max(peak, p.equity);
    const dd = p.equity - peak;
    if (dd < maxDD) maxDD = dd;
    return { i: p.i, dd: +dd.toFixed(2), equity: p.equity };
  });
  return { series, maxDD: +maxDD.toFixed(2) };
}

function chrono(trades) {
  return trades.filter((t) => t.resultDollars != null)
    .slice().sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
}

export function streaks(trades) {
  const c = chrono(trades);
  let longestWin = 0, longestLoss = 0, curType = null, curLen = 0;
  let lw = 0, ll = 0;
  for (const t of c) {
    const w = t.resultDollars > 0;
    const type = t.resultDollars === 0 ? 'flat' : (w ? 'win' : 'loss');
    if (type === curType) curLen += 1; else { curType = type; curLen = 1; }
    if (type === 'win') { lw += 1; ll = 0; longestWin = Math.max(longestWin, lw); }
    else if (type === 'loss') { ll += 1; lw = 0; longestLoss = Math.max(longestLoss, ll); }
    else { lw = 0; ll = 0; }
  }
  return { longestWin, longestLoss, current: { type: curType, len: curLen } };
}

export function rHistogram(trades) {
  const buckets = [
    { label: '< -2R', min: -Infinity, max: -2 },
    { label: '-2..-1R', min: -2, max: -1 },
    { label: '-1..0R', min: -1, max: 0 },
    { label: '0..1R', min: 0, max: 1 },
    { label: '1..2R', min: 1, max: 2 },
    { label: '2..3R', min: 2, max: 3 },
    { label: '> 3R', min: 3, max: Infinity },
  ];
  const out = buckets.map((b) => ({ label: b.label, count: 0 }));
  for (const t of trades) {
    if (t.rMultiple == null) continue;
    const i = buckets.findIndex((b) => t.rMultiple >= b.min && t.rMultiple < b.max);
    if (i >= 0) out[i].count += 1;
  }
  return out;
}

export function byHour(trades) {
  const m = {};
  for (const t of trades) {
    if (t.resultDollars == null || !t.time) continue;
    const h = parseInt(String(t.time).slice(0, 2), 10);
    if (isNaN(h)) continue;
    (m[h] = m[h] || { pnl: 0, count: 0 });
    m[h].pnl += t.resultDollars; m[h].count += 1;
  }
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, pnl: +(m[h]?.pnl || 0).toFixed(2), count: m[h]?.count || 0 }));
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function byWeekday(trades) {
  const m = {};
  for (const t of trades) {
    if (t.resultDollars == null || !t.date) continue;
    const d = new Date(t.date + 'T00:00:00').getDay();
    (m[d] = m[d] || { pnl: 0, count: 0 });
    m[d].pnl += t.resultDollars; m[d].count += 1;
  }
  // Mon..Sun order
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({ day: WD[d], pnl: +(m[d]?.pnl || 0).toFixed(2), count: m[d]?.count || 0 }));
}

// Flag days with revenge trading (a trade taken after 2+ consecutive losses that day)
// or overtrading (more than `maxPerDay` trades).
export function tiltFlags(trades, maxPerDay = 6) {
  const byDay = {};
  for (const t of trades) {
    if (t.resultDollars == null || !t.date) continue;
    (byDay[t.date] = byDay[t.date] || []).push(t);
  }
  const flags = [];
  for (const [date, arr] of Object.entries(byDay)) {
    arr.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const reasons = [];
    if (arr.length > maxPerDay) reasons.push(arr.length + ' trades');
    let loseRun = 0, revenge = false;
    for (const t of arr) {
      if (loseRun >= 2) revenge = true;
      if (t.resultDollars < 0) loseRun += 1; else if (t.resultDollars > 0) loseRun = 0;
    }
    if (revenge) reasons.push('revenge after losses');
    const pnl = arr.reduce((s, t) => s + t.resultDollars, 0);
    if (reasons.length) flags.push({ date, reasons, pnl: +pnl.toFixed(2), count: arr.length });
  }
  return flags.sort((a, b) => b.date.localeCompare(a.date));
}

// Win rate / expectancy split by whether the plan was followed.
export function disciplineSplit(trades) {
  const yes = trades.filter((t) => t.planFollowed === true || t.planFollowed === 'true');
  const no = trades.filter((t) => t.planFollowed === false || t.planFollowed === 'false');
  return { followed: computeStats(yes), broken: computeStats(no), followedN: yes.length, brokenN: no.length };
}

export const EMOTIONS = ['Disciplined', 'Confident', 'Calm', 'FOMO', 'Revenge', 'Anxious', 'Bored', 'Greedy'];

// ---- ICT / HTF / prop-firm option lists ----
export const ICT_SETUPS = [
  'FVG', 'Order Block', 'Breaker', 'MSS', 'CHoCH', 'CISD', 'Liquidity Sweep',
  'Silver Bullet', 'Unicorn', 'Turtle Soup', 'Judas Swing', 'TGIF', 'OTE', 'One Shot One Kill',
];
export const DAILY_BIAS = ['Bullish', 'Bearish', 'Neutral'];
export const HTF_PDA = ['Premium', 'Discount', 'Equilibrium'];
export const DRAW_ON_LIQUIDITY = ['PDH', 'PDL', 'PWH', 'PWL', 'Weekly open', 'Monthly open', 'Session liquidity', 'PDA array', 'REH', 'REL'];
export const PO3_PHASES = ['Accumulation', 'Manipulation', 'Distribution'];
export const ACCOUNT_TYPES = ['Eval', 'Funded', 'Demo Funded', 'Live'];

// Whether the trade direction aligned with the stated daily bias.
// 'with' = long+bullish or short+bearish, 'against' = the opposite, null = neutral/unknown.
export function biasAlignment(t) {
  const b = String(t.dailyBias || '').toLowerCase();
  if (b === 'bullish') return t.direction === 'long' ? 'with' : 'against';
  if (b === 'bearish') return t.direction === 'short' ? 'with' : 'against';
  return null;
}

// Normalise setupTags to an array regardless of how it was stored (array, ';'/',' string, or empty).
export function setupTagsOf(t) {
  if (Array.isArray(t.setupTags)) return t.setupTags.filter(Boolean);
  if (typeof t.setupTags === 'string' && t.setupTags.trim()) {
    return t.setupTags.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function isTradingViewUrl(url) {
  if (!url) return true; // empty is allowed
  try {
    const u = new URL(url);
    return /(^|\.)tradingview\.com$/i.test(u.hostname) && (u.protocol === 'https:' || u.protocol === 'http:');
  } catch {
    return false;
  }
}

export const APP_VERSION = '2.7.1';

// Per setup-tag stats. A trade with multiple tags counts toward each of them.
export function setupTagStats(trades) {
  const groups = {};
  for (const t of trades) {
    for (const tag of setupTagsOf(t)) (groups[tag] = groups[tag] || []).push(t);
  }
  return Object.entries(groups)
    .map(([key, arr]) => ({ key, ...computeStats(arr) }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}

// Split trades into "with HTF bias" vs "against HTF bias" (see biasAlignment).
export function biasSplit(trades) {
  const withB = trades.filter((t) => biasAlignment(t) === 'with');
  const against = trades.filter((t) => biasAlignment(t) === 'against');
  return {
    withStats: computeStats(withB), againstStats: computeStats(against),
    withN: withB.length, againstN: against.length,
  };
}

// Accounts a trade was executed on. Supports the new multi-account `accountIds`
// array and falls back to the legacy single `accountId` for older trades.
export function accountIdsOf(t) {
  if (Array.isArray(t.accountIds) && t.accountIds.length) return t.accountIds.filter(Boolean);
  return t.accountId ? [t.accountId] : [];
}

export const ACCOUNT_ORDER = ACCOUNT_TYPES;
export function accountTypesPresent(trades) {
  const set = new Set(trades.map((t) => t.accountType).filter(Boolean));
  return ACCOUNT_ORDER.filter((a) => set.has(a));
}

// Per-tag stats for a free-text, comma-separated "mistakes" field, so multiple
// mistakes on one trade are each counted (unlike the single-select `mistake`).
export function mistakeTagStats(trades) {
  const groups = {};
  for (const t of trades) {
    if (!t.mistakes) continue;
    const tags = String(t.mistakes).split(',').map((s) => s.trim()).filter(Boolean);
    for (const tag of tags) (groups[tag] = groups[tag] || []).push(t);
  }
  return Object.entries(groups)
    .map(([key, arr]) => ({ key, ...computeStats(arr) }))
    .sort((a, b) => a.expectancy - b.expectancy);
}
