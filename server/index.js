const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('./store');
const tradovate = require('./tradovate');
const csv = require('./csv');
const auth = require('./auth');
const playbooks = require('./playbooks');
const journal = require('./journal');
const propfirms = require('./propfirms');
const study = require('./study');

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SESSION_COOKIE = 'tz_sid';

app.use(express.json({ limit: '5mb' }));

// ---- Cookies (dependency-free) ----
app.use((req, res, next) => {
  req.cookies = {};
  (req.headers.cookie || '').split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i === -1) return;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) req.cookies[k] = decodeURIComponent(v);
  });
  next();
});

function setSessionCookie(res, token) {
  const maxAge = Math.floor(auth.SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

// ---- Auth ----
app.get('/api/auth/status', (req, res) => res.json({ hasUsers: auth.hasUsers() }));

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !String(username).trim() || !password || String(password).length < 4) {
    return res.status(400).json({ error: 'Username and password (min. 4 characters) are required' });
  }
  // Registration is only open for the first (bootstrap) account, or for an
  // already-logged-in user adding another personal account.
  const loggedIn = !!auth.getSession(req.cookies[SESSION_COOKIE]);
  if (auth.hasUsers() && !loggedIn) {
    return res.status(403).json({ error: 'Registration is disabled. Log in with an existing account.' });
  }
  try {
    const user = auth.createUser(String(username).trim(), password);
    const token = auth.createSession(user.username);
    setSessionCookie(res, token);
    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = auth.verifyUser(username || '', password || '');
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  const token = auth.createSession(user.username);
  setSessionCookie(res, token);
  res.json(user);
});

app.post('/api/auth/logout', (req, res) => {
  auth.destroySession(req.cookies[SESSION_COOKIE]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const session = auth.getSession(req.cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: 'not authenticated' });
  res.json({ username: session.username });
});

// ---- Require a logged-in session for the rest of the API ----
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const session = auth.getSession(req.cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: 'not authenticated' });
  req.user = session.username;
  next();
});

// ---- Screenshot uploads ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, crypto.randomUUID() + ext);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

app.use('/uploads', express.static(UPLOAD_DIR));

// ---- Trades CRUD ----
app.get('/api/trades', (req, res) => res.json(store.listTrades()));

