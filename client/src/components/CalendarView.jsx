import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtUSD, fmtNum, pnlClass } from '../helpers.js';
import JournalEditor from './JournalEditor.jsx';
import JournalShareCard from './JournalShareCard.jsx';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Detail popup for a single day: its trades (clickable) + the market note (read / write / share).
function DayModal({ iso, trades, entry, playbooks, onClose, onEditTrade, onWriteJournal, onEditJournal, onShareJournal }) {
  const pbName = (id) => (playbooks.find((p) => p.id === id) || {}).name || '';
  const dayTrades = trades
    .filter((t) => t.date === iso)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const total = dayTrades.reduce((s, t) => s + (t.resultDollars || 0), 0);
  const d = new Date(iso + 'T00:00:00');
  const nice = isNaN(d) ? iso : d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{nice}</h2>
            {dayTrades.length > 0 && (
              <div className={'hint ' + pnlClass(total)} style={{ marginTop: 2 }}>
                {fmtUSD(total)} · {dayTrades.length} trade{dayTrades.length === 1 ? '' : 's'}
              </div>
            )}
          </div>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="section-title" style={{ marginTop: 0 }}>Trades</div>
          {dayTrades.length === 0 ? (
            <div className="hint">No trades logged on this day.</div>
          ) : (
            <div className="table-wrap">
              <table style={{ width: '100%' }}>
                <tbody>
                  {dayTrades.map((t) => (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onEditTrade(t)}>
                      <td>{t.time || '-'}</td>
                      <td><span className="tag">{t.symbol}</span></td>
                      <td><span className={'pill ' + t.direction}>{t.direction === 'short' ? 'Short' : 'Long'}</span></td>
                      <td className={'num ' + pnlClass(t.resultDollars)}>{fmtUSD(t.resultDollars)}</td>
                      <td className="num">{t.rMultiple == null ? '' : fmtNum(t.rMultiple, 2) + 'R'}</td>
                      <td>{pbName(t.playbookId) || t.setup || ''}</td>
                      <td style={{ textAlign: 'right' }}><span className="hint">open ›</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="section-title">Market note</div>
          {entry ? (
            <div className="card" style={{ marginTop: 0 }}>
              <div style={{ marginBottom: 6 }}>
                {entry.bias && <span className="tag">{entry.bias}</span>}{' '}
                <span className={'tag ' + (entry.traded ? '' : 'news')}>{entry.traded ? 'Traded' : 'No trades'}</span>
              </div>
              {entry.observations && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop: 8 }}>{entry.observations}</p>}
              {entry.reason && <p className="hint" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}><b>Why:</b> {entry.reason}</p>}
              {(entry.screenshots || []).length > 0 && (
                <div className="shots" style={{ marginTop: 8 }}>
                  {entry.screenshots.map((s) => <div className="shot" key={s.id}><img src={'/uploads/' + s.filename} alt={s.label} /></div>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn ghost sm" onClick={() => onShareJournal(entry)}>Share</button>
                <button className="btn ghost sm" onClick={() => onEditJournal(entry)}>Edit note</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="hint" style={{ marginBottom: 8 }}>No market note for this day yet.</div>
              <button className="btn" onClick={() => onWriteJournal(iso)}>+ Write journal for this day</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CalendarView({ trades, playbooks = [], onEditTrade, notify }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [entries, setEntries] = useState([]);
  const [openDay, setOpenDay] = useState(null);       // iso string
  const [editingJournal, setEditingJournal] = useState(null); // entry | {fixedDate}
  const [sharingDay, setSharingDay] = useState(null); // entry

  const loadJournal = async () => {
    try { setEntries(await api.listJournal()); } catch { /* ignore */ }
  };
  useEffect(() => { loadJournal(); }, []);

  const entryFor = (iso) => entries.find((e) => e.date === iso) || null;

  // aggregate P&L per day
  const byDay = {};
  const newsByDay = {};
  for (const t of trades) {
    if (!t.date) continue;
    if (t.newsEvent) (newsByDay[t.date] = newsByDay[t.date] || new Set()).add(t.newsEvent);
    if (t.resultDollars == null) continue;
    const d = byDay[t.date] || { pnl: 0, count: 0 };
    d.pnl += t.resultDollars; d.count += 1;
    byDay[t.date] = d;
  }

  const first = new Date(cursor.y, cursor.m, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const monthName = first.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ d, iso, data: byDay[iso] });
  }

  let monthTotal = 0, monthDays = 0;
  Object.entries(byDay).forEach(([iso, v]) => {
    if (iso.startsWith(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`)) { monthTotal += v.pnl; monthDays++; }
  });

  const shift = (delta) => setCursor((c) => {
    let m = c.m + delta, y = c.y;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    return { y, m };
  });

  return (
    <div>
      <div className="cal-head">
        <button className="btn ghost sm" onClick={() => shift(-1)}>← Prev</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{monthName}</div>
          <div className={'hint ' + pnlClass(monthTotal)}>{fmtUSD(monthTotal)} · {monthDays} trading days</div>
        </div>
        <button className="btn ghost sm" onClick={() => shift(1)}>Next →</button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="cal-cell empty" />;
          const cls = c.data ? (c.data.pnl > 0 ? 'win' : c.data.pnl < 0 ? 'loss' : '') : '';
          const newsSet = newsByDay[c.iso];
          const news = newsSet ? Array.from(newsSet).join(', ') : '';
          const hasNote = !!entryFor(c.iso);
          return (
            <div key={i} className={'cal-cell ' + cls} title={news} style={{ cursor: 'pointer' }} onClick={() => setOpenDay(c.iso)}>
              <div className="d">
                {c.d}
                {news && <span className="news-dot" />}
                {hasNote && <span className="note-dot" title="Has a market note" />}
              </div>
              {c.data && <>
                <div className={'p ' + pnlClass(c.data.pnl)}>{fmtUSD(c.data.pnl)}</div>
                <div className="c">{c.data.count} trade{c.data.count > 1 ? 's' : ''}</div>
              </>}
            </div>
          );
        })}
      </div>

      {openDay && (
        <DayModal
          iso={openDay}
          trades={trades}
          entry={entryFor(openDay)}
          playbooks={playbooks}
          onClose={() => setOpenDay(null)}
          onEditTrade={(t) => onEditTrade && onEditTrade(t)}
          onWriteJournal={(iso) => setEditingJournal({ fixedDate: iso })}
          onEditJournal={(e) => setEditingJournal(e)}
          onShareJournal={(e) => setSharingDay(e)}
        />
      )}

      {editingJournal && (
        <JournalEditor
          initial={editingJournal.id ? editingJournal : null}
          fixedDate={editingJournal.fixedDate || (editingJournal.id ? null : openDay)}
          onClose={() => setEditingJournal(null)}
          onSaved={loadJournal}
          notify={notify}
        />
      )}

      {sharingDay && <JournalShareCard entry={sharingDay} trades={trades} onClose={() => setSharingDay(null)} />}
    </div>
  );
}
