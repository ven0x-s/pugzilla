import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from './api.js';
import Filters from './components/Filters.jsx';
import Dashboard from './components/Dashboard.jsx';
import TradesView from './components/TradesView.jsx';
import TradeForm from './components/TradeForm.jsx';
import CalendarView from './components/CalendarView.jsx';
import AnalysisView from './components/AnalysisView.jsx';
import DataView from './components/DataView.jsx';
import InsightsView from './components/InsightsView.jsx';
import Login from './components/Login.jsx';
import ShareCard from './components/ShareCard.jsx';
import PsychologyView from './components/PsychologyView.jsx';
import PlaybookView from './components/PlaybookView.jsx';
import MarketJournalView from './components/MarketJournalView.jsx';
import StudyView from './components/StudyView.jsx';
import PropFirmsView from './components/PropFirmsView.jsx';
import AccountsView from './components/AccountsView.jsx';
import HelpModal from './components/HelpModal.jsx';
import QuickTradeForm from './components/QuickTradeForm.jsx';
import { APP_VERSION } from './helpers.js';

const TABS = [
  ['dashboard', 'Dashboard'],
  ['trades', 'Trades'],
  ['calendar', 'Calendar'],
  ['insights', 'Insights'],
  ['analysis', 'Analysis'],
  ['psychology', 'Psychology'],
  ['playbook', 'Playbook'],
  ['accounts', 'Accounts'],
  ['market', 'Market'],
  ['study', 'Study'],
  ['data', 'Data'],
];