app.get('/api/trades/:id', (req, res) => {
  const t = store.getTrade(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

app.post('/api/trades', (req, res) => res.status(201).json(store.createTrade(req.body || {})));

app.put('/api/trades/:id', (req, res) => {
  const t = store.updateTrade(req.params.id, req.body || {});
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

app.delete('/api/trades/:id', (req, res) => {
  const ok = store.deleteTrade(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Screenshots ----
app.post('/api/trades/:id/screenshots', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image file' });
  const shot = store.addScreenshot(req.params.id, req.file.filename, req.body.label);
  if (!shot) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    return res.status(404).json({ error: 'trade not found' });
  }
  res.status(201).json(shot);
});

app.delete('/api/trades/:id/screenshots/:sid', (req, res) => {
  const ok = store.removeScreenshot(req.params.id, req.params.sid);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Playbooks ----
app.get('/api/playbooks', (req, res) => res.json(playbooks.list()));
app.post('/api/playbooks', (req, res) => res.status(201).json(playbooks.create(req.body || {})));
app.put('/api/playbooks/:id', (req, res) => {
  const p = playbooks.update(req.params.id, req.body || {});
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});
app.delete('/api/playbooks/:id', (req, res) => {
  const p = playbooks.remove(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  (p.screenshots || []).forEach((s) => { try { fs.unlinkSync(path.join(UPLOAD_DIR, s.filename)); } catch {} });
  res.json({ ok: true });
});
app.post('/api/playbooks/:id/screenshots', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image file' });
  const shot = playbooks.addScreenshot(req.params.id, req.file.filename, req.body.label);
  if (!shot) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    return res.status(404).json({ error: 'playbook not found' });
  }
  res.status(201).json(shot);
});
app.delete('/api/playbooks/:id/screenshots/:sid', (req, res) => {
  const shot = playbooks.removeScreenshot(req.params.id, req.params.sid);
  if (!shot) return res.status(404).json({ error: 'not found' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, shot.filename)); } catch {}
  res.json({ ok: true });
});

// ---- Market journal (day notes, separate from trades) ----
app.get('/api/journal', (req, res) => res.json(journal.list()));
app.post('/api/journal', (req, res) => res.status(201).json(journal.create(req.body || {})));
app.put('/api/journal/:id', (req, res) => {
  const e = journal.update(req.params.id, req.body || {});
  if (!e) return res.status(404).json({ error: 'not found' });
  res.json(e);
});
app.delete('/api/journal/:id', (req, res) => {
  const e = journal.remove(req.params.id);
  if (!e) return res.status(404).json({ error: 'not found' });
  (e.screenshots || []).forEach((s) => { try { fs.unlinkSync(path.join(UPLOAD_DIR, s.filename)); } catch {} });
  res.json({ ok: true });
});
app.post('/api/journal/:id/screenshots', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image file' });
  const shot = journal.addScreenshot(req.params.id, req.file.filename, req.body.label);
  if (!shot) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    return res.status(404).json({ error: 'entry not found' });
  }
  res.status(201).json(shot);
});
app.delete('/api/journal/:id/screenshots/:sid', (req, res) => {
  const shot = journal.removeScreenshot(req.params.id, req.params.sid);
  if (!shot) return res.status(404).json({ error: 'not found' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, shot.filename)); } catch {}
  res.json({ ok: true });
});

// ---- Prop firms & accounts ----
app.get('/api/propfirms', (req, res) => res.json(propfirms.listFirms()));
app.post('/api/propfirms', (req, res) => res.status(201).json(propfirms.createFirm(req.body || {})));
app.put('/api/propfirms/:id', (req, res) => {
  const f = propfirms.updateFirm(req.params.id, req.body || {});
  if (!f) return res.status(404).json({ error: 'not found' });
  res.json(f);
});
app.delete('/api/propfirms/:id', (req, res) => {
  const ok = propfirms.deleteFirm(req.params.id);
  res.json({ ok });
});
app.post('/api/propfirms/:firmId/accounts', (req, res) => {
  const acc = propfirms.addAccount(req.params.firmId, req.body || {});
  if (!acc) return res.status(404).json({ error: 'firm not found' });
  res.status(201).json(acc);
});
app.put('/api/propfirms/:firmId/accounts/:accId', (req, res) => {
  const acc = propfirms.updateAccount(req.params.firmId, req.params.accId, req.body || {});
  if (!acc) return res.status(404).json({ error: 'account not found' });
  res.json(acc);
});
app.delete('/api/propfirms/:firmId/accounts/:accId', (req, res) => {
  const ok = propfirms.deleteAccount(req.params.firmId, req.params.accId);
  res.json({ ok });
});

// ---- Study / Learn notes ----
app.get('/api/study', (req, res) => res.json(study.list()));
app.post('/api/study', (req, res) => res.status(201).json(study.create(req.body || {})));
app.put('/api/study/:id', (req, res) => {
  const p = study.update(req.params.id, req.body || {});
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});
app.delete('/api/study/:id', (req, res) => {
  const p = study.remove(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  (p.screenshots || []).forEach((s) => { try { fs.unlinkSync(path.join(UPLOAD_DIR, s.filename)); } catch {} });
  res.json({ ok: true });
});
app.post('/api/study/:id/screenshots', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image file' });
  const shot = study.addScreenshot(req.params.id, req.file.filename, req.body.label);
  if (!shot) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    return res.status(404).json({ error: 'note not found' });
  }
  res.status(201).json(shot);
});
app.delete('/api/study/:id/screenshots/:sid', (req, res) => {
  const shot = study.removeScreenshot(req.params.id, req.params.sid);
  if (!shot) return res.status(404).json({ error: 'not found' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, shot.filename)); } catch {}
  res.json({ ok: true });
});

// ---- CSV export ----
const CSV_COLUMNS = [
  'date', 'time', 'exitTime', 'symbol', 'direction', 'entry', 'exit', 'exits', 'contracts',
  'stopLoss', 'takeProfit', 'pointValue', 'commissions', 'pnlOverride', 'resultPoints',
  'resultDollars', 'riskDollars', 'rMultiple', 'holdingMinutes', 'setup', 'model',
  'entryModel', 'htfDelivery', 'newsEvent', 'grade', 'emotionEntry', 'emotionExit', 'mistake',
  'emotion', 'mistakes', 'rating', 'planFollowed', 'session', 'notes',
  'setupTags', 'dailyBias', 'htfPda', 'drawOnLiquidity', 'narrative', 'po3',
  'tvUrl', 'accountType', 'propFirm', 'rulesFollowed', 'ruleBroken', 'accountId', 'accountIds',
];

app.get('/api/export/csv', (req, res) => {
  const trades = store.listTrades().map((t) => ({
    ...t,
    setupTags: Array.isArray(t.setupTags) ? t.setupTags.join('; ') : (t.setupTags || ''),
    exits: Array.isArray(t.exits) ? t.exits.map((p) => `${p.qty}@${p.price}`).join('; ') : '',
    accountIds: Array.isArray(t.accountIds) ? t.accountIds.join('; ') : (t.accountIds || ''),
  }));
  const text = csv.stringify(trades, CSV_COLUMNS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
  res.send(text);
});

// ---- Tradovate "Performance" export support ----
// Tradovate exports round-trips with its own column names (buyPrice, sellPrice,
// boughtTimestamp, soldTimestamp, qty…). Whichever side filled first is the
// entry, which also determines long vs short.
function parseTradovateStamp(s) {
  // "MM/DD/YYYY HH:mm:ss" (optionally with seconds)
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const pad = (x) => String(x).padStart(2, '0');
  return {
    date: `${m[3]}-${pad(m[1])}-${pad(m[2])}`,
    time: `${pad(m[4])}:${m[5]}`,
    ms: new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] || 0)).getTime(),
  };
}
function tradovateBaseSymbol(s) {
  // "MNQU5" / "NQZ25" -> "MNQ" / "NQ" (strip month code + year digits)
  const raw = String(s || '').trim().toUpperCase();
  const m = raw.match(/^([A-Z]+)[FGHJKMNQUVXZ]\d{1,2}$/);
  return m ? m[1] : raw;
}
function isTradovatePerformance(objs) {
  const first = objs[0] || {};
  return 'buyPrice' in first && 'sellPrice' in first;
}
function mapTradovateRow(o) {
  const cleanNum = (v) => String(v ?? '').replace(/[$,\s]/g, '');
  const bought = parseTradovateStamp(o.boughtTimestamp);
  const sold = parseTradovateStamp(o.soldTimestamp);
  // Bought first = long; sold first = short. Missing stamps default to long.
  const isLong = !bought || !sold || bought.ms <= sold.ms;
  const entryStamp = isLong ? bought : sold;
  const exitStamp = isLong ? sold : bought;
  return {
    date: (entryStamp && entryStamp.date) || '',
    time: (entryStamp && entryStamp.time) || '',
    exitTime: (exitStamp && exitStamp.time) || '',
    symbol: tradovateBaseSymbol(o.symbol),
    direction: isLong ? 'long' : 'short',
    entry: cleanNum(isLong ? o.buyPrice : o.sellPrice),
    exit: cleanNum(isLong ? o.sellPrice : o.buyPrice),
    contracts: cleanNum(o.qty),
    source: 'tradovate-csv',
    sourceId: [o.buyFillId, o.sellFillId].filter(Boolean).join('-') || null,
  };
}

