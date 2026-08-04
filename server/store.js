// Simple, dependency-free JSON datastore with atomic writes.
// Data persists to disk on the server (not the browser), so nothing is lost on reload.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'trades.json');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}
ensureDirs();

const DEFAULT_POINT_VALUES = { NQ: 20, ES: 50, MNQ: 2, MES: 5 };

function defaultPointValue(symbol) {
  if (!symbol) return 1;
  return DEFAULT_POINT_VALUES[String(symbol).toUpperCase()] ?? 1;
}

function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(trades) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(trades, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// Partial exits: [{ qty, price }, …]. When present, the effective exit is the
// qty-weighted average price and contracts default to the summed partial qty,
// so total P&L equals the sum of the individual scale-outs.
function normalizeExits(t) {
  if (!Array.isArray(t.exits)) return [];
  return t.exits
    .map((p) => ({ qty: num(p && p.qty), price: num(p && p.price) }))
    .filter((p) => p.qty > 0 && p.price != null);
}

function computeMetrics(t) {
  const entry = num(t.entry);
  let exit = num(t.exit);
  let contracts = num(t.contracts) || 0;
  const partials = normalizeExits(t);
  if (partials.length) {
    const qtySum = partials.reduce((s, p) => s + p.qty, 0);
    exit = +(partials.reduce((s, p) => s + p.price * p.qty, 0) / qtySum).toFixed(4);
    if (!contracts) contracts = qtySum;
  }
  const pv = num(t.pointValue) || defaultPointValue(t.symbol);
  const commissions = num(t.commissions) || 0;
  const dir = t.direction === 'short' ? -1 : 1;

  let resultPoints = null, grossDollars = null, resultDollars = null;
  if (entry != null && exit != null) {
    resultPoints = +(dir * (exit - entry)).toFixed(4);
    grossDollars = resultPoints * pv * contracts;
    resultDollars = +(grossDollars - commissions).toFixed(2);
  }

  // Manual P&L override: the point×value×contracts math doesn't fit every
  // instrument (e.g. crypto), so a trade can carry a hand-entered net P&L
  // that replaces the computed dollars. Points stay as-is for reference.
  const override = num(t.pnlOverride);
  if (override != null) resultDollars = +override.toFixed(2);

  let riskDollars = null, rMultiple = null;
  const stop = num(t.stopLoss);
  if (stop != null && entry != null && contracts > 0) {
    riskDollars = Math.abs(entry - stop) * pv * contracts;
    if (riskDollars > 0 && resultDollars != null) {
      rMultiple = +(resultDollars / riskDollars).toFixed(2);
    }
  }

  let holdingMinutes = null;
  if (t.time && t.exitTime) {
    const [h1, m1] = String(t.time).split(':').map(Number);
    const [h2, m2] = String(t.exitTime).split(':').map(Number);
    if ([h1, m1, h2, m2].every(Number.isFinite)) {
      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diff < 0) diff += 24 * 60; // exit past midnight
      holdingMinutes = diff;
    }
  }

  return {
    pointValue: pv,
    // Effective values (partials-aware) so the UI can display them directly.
    exit: exit,
    contracts: contracts || null,
    resultPoints,
    resultDollars,
    riskDollars: riskDollars != null ? +riskDollars.toFixed(2) : null,
    rMultiple,
    holdingMinutes,
  };
}

function decorate(t) {
  return { ...t, ...computeMetrics(t) };
}

const FIELDS = [
  'date', 'time', 'exitTime', 'symbol', 'direction', 'entry', 'exit', 'exits', 'contracts',
  'stopLoss', 'takeProfit', 'commissions', 'pointValue', 'pnlOverride', 'setup',
  'model', 'entryModel', 'htfDelivery', 'newsEvent', 'grade',
  'emotionEntry', 'emotionExit', 'mistake',
  'session', 'notes', 'source', 'sourceId',
  'rating', 'planFollowed', 'emotion', 'mistakes',
  // ICT / HTF / prop-firm / playbook fields (all optional, backwards compatible)
  'setupTags', 'dailyBias', 'htfPda', 'drawOnLiquidity', 'narrative', 'po3',
  'tvUrl', 'accountType', 'propFirm', 'rulesFollowed', 'ruleBroken', 'playbookId', 'accountId', 'accountIds',
];

