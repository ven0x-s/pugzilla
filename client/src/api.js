const J = { 'Content-Type': 'application/json' };

async function req(url, opts) {
  let r;
  try {
    r = await fetch(url, opts);
  } catch {
    // Network-level failure ("Failed to fetch"): server unreachable, stale page, or connection dropped.
    throw new Error('Cannot reach the Pugzilla server. Check that it is running, then hard-refresh this page (Ctrl+F5) and try again.');
  }
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch {}
    if (r.status === 401 && !url.includes('/auth/')) {
      msg = 'Session expired (the server was restarted). Refresh the page and log in again.';
    }
    throw new Error(msg);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

export const api = {
  authStatus: () => req('/api/auth/status'),
  me: () => req('/api/auth/me'),
  login: (username, password) => req('/api/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ username, password }) }),
  register: (username, password) => req('/api/auth/register', { method: 'POST', headers: J, body: JSON.stringify({ username, password }) }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  listTrades: () => req('/api/trades'),
  createTrade: (t) => req('/api/trades', { method: 'POST', headers: J, body: JSON.stringify(t) }),
  updateTrade: (id, t) => req('/api/trades/' + id, { method: 'PUT', headers: J, body: JSON.stringify(t) }),
  deleteTrade: (id) => req('/api/trades/' + id, { method: 'DELETE' }),
  meta: () => req('/api/meta'),
  uploadScreenshot: (id, file, label) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label || '');
    return req('/api/trades/' + id + '/screenshots', { method: 'POST', body: fd });
  },
  deleteScreenshot: (id, sid) => req('/api/trades/' + id + '/screenshots/' + sid, { method: 'DELETE' }),
  importCsv: (csv) => req('/api/import/csv', { method: 'POST', headers: J, body: JSON.stringify({ csv }) }),
  tvGetSettings: () => req('/api/tradovate/settings'),
  tvSaveSettings: (s) => req('/api/tradovate/settings', { method: 'POST', headers: J, body: JSON.stringify(s) }),
  tvTest: () => req('/api/tradovate/test', { method: 'POST', headers: J, body: '{}' }),
  tvSync: (date) => req('/api/tradovate/sync', { method: 'POST', headers: J, body: JSON.stringify({ date }) }),
  restore: (trades) => req('/api/restore', { method: 'POST', headers: J, body: JSON.stringify({ trades }) }),
  listPlaybooks: () => req('/api/playbooks'),
  createPlaybook: (p) => req('/api/playbooks', { method: 'POST', headers: J, body: JSON.stringify(p) }),
  updatePlaybook: (id, p) => req('/api/playbooks/' + id, { method: 'PUT', headers: J, body: JSON.stringify(p) }),
  deletePlaybook: (id) => req('/api/playbooks/' + id, { method: 'DELETE' }),
  uploadPlaybookShot: (id, file, label) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label || '');
    return req('/api/playbooks/' + id + '/screenshots', { method: 'POST', body: fd });
  },
  deletePlaybookShot: (id, sid) => req('/api/playbooks/' + id + '/screenshots/' + sid, { method: 'DELETE' }),
  listJournal: () => req('/api/journal'),
  createJournal: (e) => req('/api/journal', { method: 'POST', headers: J, body: JSON.stringify(e) }),
  updateJournal: (id, e) => req('/api/journal/' + id, { method: 'PUT', headers: J, body: JSON.stringify(e) }),
  deleteJournal: (id) => req('/api/journal/' + id, { method: 'DELETE' }),
  uploadJournalShot: (id, file, label) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label || '');
    return req('/api/journal/' + id + '/screenshots', { method: 'POST', body: fd });
  },
  deleteJournalShot: (id, sid) => req('/api/journal/' + id + '/screenshots/' + sid, { method: 'DELETE' }),
  listPropfirms: () => req('/api/propfirms'),
  createPropfirm: (f) => req('/api/propfirms', { method: 'POST', headers: J, body: JSON.stringify(f) }),
  updatePropfirm: (id, f) => req('/api/propfirms/' + id, { method: 'PUT', headers: J, body: JSON.stringify(f) }),
  deletePropfirm: (id) => req('/api/propfirms/' + id, { method: 'DELETE' }),
  addAccount: (firmId, a) => req('/api/propfirms/' + firmId + '/accounts', { method: 'POST', headers: J, body: JSON.stringify(a) }),
  updateAccount: (firmId, accId, a) => req('/api/propfirms/' + firmId + '/accounts/' + accId, { method: 'PUT', headers: J, body: JSON.stringify(a) }),
  deleteAccount: (firmId, accId) => req('/api/propfirms/' + firmId + '/accounts/' + accId, { method: 'DELETE' }),
  listStudy: () => req('/api/study'),
  createStudy: (n) => req('/api/study', { method: 'POST', headers: J, body: JSON.stringify(n) }),
  updateStudy: (id, n) => req('/api/study/' + id, { method: 'PUT', headers: J, body: JSON.stringify(n) }),
  deleteStudy: (id) => req('/api/study/' + id, { method: 'DELETE' }),
  uploadStudyShot: (id, file, label) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label || '');
    return req('/api/study/' + id + '/screenshots', { method: 'POST', body: fd });
  },
  deleteStudyShot: (id, sid) => req('/api/study/' + id + '/screenshots/' + sid, { method: 'DELETE' }),
};
