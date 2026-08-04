import React, { useState, useRef } from 'react';
import { api } from '../api.js';
import { DAILY_BIAS, todayISO } from '../helpers.js';

const blank = () => ({ date: todayISO(), bias: '', traded: false, observations: '', reason: '', screenshots: [] });

// Create/edit a market-journal day note. Reused by the Market tab and the Calendar day view.
export default function JournalEditor({ initial, fixedDate, onClose, onSaved, notify }) {
  const [e, setE] = useState(() => ({ ...blank(), ...(initial || {}), ...(fixedDate ? { date: fixedDate } : {}) }));
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const isEditing = !!e.id;
  const set = (k, v) => setE((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!e.date) return notify('Date is required');
    setSaving(true);
    try {
      const payload = { date: e.date, bias: e.bias, traded: e.traded, observations: e.observations, reason: e.reason };
      const saved = isEditing ? await api.updateJournal(e.id, payload) : await api.createJournal(payload);
      if (!isEditing) { setE({ ...saved }); notify('Entry saved. You can now add screenshots.'); }
      else notify('Entry updated');
      onSaved(saved);
    } catch (err) { notify('Error: ' + err.message); }
    finally { setSaving(false); }
  }

  async function upload(ev) {
    const files = Array.from(ev.target.files || []);
    if (!files.length || !e.id) return;
    const label = prompt('Label for this screenshot? (optional)') || '';
    try {
      for (const file of files) {
        const shot = await api.uploadJournalShot(e.id, file, label);
        setE((p) => ({ ...p, screenshots: [...(p.screenshots || []), shot] }));
      }
      onSaved();
    } catch (err) { notify('Upload failed: ' + err.message); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function delShot(sid) {
    await api.deleteJournalShot(e.id, sid);
    setE((p) => ({ ...p, screenshots: p.screenshots.filter((s) => s.id !== sid) }));
    onSaved();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Edit market note' : 'New market note'}</h2>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="field">
              <label>Date</label>
              <input type="date" value={e.date || ''} onChange={(ev) => set('date', ev.target.value)} disabled={!!fixedDate} />
            </div>
            <div className="field">
              <label>Bias</label>
              <select value={e.bias || ''} onChange={(ev) => set('bias', ev.target.value)}>
                <option value="">-</option>
                {DAILY_BIAS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Took trades?</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                <input type="checkbox" style={{ width: 18, height: 18 }} checked={!!e.traded} onChange={(ev) => set('traded', ev.target.checked)} />
                <span className="hint">{e.traded ? 'Yes' : 'No trades'}</span>
              </label>
            </div>
            <div className="field full">
              <label>What I saw</label>
              <textarea rows="4" value={e.observations || ''} onChange={(ev) => set('observations', ev.target.value)} placeholder="Price action, key levels, HTF context, liquidity, news…" />
            </div>
            <div className="field full">
              <label>Why I did / didn't trade</label>
              <textarea rows="3" value={e.reason || ''} onChange={(ev) => set('reason', ev.target.value)} placeholder="e.g. no A+ setup, choppy, waited for confirmation that never came…" />
            </div>
            <div className="field full">
              <label>Screenshots</label>
              {!isEditing && <div className="hint">Save first, then add screenshots.</div>}
              {isEditing && (
                <>
                  <div className="shots">
                    {(e.screenshots || []).map((s) => (
                      <div className="shot" key={s.id}>
                        <img src={'/uploads/' + s.filename} alt={s.label} />
                        <button className="del" onClick={() => delShot(s.id)}>×</button>
                        {s.label && <div className="cap">{s.label}</div>}
                      </div>
                    ))}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" multiple onChange={upload} style={{ marginTop: 10 }} />
                </>
              )}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <span className="hint">{isEditing ? 'Editing entry' : 'New entry'}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn ghost" onClick={onClose}>Close</button>
            <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : (isEditing ? 'Save changes' : 'Save note')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