const emptyFilters = { symbol: '', setup: '', model: '', entryModel: '', newsEvent: '', grade: '', accountType: '', playbook: '', session: '', direction: '', from: '', to: '' };

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [trades, setTrades] = useState([]);
  const [playbooks, setPlaybooks] = useState([]);
  const [propfirms, setPropfirms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [filters, setFilters] = useState(emptyFilters);
  const [editing, setEditing] = useState(null); // trade object or {} for new
  const [sharing, setSharing] = useState(null); // trade object being shared
  const [quick, setQuick] = useState(false); // quick-add form open
  const [help, setHelp] = useState(false); // shortcuts modal open
  const [theme, setTheme] = useState(() => localStorage.getItem('pug_theme') || 'dark');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pug_theme', theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  // Global keyboard shortcuts.
  useEffect(() => {
    function onKey(e) {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      if (e.key === 'Escape') { setHelp(false); setQuick(false); setSharing(null); setEditing(null); return; }
      if (!user || typing) return;
      if (e.key === '?') { e.preventDefault(); setHelp((h) => !h); return; }
      if (editing || quick || sharing || help) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setEditing({}); }
      else if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); setQuick(true); }
      else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); toggleTheme(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, editing, quick, sharing, help, toggleTheme]);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const status = await api.authStatus();
        if (!status.hasUsers) {
          setNeedsRegister(true);
          return;
        }
        const me = await api.me();
        setUser(me);
      } catch {
        // not logged in; the login screen will be shown
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      const t = await api.listTrades();
      setTrades(t);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlaybooks = useCallback(async () => {
    try { setPlaybooks(await api.listPlaybooks()); } catch { /* ignore */ }
  }, []);

  const loadPropfirms = useCallback(async () => {
    try { setPropfirms(await api.listPropfirms()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (user) { load(); loadPlaybooks(); loadPropfirms(); } }, [user, load, loadPlaybooks, loadPropfirms]);

  function onAuthed(u) {
    setUser(u);
    setNeedsRegister(false);
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setTrades([]);
    setPropfirms([]);
    setLoading(true);
  }

  const filtered = useMemo(() => trades.filter((t) => {
    if (filters.symbol && t.symbol !== filters.symbol) return false;
    if (filters.setup && t.setup !== filters.setup) return false;
    if (filters.model && t.model !== filters.model) return false;
    if (filters.entryModel && t.entryModel !== filters.entryModel) return false;
    if (filters.newsEvent && t.newsEvent !== filters.newsEvent) return false;
    if (filters.grade && t.grade !== filters.grade) return false;
    if (filters.accountType && t.accountType !== filters.accountType) return false;
    if (filters.playbook && t.playbookId !== filters.playbook) return false;
    if (filters.session && t.session !== filters.session) return false;
    if (filters.direction && t.direction !== filters.direction) return false;
    if (filters.from && (t.date || '') < filters.from) return false;
    if (filters.to && (t.date || '') > filters.to) return false;
    return true;
  }), [trades, filters]);

  async function del(t) {
    if (!confirm(`Delete this ${t.symbol} trade from ${t.date}?`)) return;
    try {
      await api.deleteTrade(t.id);
      notify('Trade deleted');
      load();
    } catch (e) { notify('Delete failed: ' + e.message); }
  }

  const showFilters = tab !== 'data' && tab !== 'market';

  if (!authChecked) return <div className="empty-state">Loading…</div>;
  if (!user) return <Login mode={needsRegister ? 'register' : 'login'} onAuthed={onAuthed} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src="/pugzilla-logo.jpg" alt="Pugzilla" className="brand-logo" /> Pug<span className="z">zilla</span> <span className="full muted" style={{ fontWeight: 400, fontSize: 13 }}>Journal</span></div>
        <nav className="nav">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="spacer" />
        <button className="icon-btn" onClick={() => setQuick(true)} title="Quick add (Q)">⚡</button>
        <button className="icon-btn" onClick={toggleTheme} title="Toggle theme (D)">{theme === 'dark' ? '☀' : '☾'}</button>
        <button className="icon-btn" onClick={() => setHelp(true)} title="Shortcuts (?)">?</button>
        <button className="btn" onClick={() => setEditing({})}>+ New trade</button>
        <button className="btn ghost" onClick={logout} title="Log out">{user.username} · Log out</button>
      </header>

      <main className="content">
        {error && <div className="card" style={{ borderColor: 'var(--neg)', marginBottom: 16 }}>
          Could not reach the server: {error}. Make sure the backend is running.
        </div>}
        {loading ? <div className="empty-state">Loading…</div> : (
          <>
            {showFilters && <Filters trades={trades} playbooks={playbooks} filters={filters} setFilters={setFilters} />}
            {tab === 'dashboard' && <Dashboard trades={filtered} />}
            {tab === 'trades' && <TradesView trades={filtered} playbooks={playbooks} onEdit={setEditing} onDelete={del} onShare={setSharing} />}
            {tab === 'calendar' && <CalendarView trades={filtered} playbooks={playbooks} onEditTrade={setEditing} notify={notify} />}
            {tab === 'insights' && <InsightsView trades={filtered} />}
            {tab === 'analysis' && <AnalysisView trades={filtered} playbooks={playbooks} />}
            {tab === 'psychology' && <PsychologyView trades={filtered} />}
            {tab === 'playbook' && <PlaybookView trades={trades} notify={notify} onChanged={loadPlaybooks} />}
            {tab === 'accounts' && <AccountsView trades={trades} propfirms={propfirms} onUpdate={loadPropfirms} notify={notify} />}
            {tab === 'market' && <MarketJournalView notify={notify} trades={trades} />}
            {tab === 'study' && <StudyView notify={notify} />}
            {tab === 'data' && <DataView trades={trades} onChanged={load} notify={notify} />}
          </>
        )}
      </main>

      {editing && (
        <TradeForm
          trade={editing.id ? editing : null}
          playbooks={playbooks}
          propfirms={propfirms}
          onClose={() => setEditing(null)}
          onSaved={() => load()}
          notify={notify}
        />
      )}
      {sharing && <ShareCard trade={sharing} onClose={() => setSharing(null)} />}
      {quick && <QuickTradeForm onClose={() => setQuick(false)} onSaved={() => load()} notify={notify} />}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {toast && <div className="toast">{toast}</div>}
      <footer className="app-footer">Pugzilla v{APP_VERSION} · build {__BUILD_SHA__} ({__BUILD_DATE__})</footer>
    </div>
  );
}
