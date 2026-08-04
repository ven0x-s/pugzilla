import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import JournalShareCard from './JournalShareCard.jsx';
import JournalEditor from './JournalEditor.jsx';

export default function MarketJournalView({ notify, trades = [] }) {
  const [entries, setEntries] = useState([]);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try { setEntries(await api.listJournal()); } catch (e) { notify('Could not load journal: ' + e.message); }
    finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, []);

  async function del(en) {
    if (!confirm(`Delete the market note of ${en.date}?`)) return;
    try { await api.deleteJournal(en.id); notify('Entry deleted'); load(); }
    catch (e) { notify('Delete failed: ' + e.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ margin: 0 }}>Market journal</div>
        <button className="btn" onClick={() => setEditing({})}>+ New note</button>
      </div>

      {loaded && !entries.length && (
        <div className="empty-state">No market notes yet. Log what you saw on days you didn't trade (or did).</div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
        {entries.map((en) => (
          <div className="card" key={en.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ marginBottom: 4 }}>{en.date}</h3>
                {en.bias && <span className="tag">{en.bias}</span>}{' '}
                <span className={'tag ' + (en.traded ? '' : 'news')}>{en.traded ? 'Traded' : 'No trades'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn ghost sm" onClick={() => setSharing(en)}>Share</button>
                <button className="btn ghost sm" onClick={() => setEditing(en)}>Edit</button>
                <button className="btn danger sm" onClick={() => del(en)}>Del</button>
              </div>
            </div>
            {en.observations && <p style={{ marginTop: 10, fontSize: 14, whiteSpace: 'pre-wrap' }}>{en.observations}</p>}
            {en.reason && <p className="hint" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}><b>Why:</b> {en.reason}</p>}
            {(en.screenshots || []).length > 0 && (
              <div className="shots" style={{ marginTop: 8 }}>
                {en.screenshots.map((s) => <div className="shot" key={s.id}><img src={'/uploads/' + s.filename} alt={s.label} /></div>)}
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <JournalEditor
          initial={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={load}
          notify={notify}
        />
      )}
      {sharing && <JournalShareCard entry={sharing} trades={trades} onClose={() => setSharing(null)} />}
    </div>
  );
}
