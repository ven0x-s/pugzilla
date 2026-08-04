import React, { useState, useMemo, useRef, useEffect } from 'react';
import { api } from '../api.js';
import {
  previewMetrics, defaultPointValue, fmtUSD, fmtR, fmtNum, SESSIONS, EMOTIONS, todayISO,
  ICT_SETUPS, DRAW_ON_LIQUIDITY, ACCOUNT_TYPES,
  isTradingViewUrl, setupTagsOf, accountIdsOf,
} from '../helpers.js';

const CUSTOM_SETUPS_KEY = 'pug_custom_setups';
function loadCustomSetups() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_SETUPS_KEY)) || []; } catch { return []; }
}
function saveCustomSetups(list) {
  try { localStorage.setItem(CUSTOM_SETUPS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// Custom assets (e.g. BTC, ETH) with their own $/point, remembered in localStorage.
const CUSTOM_ASSETS_KEY = 'pug_custom_assets';
function loadCustomAssets() {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_ASSETS_KEY)) || [];
    return Array.isArray(list) ? list.filter((a) => a && a.symbol) : [];
  } catch { return []; }
}
function saveCustomAssets(list) {
  try { localStorage.setItem(CUSTOM_ASSETS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

const QUICK_SYMBOLS = ['NQ', 'ES', 'MNQ', 'MES'];
const QUICK_NEWS = ['CPI', 'NFP', 'FOMC', 'PMI', 'PCE', 'GDP', 'Retail Sales', 'Jobless Claims', 'ISM', 'Fed speech'];
const QUICK_EMOTIONS = ['FOMO', 'Patient', 'Revenge trade', 'Confident', 'Anxious', 'Greedy', 'Bored', 'Disciplined'];
const MISTAKES = [
  'Moved stop loss too early', 'Position too large (overleveraged)', 'Did not follow strategy',
  'Entered too early (FOMO entry)', 'Took profit too early', 'Let a loss run too long',
  'No stop loss set', 'Revenge trade after a loss', 'Overtraded (too many trades)', 'Traded against HTF bias',
];

// Dropdown with a quick-pick list plus a free-text "Other…" fallback,
// so a custom value (e.g. a custom emotion) can still be typed in.
function ChoiceField({ label, value, options, onChange, placeholder, full }) {
  const [customMode, setCustomMode] = useState(!!value && !options.includes(value));
  const selectValue = customMode ? '__other__' : (value || '');
  return (
    <div className={'field' + (full ? ' full' : '')}>
      <label>{label}</label>
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === '__other__') { setCustomMode(true); onChange(''); }
          else { setCustomMode(false); onChange(e.target.value); }
        }}
      >
        <option value="">- none -</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__other__">Other…</option>
      </select>
      {customMode && (
        <input
          autoFocus value={value || ''} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}

const blank = () => ({
  date: todayISO(), time: '', exitTime: '', symbol: 'NQ', direction: 'long',
  entry: '', exit: '', exits: [], contracts: '1', stopLoss: '', takeProfit: '',
  pointValue: String(defaultPointValue('NQ')), commissions: '', pnlOverride: '', setup: '',
  model: '', entryModel: '', newsEvent: '', grade: '',
  emotionEntry: '', emotionExit: '', mistake: '',
  session: 'NY', notes: '', rating: '', planFollowed: false, emotion: '', mistakes: '',
  setupTags: [], drawOnLiquidity: '', narrative: '',
  tvUrl: '', accountType: '', propFirm: '', playbookId: '', rulesFollowed: true, ruleBroken: '', accountIds: [],
  screenshots: [],
});

// Multi-select chips for ICT setups + free-text custom labels remembered in localStorage.
function SetupTagsField({ value, onChange, tagRefs }) {
  const [custom, setCustom] = useState(() => loadCustomSetups());
  const [text, setText] = useState('');
  const selected = Array.isArray(value) ? value : [];
  const all = [...ICT_SETUPS, ...custom.filter((c) => !ICT_SETUPS.includes(c))];

  function toggle(tag) {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  }
  function addCustom() {
    const t = text.trim();
    if (!t) return;
    if (!all.includes(t)) { const next = [...custom, t]; setCustom(next); saveCustomSetups(next); }
    if (!selected.includes(t)) onChange([...selected, t]);
    setText('');
  }
  return (
    <div className="field full">
      <label>Setup tags (ICT)</label>
      <div className="chip-row">
        {all.map((tag, i) => (
          <button
            key={tag} type="button"
            ref={(el) => { if (tagRefs) tagRefs.current[i] = () => toggle(tag); }}
            className={'chip' + (selected.includes(tag) ? ' active' : '')}
            onClick={() => toggle(tag)}
          >{i < 9 ? <span className="chip-idx">{i + 1}</span> : null}{tag}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="Add your own setup label…"
        />
        <button type="button" className="btn ghost" onClick={addCustom}>Add</button>
      </div>
    </div>
  );
}

export default function TradeForm({ trade, playbooks = [], propfirms = [], onClose, onSaved, notify }) {
  const [form, setForm] = useState(() => (trade ? normalize(trade) : blank()));
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef();
  const tagRefs = useRef({});
  const saveRef = useRef();
  const isEditing = !!form.id;

  const [customAssets, setCustomAssets] = useState(() => loadCustomAssets());
  const [newAsset, setNewAsset] = useState('');
  const [newAssetPv, setNewAssetPv] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);

  const preview = useMemo(() => previewMetrics(form), [form]);
  const tvValid = isTradingViewUrl(form.tvUrl);
  const exits = Array.isArray(form.exits) ? form.exits : [];
  const hasPartials = exits.some((p) => p.qty !== '' || p.price !== '');
  const allSymbols = [...QUICK_SYMBOLS, ...customAssets.map((a) => a.symbol).filter((s) => !QUICK_SYMBOLS.includes(s))];

  // Point value for a symbol: custom asset override, else the built-in default.
  const pvFor = (sym) => {
    const a = customAssets.find((x) => x.symbol === String(sym || '').toUpperCase());
    return a ? a.pointValue : defaultPointValue(sym);
  };

  function addAsset() {
    const sym = newAsset.trim().toUpperCase();
    if (!sym) return notify('Enter an asset symbol');
    const pv = Number(newAssetPv) || defaultPointValue(sym);
    const next = [...customAssets.filter((a) => a.symbol !== sym), { symbol: sym, pointValue: pv }];
    setCustomAssets(next); saveCustomAssets(next);
    setNewAsset(''); setNewAssetPv('');
    setForm((f) => ({ ...f, symbol: sym, pointValue: String(pv) }));
  }

  function setExit(i, k, v) {
    setForm((f) => ({ ...f, exits: f.exits.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  }
  function addExit() {
    setForm((f) => ({ ...f, exits: [...(f.exits || []), { qty: '', price: '' }] }));
  }
  function removeExit(i) {
    setForm((f) => ({ ...f, exits: f.exits.filter((_, j) => j !== i) }));
  }

  // Digit keys 1-9 quick-toggle setup tags; S saves — unless typing in a field.
  useEffect(() => {
    function onKey(e) {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      if (typing) return;
      if (e.key >= '1' && e.key <= '9') {
        const fn = tagRefs.current[Number(e.key) - 1];
        if (fn) { e.preventDefault(); fn(); }
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (saveRef.current) saveRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleAccount(id) {
    setForm((f) => {
      const cur = Array.isArray(f.accountIds) ? f.accountIds : [];
      return { ...f, accountIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  }

  function set(k, v) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'symbol' && (!f.pointValue || f.pointValue === String(pvFor(f.symbol)))) {
        next.pointValue = String(pvFor(v));
      }
      return next;
    });
  }

  async function save() {
    if (!form.date) return notify('Date is required');
    if (!isTradingViewUrl(form.tvUrl)) return notify('TradingView URL must be a tradingview.com link');
    setSaving(true);
    try {
      const payload = stripComputed(form);
      let saved;
      if (isEditing) saved = await api.updateTrade(form.id, payload);
      else saved = await api.createTrade(payload);
      onSaved(saved);
      if (!isEditing) {
        // keep modal open in edit mode so screenshots can be attached
        setForm(normalize(saved));
        notify('Trade saved. You can now attach screenshots.');
      } else {
        notify('Trade updated');
      }
    } catch (e) {
      notify('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  async function upload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !form.id) return;
    const label = prompt('Label for these screenshot(s)? (e.g. Entry, Exit)') || '';
    try {
      for (const file of files) {
        const shot = await api.uploadScreenshot(form.id, file, label);
        setForm((f) => ({ ...f, screenshots: [...(f.screenshots || []), shot] }));
      }
      onSaved(); // refresh list
      notify('Screenshot added');
    } catch (err) {
      notify('Upload failed: ' + err.message);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function delShot(sid) {
    await api.deleteScreenshot(form.id, sid);
    setForm((f) => ({ ...f, screenshots: f.screenshots.filter((s) => s.id !== sid) }));
    onSaved();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Edit trade' : 'New trade'}</h2>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.date || ''} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div className="field">
              <label>Time (entry)</label>
              <input type="time" value={form.time || ''} onChange={(e) => set('time', e.target.value)} />
            </div>
            <div className="field">
              <label>Time (exit)</label>
              <input type="time" value={form.exitTime || ''} onChange={(e) => set('exitTime', e.target.value)} />
            </div>
            <div className="field">
              <label>Session</label>
              <select value={form.session || ''} onChange={(e) => set('session', e.target.value)}>
                <option value="">-</option>
                {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Symbol</label>
              <div className="seg" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
                {allSymbols.map((s) => (
                  <button key={s} className={form.symbol === s ? 'active' : ''} type="button" onClick={() => set('symbol', s)}>{s}</button>
                ))}
              </div>
              <input value={form.symbol || ''} onChange={(e) => set('symbol', e.target.value.toUpperCase())} placeholder="Other symbol" />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  value={newAsset} onChange={(e) => setNewAsset(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAsset(); } }}
                  placeholder="New asset (e.g. BTC)" style={{ flex: 1, minWidth: 0 }}
                />
                <input
                  type="number" step="any" value={newAssetPv} onChange={(e) => setNewAssetPv(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAsset(); } }}
                  placeholder="$/pt" style={{ width: 70 }}
                />
                <button type="button" className="btn ghost" onClick={addAsset}>+ Add</button>
              </div>
            </div>
            <div className="field">
              <label>Direction</label>
              <div className="seg">
                <button type="button" className={form.direction === 'long' ? 'active' : ''} onClick={() => set('direction', 'long')}>Long</button>
                <button type="button" className={form.direction === 'short' ? 'active' : ''} onClick={() => set('direction', 'short')}>Short</button>
              </div>
            </div>
            <div className="field">
              <label>Contracts</label>
              <input type="number" min="0" step="1" value={form.contracts || ''} onChange={(e) => set('contracts', e.target.value)} />
            </div>

            <div className="field">
              <label>Entry price</label>
              <input type="number" step="any" value={form.entry || ''} onChange={(e) => set('entry', e.target.value)} />
            </div>
            <div className="field">
              <label>Exit price</label>
              <input
                type="number" step="any" value={hasPartials ? '' : (form.exit || '')}
                onChange={(e) => set('exit', e.target.value)}
                disabled={hasPartials}
                placeholder={hasPartials ? `avg ${fmtNum(preview.avgExit, 2)}` : ''}
              />
              {hasPartials && <div className="hint">Auto: weighted avg of partials</div>}
            </div>
            <div className="field">
              <label>Point value ($)</label>
              <input type="number" step="any" value={form.pointValue || ''} onChange={(e) => set('pointValue', e.target.value)} />
            </div>

            <div className="field full">
              <label>Partial exits (scale-out)</label>
              {exits.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    type="number" min="0" step="1" value={p.qty} style={{ width: 90 }}
                    onChange={(e) => setExit(i, 'qty', e.target.value)} placeholder="Qty"
                  />
                  <span className="hint">@</span>
                  <input
                    type="number" step="any" value={p.price} style={{ width: 150 }}
                    onChange={(e) => setExit(i, 'price', e.target.value)} placeholder="Price"
                  />
                  <button type="button" className="btn ghost" onClick={() => removeExit(i)}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="btn ghost" onClick={addExit}>+ Add partial</button>
                {hasPartials && preview.avgExit != null && (
                  <span className="hint">
                    {preview.exitQty} contract{preview.exitQty === 1 ? '' : 's'} out · avg exit {fmtNum(preview.avgExit, 2)}
                  </span>
                )}
              </div>
              {!exits.length && <div className="hint">Scaled out in pieces? Add each partial (e.g. 2 @ 29550, 1 @ 29600, 1 @ BE). Exit price and P&amp;L are computed from them.</div>}
            </div>

            <div className="field">
              <label>Stop loss</label>
              <input type="number" step="any" value={form.stopLoss || ''} onChange={(e) => set('stopLoss', e.target.value)} />
            </div>
            <div className="field">
              <label>Take profit</label>
              <input type="number" step="any" value={form.takeProfit || ''} onChange={(e) => set('takeProfit', e.target.value)} />
            </div>
            <div className="field">
              <label>Commissions ($)</label>
              <input type="number" step="any" value={form.commissions || ''} onChange={(e) => set('commissions', e.target.value)} />
            </div>

            <div className="field">
              <label>Setup / strategy</label>
              <input value={form.setup || ''} onChange={(e) => set('setup', e.target.value)} placeholder="e.g. ORB, Reversal" />
            </div>
            <ChoiceField
              label="Model (playbook)" value={form.model} options={playbooks.map((p) => p.name)}
              onChange={(v) => set('model', v)} placeholder="Custom model"
            />
            <div className="field">
              <label>Entry model</label>
              <input value={form.entryModel || ''} onChange={(e) => set('entryModel', e.target.value)} placeholder="e.g. FVG, OTE, Breaker" />
            </div>
            <div className="field">
              <label>Grade</label>
              <input value={form.grade || ''} onChange={(e) => set('grade', e.target.value)} placeholder="e.g. A, B+, 8/10" />
            </div>
            <ChoiceField
              label="News (red folder)" value={form.newsEvent} options={QUICK_NEWS}
              onChange={(v) => set('newsEvent', v)} placeholder="Custom news event"
            />
            <ChoiceField
              label="Emotion at entry" value={form.emotionEntry} options={QUICK_EMOTIONS}
              onChange={(v) => set('emotionEntry', v)} placeholder="Custom emotion"
            />
            <ChoiceField
              label="Emotion at exit" value={form.emotionExit} options={QUICK_EMOTIONS}
              onChange={(v) => set('emotionExit', v)} placeholder="Custom emotion"
            />
            <ChoiceField
              label="Mental mistake" value={form.mistake} options={MISTAKES}
              onChange={(v) => set('mistake', v)} placeholder="Custom mistake" full
            />
            <div className="field">
              <label>Emotion</label>
              <select value={form.emotion || ''} onChange={(e) => set('emotion', e.target.value)}>
                <option value="">-</option>
                {EMOTIONS.map((em) => <option key={em} value={em}>{em}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Plan followed</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                <input type="checkbox" style={{ width: 18, height: 18 }} checked={!!form.planFollowed} onChange={(e) => set('planFollowed', e.target.checked)} />
                <span className="hint">{form.planFollowed ? 'Yes' : 'No'}</span>
              </label>
            </div>
            <div className="field full">
              <label>Mistakes (comma separated)</label>
              <input value={form.mistakes || ''} onChange={(e) => set('mistakes', e.target.value)} placeholder="e.g. moved stop, chased entry" />
            </div>

            <div className="field full"><div className="form-section">ICT setup &amp; context</div></div>
            <SetupTagsField value={form.setupTags} onChange={(v) => set('setupTags', v)} tagRefs={tagRefs} />
            <ChoiceField
              label="Draw on liquidity" value={form.drawOnLiquidity} options={DRAW_ON_LIQUIDITY}
              onChange={(v) => set('drawOnLiquidity', v)} placeholder="Custom target"
            />
            <div className="field full">
              <label>Narrative</label>
              <textarea rows="2" value={form.narrative || ''} onChange={(e) => set('narrative', e.target.value)} placeholder="The story you were playing" />
            </div>
            <div className="field full">
              <label>TradingView chart URL</label>
              <input
                value={form.tvUrl || ''} onChange={(e) => set('tvUrl', e.target.value)}
                placeholder="https://www.tradingview.com/x/…"
                style={!tvValid ? { borderColor: 'var(--neg)' } : undefined}
              />
              {!tvValid && <div className="hint" style={{ color: 'var(--neg)' }}>Must be a tradingview.com link</div>}
              {tvValid && form.tvUrl && (
                <a className="hint" href={form.tvUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Open chart ↗</a>
              )}
            </div>

            <div className="field full"><div className="form-section">Account &amp; playbook</div></div>
            <div className="field">
              <label>Account type</label>
              <select value={form.accountType || ''} onChange={(e) => set('accountType', e.target.value)}>
                <option value="">-</option>
                {ACCOUNT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <ChoiceField
              label="Prop firm" value={form.propFirm} options={['Topstep', 'Apex', 'TPT', 'MFFU', 'FTMO']}
              onChange={(v) => set('propFirm', v)} placeholder="Custom firm"
            />
            <div className="field">
              <label>Playbook</label>
              <select value={form.playbookId || ''} onChange={(e) => set('playbookId', e.target.value)}>
                <option value="">- none -</option>
                {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field full">
              <label>Accounts (copy trader — tick every account that took this trade)</label>
              {propfirms.length === 0 ? (
                <div className="hint">No accounts yet — add them in the Accounts tab.</div>
              ) : (
                propfirms.map((f) => (
                  <div key={f.id} style={{ marginBottom: 8 }}>
                    <div className="hint" style={{ marginBottom: 4 }}>{f.name}</div>
                    <div className="chip-row">
                      {(f.accounts || []).map((a) => (
                        <button
                          key={a.id} type="button"
                          className={'chip' + ((form.accountIds || []).includes(a.id) ? ' active' : '')}
                          onClick={() => toggleAccount(a.id)}
                        >
                          {a.name}{a.type ? ` · ${a.type}` : ''}{a.status && a.status !== 'active' ? ` · ${a.status.toUpperCase()}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="field">
              <label>Rules followed</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                <input type="checkbox" style={{ width: 18, height: 18 }} checked={!!form.rulesFollowed} onChange={(e) => set('rulesFollowed', e.target.checked)} />
                <span className="hint">{form.rulesFollowed ? 'Yes' : 'No'}</span>
              </label>
            </div>
            {!form.rulesFollowed && (
              <div className="field full">
                <label>Which rule was broken?</label>
                <input value={form.ruleBroken || ''} onChange={(e) => set('ruleBroken', e.target.value)} placeholder="e.g. entered before confirmation" />
              </div>
            )}

            <div className="field full">
              <label>Notes</label>
              <textarea rows="2" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="computed" style={{ marginTop: 16 }}>
            <div><span>Result (points)</span><b className={cls(preview.points)}>{fmtNum(preview.points)}</b></div>
            <div><span>Result ($){form.pnlOverride !== '' && form.pnlOverride != null ? ' · manual' : ''}</span><b className={cls(preview.dollars)}>{fmtUSD(preview.dollars)}</b></div>
            <div><span>Risk ($)</span><b>{preview.risk == null ? '-' : fmtUSD(preview.risk)}</b></div>
            <div><span>R multiple</span><b className={cls(preview.r)}>{fmtR(preview.r)}</b></div>
          </div>

          {adjustOpen || (form.pnlOverride !== '' && form.pnlOverride != null) ? (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label className="hint" style={{ margin: 0 }}>Manual P&amp;L ($)</label>
              <input
                type="number" step="any" value={form.pnlOverride || ''} style={{ width: 150 }}
                onChange={(e) => set('pnlOverride', e.target.value)} placeholder="e.g. 123.45" autoFocus
              />
              <button type="button" className="btn ghost" onClick={() => { set('pnlOverride', ''); setAdjustOpen(false); }}>Clear</button>
              <span className="hint">Overrides the computed P&amp;L for this trade (use for crypto or corrections).</span>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn ghost" onClick={() => setAdjustOpen(true)}>Adjust trade log P&amp;L…</button>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <label className="hint">Screenshots (charts for entry / exit)</label>
            {!isEditing && <div className="hint">Save the trade first, then you can attach screenshots.</div>}
            {isEditing && (
              <>
                <div className="shots">
                  {(form.screenshots || []).map((s) => (
                    <div className="shot" key={s.id}>
                      <img src={'/uploads/' + s.filename} onClick={() => setLightbox('/uploads/' + s.filename)} alt={s.label} />
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
        <div className="modal-foot">
          <span className="hint">{isEditing ? 'Editing existing trade' : 'New entry'}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn ghost" onClick={onClose}>Close</button>
            <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : (isEditing ? 'Save changes' : 'Save trade')}</button>
          </div>
        </div>
      </div>
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="" /></div>
      )}
    </div>
  );
}

const cls = (n) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '');

function normalize(t) {
  const o = { ...t };
  ['entry', 'exit', 'contracts', 'stopLoss', 'takeProfit', 'pointValue', 'commissions', 'pnlOverride'].forEach((k) => {
    o[k] = t[k] == null ? '' : String(t[k]);
  });
  o.screenshots = t.screenshots || [];
  o.setupTags = setupTagsOf(t);
  o.accountIds = accountIdsOf(t);
  o.exits = Array.isArray(t.exits)
    ? t.exits.map((p) => ({ qty: p.qty == null ? '' : String(p.qty), price: p.price == null ? '' : String(p.price) }))
    : [];
  return o;
}

function stripComputed(form) {
  const { id, resultPoints, resultDollars, riskDollars, rMultiple, holdingMinutes, screenshots, createdAt, updatedAt, ...rest } = form;
  // Drop empty partial rows; the server treats a non-empty list as the exit.
  rest.exits = (Array.isArray(form.exits) ? form.exits : []).filter((p) => p.qty !== '' && p.price !== '');
  return rest;
}
