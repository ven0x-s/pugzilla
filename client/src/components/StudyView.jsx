import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';
import StudyShareCard from './StudyShareCard.jsx';

const blank = () => ({ title: '', category: '', tags: [], content: '', screenshots: [] });

function Editor({ initial, onClose, onSaved, notify }) {
  const [n, setN] = useState(() => ({ ...blank(), ...(initial || {}) }));
  const [tagText, setTagText] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const isEditing = !!n.id;
  const set = (k, v) => setN((p) => ({ ...p, [k]: v }));
  const tags = Array.isArray(n.tags) ? n.tags : [];

  function addTag() {
    const t = tagText.trim();
    if (!t) return;
    if (!tags.includes(t)) set('tags', [...tags, t]);
    setTagText('');
  }

  async function save() {
    if (!n.title.trim()) return notify('Title is required');
    setSaving(true);
    try {
      const payload = { title: n.title, category: n.category, tags, content: n.content };
      const saved = isEditing ? await api.updateStudy(n.id, payload) : await api.createStudy(payload);
      if (!isEditing) { setN({ ...saved }); notify('Note saved. You can now add screenshots.'); }
      else notify('Note updated');
      onSaved();
    } catch (err) { notify('Error: ' + err.message); }
    finally { setSaving(false); }
  }

  async function upload(ev) {
    const files = Array.from(ev.target.files || []);
    if (!files.length || !n.id) return;
    const label = prompt('Label for this screenshot? (optional)') || '';
    try {
      for (const file of files) {
        const shot = await api.uploadStudyShot(n.id, file, label);
        setN((p) => ({ ...p, screenshots: [...(p.screenshots || []), shot] }));
      }
      onSaved();
    } catch (err) { notify('Upload failed: ' + err.message); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function delShot(sid) {
    await api.deleteStudyShot(n.id, sid);
    setN((p) => ({ ...p, screenshots: p.screenshots.filter((s) => s.id !== sid) }));
    onSaved();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Edit note' : 'New study note'}</h2>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="field full">
              <label>Title</label>
              <input value={n.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Silver Bullet — the 3 macros" autoFocus />
            </div>
            <div className="field">
              <label>Category</label>
              <input value={n.category || ''} onChange={(e) => set('category', e.target.value)} placeholder="e.g. ICT, Risk, Psychology" />
            </div>
            <div className="field full">
              <label>Tags</label>
              <div className="chip-row">
                {tags.map((t) => (
                  <button key={t} type="button" className="chip active" onClick={() => set('tags', tags.filter((x) => x !== t))}>{t} ×</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input value={tagText} onChange={(e) => setTagText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Add a tag…" />
                <button type="button" className="btn ghost" onClick={addTag}>Add</button>
              </div>
            </div>
            <div className="field full">
              <label>Content (concept, notes, rules — Substack style)</label>
              <textarea rows="12" value={n.content || ''} onChange={(e) => set('content', e.target.value)}
                placeholder="Write the concept out in full. What it is, when it forms, entry/exit, examples, mistakes to avoid…" />
            </div>
            <div className="field full">
              <label>Screenshots</label>
              {!isEditing && <div className="hint">Save first, then add chart screenshots.</div>}
              {isEditing && (
                <>
                  <div className="shots">
                    {(n.screenshots || []).map((s) => (
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
          <span className="hint">{isEditing ? 'Editing note' : 'New note'}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn ghost" onClick={onClose}>Close</button>
            <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : (isEditing ? 'Save changes' : 'Save note')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudyView({ notify }) {
  const [notes, setNotes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [reading, setReading] = useState(null);
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try { setNotes(await api.listStudy()); } catch (e) { notify('Could not load study notes: ' + e.message); }
    finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, []);

  async function del(note) {
    if (!confirm(`Delete "${note.title}"?`)) return;
    try { await api.deleteStudy(note.id); notify('Note deleted'); if (reading?.id === note.id) setReading(null); load(); }
    catch (e) { notify('Delete failed: ' + e.message); }
  }

  const query = q.trim().toLowerCase();
  const filtered = !query ? notes : notes.filter((n) =>
    [n.title, n.category, n.content, ...(n.tags || [])].join(' ').toLowerCase().includes(query));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="section-title" style={{ margin: 0 }}>Study &amp; Learn</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes / tags…" style={{ minWidth: 200 }} />
          <button className="btn" onClick={() => setEditing({})}>+ New note</button>
        </div>
      </div>

      {loaded && !notes.length && (
        <div className="empty-state">No study notes yet. Capture new ICT concepts, rules and ideas — write them out like a Substack post and share them.</div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        {filtered.map((n) => (
          <div className="card" key={n.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <h3 style={{ margin: 0, cursor: 'pointer' }} onClick={() => setReading(n)}>{n.title}</h3>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn ghost sm" onClick={() => setSharing(n)}>Share</button>
                <button className="btn ghost sm" onClick={() => setEditing(n)}>Edit</button>
                <button className="btn danger sm" onClick={() => del(n)}>Del</button>
              </div>
            </div>
            <div style={{ marginTop: 6 }}>
              {n.category && <span className="tag">{n.category}</span>}{' '}
              {(n.tags || []).map((t) => <span key={t} className="tag" style={{ marginRight: 4 }}>{t}</span>)}
            </div>
            {n.content && (
              <p style={{ marginTop: 10, fontSize: 14, whiteSpace: 'pre-wrap', color: 'var(--text-dim)',
                display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {n.content}
              </p>
            )}
            {(n.screenshots || []).length > 0 && (
              <div className="shots" style={{ marginTop: 8 }}>
                {n.screenshots.slice(0, 4).map((s) => <div className="shot" key={s.id}><img src={'/uploads/' + s.filename} alt={s.label} onClick={() => setReading(n)} /></div>)}
              </div>
            )}
            <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setReading(n)}>Read →</button>
          </div>
        ))}
      </div>

      {editing && (
        <Editor initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={load} notify={notify} />
      )}

      {reading && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setReading(null)}>
          <div className="modal">
            <div className="modal-head">
              <h2 style={{ margin: 0 }}>{reading.title}</h2>
              <button className="close-x" onClick={() => setReading(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 10 }}>
                {reading.category && <span className="tag">{reading.category}</span>}{' '}
                {(reading.tags || []).map((t) => <span key={t} className="tag" style={{ marginRight: 4 }}>{t}</span>)}
              </div>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.6 }}>{reading.content}</p>
              {(reading.screenshots || []).length > 0 && (
                <div className="shots" style={{ marginTop: 12 }}>
                  {reading.screenshots.map((s) => <div className="shot" key={s.id}><img src={'/uploads/' + s.filename} alt={s.label} /></div>)}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <span className="hint">Updated {reading.updatedAt ? new Date(reading.updatedAt).toLocaleDateString() : ''}</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn ghost" onClick={() => { setSharing(reading); }}>Share</button>
                <button className="btn" onClick={() => { setEditing(reading); setReading(null); }}>Edit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sharing && <StudyShareCard note={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}