// Parse "2@29550; 1@29600" back into an exits array.
function parseExits(s) {
  return String(s || '').split(/[;,]/).map((part) => {
    const m = part.trim().match(/^(\d+(?:\.\d+)?)\s*@\s*(\d+(?:\.\d+)?)$/);
    return m ? { qty: Number(m[1]), price: Number(m[2]) } : null;
  }).filter(Boolean);
}

// ---- CSV import (append). Body: { csv: "..." } ----
app.post('/api/import/csv', (req, res) => {
  const text = (req.body && req.body.csv) || '';
  if (!text.trim()) return res.status(400).json({ error: 'empty csv' });
  let objs;
  try { objs = csv.toObjects(text); } catch (e) { return res.status(400).json({ error: 'parse error' }); }
  if (isTradovatePerformance(objs)) {
    const count = store.bulkAdd(objs.map(mapTradovateRow));
    return res.json({ imported: count, format: 'tradovate' });
  }
  const mapped = objs.map((o) => ({
    date: o.date || o.Date || '',
    time: o.time || o.Time || '',
    symbol: o.symbol || o.Symbol || '',
    direction: (o.direction || o.Direction || 'long').toLowerCase().startsWith('s') ? 'short' : 'long',
    entry: o.entry ?? o.Entry ?? '',
    exit: o.exit ?? o.Exit ?? '',
    exits: parseExits(o.exits ?? o.Exits ?? o['Partial exits']),
    contracts: o.contracts ?? o.Contracts ?? o.qty ?? o.Qty ?? '',
    stopLoss: o.stopLoss ?? o.stop ?? o.Stop ?? '',
    takeProfit: o.takeProfit ?? o.target ?? o.Target ?? '',
    pointValue: o.pointValue ?? '',
    commissions: o.commissions ?? o.Commissions ?? o.fees ?? '',
    pnlOverride: o.pnlOverride ?? o['Manual P&L'] ?? '',
    setup: o.setup ?? o.Setup ?? o.strategy ?? '',
    model: o.model ?? o.Model ?? '',
    entryModel: o.entryModel ?? o.EntryModel ?? o['Entry model'] ?? '',
    htfDelivery: o.htfDelivery ?? o.HtfDelivery ?? o['HTF delivery'] ?? '',
    newsEvent: o.newsEvent ?? o.NewsEvent ?? o['News event'] ?? o.News ?? '',
    grade: o.grade ?? o.Grade ?? '',
    exitTime: o.exitTime ?? o['Exit time'] ?? '',
    emotionEntry: o.emotionEntry ?? o['Entry emotion'] ?? '',
    emotionExit: o.emotionExit ?? o['Exit emotion'] ?? '',
    mistake: o.mistake ?? o.Mistake ?? '',
    emotion: o.emotion ?? o.Emotion ?? '',
    mistakes: o.mistakes ?? o.Mistakes ?? '',
    rating: o.rating ?? o.Rating ?? '',
    planFollowed: o.planFollowed ?? o['Plan followed'] ?? '',
    setupTags: (o.setupTags ?? o.SetupTags ?? o['Setup tags'] ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    dailyBias: o.dailyBias ?? o['Daily bias'] ?? '',
    htfPda: o.htfPda ?? o['HTF PDA'] ?? '',
    drawOnLiquidity: o.drawOnLiquidity ?? o['Draw on liquidity'] ?? '',
    narrative: o.narrative ?? o.Narrative ?? '',
    po3: o.po3 ?? o.PO3 ?? '',
    tvUrl: o.tvUrl ?? o['TradingView URL'] ?? '',
    accountType: o.accountType ?? o['Account type'] ?? '',
    propFirm: o.propFirm ?? o['Prop firm'] ?? '',
    rulesFollowed: o.rulesFollowed ?? o['Rules followed'] ?? '',
    ruleBroken: o.ruleBroken ?? o['Rule broken'] ?? '',
    session: o.session ?? o.Session ?? '',
    notes: o.notes ?? o.Notes ?? '',
    accountId: o.accountId ?? o['Account ID'] ?? '',
    accountIds: (o.accountIds ?? o['Account IDs'] ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
  }));
  const count = store.bulkAdd(mapped);
  res.json({ imported: count });
});

// ---- Full JSON backup / restore ----
app.get('/api/backup', (req, res) => {
  store.makeBackup();
  const data = store.readAll();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="pugzilla-backup.json"');
  res.send(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), trades: data }, null, 2));
});