function sanitize(input) {
  const out = {};
  for (const f of FIELDS) out[f] = input[f] === undefined ? null : input[f];
  return out;
}

function sanitizePatch(input) {
  const out = {};
  for (const f of FIELDS) if (input[f] !== undefined) out[f] = input[f];
  return out;
}

function listTrades() {
  return readAll().map(decorate).sort((a, b) => {
    const da = (a.date || '') + ' ' + (a.time || '');
    const db_ = (b.date || '') + ' ' + (b.time || '');
    return db_.localeCompare(da);
  });
}

function getTrade(id) {
  const t = readAll().find((x) => x.id === id);
  return t ? decorate(t) : null;
}

function createTrade(input) {
  const trades = readAll();
  const now = new Date().toISOString();
  const t = {
    id: crypto.randomUUID(),
    ...sanitize(input),
    screenshots: Array.isArray(input.screenshots) ? input.screenshots : [],
    createdAt: now,
    updatedAt: now,
  };
  trades.push(t);
  writeAll(trades);
  return decorate(t);
}

function updateTrade(id, input) {
  const trades = readAll();
  const i = trades.findIndex((x) => x.id === id);
  if (i === -1) return null;
  trades[i] = { ...trades[i], ...sanitizePatch(input), updatedAt: new Date().toISOString() };
  writeAll(trades);
  return decorate(trades[i]);
}

function deleteTrade(id) {
  const trades = readAll();
  const t = trades.find((x) => x.id === id);
  if (!t) return false;
  writeAll(trades.filter((x) => x.id !== id));
  (t.screenshots || []).forEach((s) => {
    try { fs.unlinkSync(path.join(__dirname, 'uploads', s.filename)); } catch {}
  });
  return true;
}

function addScreenshot(id, filename, label) {
  const trades = readAll();
  const i = trades.findIndex((x) => x.id === id);
  if (i === -1) return null;
  const shot = { id: crypto.randomUUID(), filename, label: label || '' };
  trades[i].screenshots = trades[i].screenshots || [];
  trades[i].screenshots.push(shot);
  trades[i].updatedAt = new Date().toISOString();
  writeAll(trades);
  return shot;
}

function removeScreenshot(id, shotId) {
  const trades = readAll();
  const i = trades.findIndex((x) => x.id === id);
  if (i === -1) return false;
  const shot = (trades[i].screenshots || []).find((s) => s.id === shotId);
  if (!shot) return false;
  trades[i].screenshots = trades[i].screenshots.filter((s) => s.id !== shotId);
  trades[i].updatedAt = new Date().toISOString();
  writeAll(trades);
  try { fs.unlinkSync(path.join(__dirname, 'uploads', shot.filename)); } catch {}
  return true;
}

function replaceAll(trades) {
  const cleaned = trades.map((t) => ({
    id: t.id || crypto.randomUUID(),
    ...sanitize(t),
    screenshots: Array.isArray(t.screenshots) ? t.screenshots : [],
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  writeAll(cleaned);
  return cleaned.length;
}

function bulkAdd(trades) {
  const existing = readAll();
  const added = trades.map((t) => ({
    id: crypto.randomUUID(),
    ...sanitize(t),
    screenshots: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  writeAll(existing.concat(added));
  return added.length;
}

function makeBackup() {
  const trades = readAll();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(trades, null, 2));
  return { file, count: trades.length };
}

function findBySourceId(sourceId) {
  return readAll().find((x) => x.sourceId === sourceId) || null;
}

// One-time safety backup when upgrading to a schema that adds new optional
// fields. New fields are null-tolerant so no data is rewritten; this just
// guarantees a restore point exists before the new version runs.
const SCHEMA_MARKER = path.join(DATA_DIR, '.schema-v2');
function migrateIfNeeded() {
  try {
    if (fs.existsSync(SCHEMA_MARKER)) return;
    if (readAll().length > 0) makeBackup();
    fs.writeFileSync(SCHEMA_MARKER, new Date().toISOString());
  } catch { /* non-fatal */ }
}
migrateIfNeeded();

module.exports = {
  DEFAULT_POINT_VALUES, defaultPointValue, computeMetrics,
  listTrades, getTrade, createTrade, updateTrade, deleteTrade,
  addScreenshot, removeScreenshot, replaceAll, bulkAdd, makeBackup, readAll, findBySourceId,
};