app.post('/api/restore', (req, res) => {
  const body = req.body || {};
  const trades = Array.isArray(body) ? body : body.trades;
  if (!Array.isArray(trades)) return res.status(400).json({ error: 'expected { trades: [...] }' });
  store.makeBackup(); // safety backup of current state first
  const count = store.replaceAll(trades);
  res.json({ restored: count });
});

app.get('/api/meta', (req, res) => res.json({ pointValues: store.DEFAULT_POINT_VALUES }));

// ---- Tradovate integration ----
app.get('/api/tradovate/settings', (req, res) => res.json(tradovate.publicSettings()));

app.post('/api/tradovate/settings', (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['env', 'appId', 'name', 'deviceId'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k]; });
  // only overwrite secrets when a non-empty value is provided
  ['password', 'cid', 'sec'].forEach((k) => { if (b[k]) patch[k] = b[k]; });
  tradovate.saveSettings(patch);
  res.json(tradovate.publicSettings());
});

app.post('/api/tradovate/test', async (req, res) => {
  try { res.json(await tradovate.testConnection()); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/tradovate/sync', async (req, res) => {
  try { res.json(await tradovate.sync((req.body && req.body.date) || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});


// ---- Serve built frontend ----
const DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Pugzilla journal running on http://localhost:${PORT}`));
