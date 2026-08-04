import React, { useEffect, useRef, useState } from 'react';
import { wrapLines, loadImage, roundRect, drawQr } from './ShareCard.jsx';

const W = 1200;

function drawSection(ctx, text, x, y, maxWidth, maxLines, font, lh, color) {
  ctx.font = font;
  let lines = wrapLines(ctx, text, maxWidth);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…');
  }
  ctx.fillStyle = color;
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lh));
  return y + lines.length * lh;
}

async function draw(canvas, note, o) {
  const ctx = canvas.getContext('2d');
  const shot = (note.screenshots || [])[0];
  const hasImage = !!shot && o.screenshot;
  const leftW = hasImage ? 680 : W;

  // Pre-measure to size the canvas height.
  ctx.font = '700 40px Arial';
  const titleLines = Math.min(wrapLines(ctx, note.title || 'Untitled', leftW - 80).length, 3);
  ctx.font = '18px Arial';
  const bodyLines = o.content && note.content ? Math.min(wrapLines(ctx, note.content, leftW - 80).length, 16) : 0;
  const H = Math.max(520, 210 + titleLines * 48 + (note.tags?.length ? 40 : 0) + bodyLines * 27 + 80);

  canvas.width = W; canvas.height = H;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0e1117');
  bg.addColorStop(1, '#161b22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.85, H * 0.12, 0, W * 0.85, H * 0.12, 520);
  glow.addColorStop(0, 'rgba(59,130,246,0.16)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (o.brand) {
    const logo = await loadImage('/pugzilla-logo.jpg');
    if (logo) {
      roundRect(ctx, 40, 28, 64, 64, 15);
      ctx.save(); ctx.clip();
      ctx.drawImage(logo, 40, 28, 64, 64);
      ctx.restore();
    }
    ctx.fillStyle = '#e6edf3';
    ctx.font = '700 27px Arial';
    ctx.fillText('Pugzilla', 118, 60);
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('zilla', 118 + ctx.measureText('Pug').width, 60);
    ctx.fillStyle = '#8b98a9';
    ctx.font = '14px Arial';
    ctx.fillText(note.category ? `Study · ${note.category}` : 'Study notes', 118, 82);
  }

  if (o.qr) drawQr(ctx, leftW - 40 - 60, 32, 60);

  // title
  let y = 150;
  y = drawSection(ctx, note.title || 'Untitled', 40, y, leftW - 80, 3, '700 40px Arial', 48, '#e6edf3');

  // tags
  if (o.tags && note.tags && note.tags.length) {
    y += 8;
    let tx = 40;
    ctx.font = '600 15px Arial';
    for (const tag of note.tags) {
      const tw = ctx.measureText(tag).width + 28;
      if (tx + tw > leftW - 40) break;
      ctx.fillStyle = 'rgba(59,130,246,0.15)';
      roundRect(ctx, tx, y, tw, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#7ca9f5';
      ctx.fillText(tag, tx + 14, y + 20);
      tx += tw + 10;
    }
    y += 44;
  } else {
    y += 16;
  }

  // content
  if (o.content && note.content && String(note.content).trim()) {
    drawSection(ctx, note.content, 40, y + 6, leftW - 80, 16, '18px Arial', 27, '#c9d3e0');
  }

  if (o.footer) {
    ctx.font = '13px Arial';
    ctx.fillStyle = '#5b6577';
    ctx.textAlign = 'right';
    ctx.fillText('pugzilla · study', leftW - 40, H - 34);
    ctx.textAlign = 'left';
  }

  if (hasImage) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(leftW, 30); ctx.lineTo(leftW, H - 30); ctx.stroke();
    const img = await loadImage('/uploads/' + shot.filename);
    const panelX = leftW + 30, panelY = 30, panelW = W - leftW - 60, panelH = H - 60;
    roundRect(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#0a0d12';
    ctx.fill();
    if (img) {
      const scale = Math.max(panelW / img.width, panelH / img.height);
      const iw = img.width * scale, ih = img.height * scale;
      ctx.drawImage(img, panelX + (panelW - iw) / 2, panelY + (panelH - ih) / 2, iw, ih);
    }
    ctx.restore();
  }
}

const DEFAULT_OPTS = { brand: true, tags: true, content: true, screenshot: true, footer: true, qr: true };
const TOGGLES = [['tags', 'Tags'], ['content', 'Content'], ['screenshot', 'Screenshot'], ['brand', 'Logo'], ['footer', 'Footer'], ['qr', 'QR']];

export default function StudyShareCard({ note, onClose }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const [opts, setOpts] = useState(DEFAULT_OPTS);
  const tog = (k) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      await draw(canvasRef.current, note, opts);
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [note, opts]);

  function download() {
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `pugzilla-study-${(note.title || 'note').replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  async function copyImage() {
    try {
      canvasRef.current.toBlob(async (blob) => {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopyMsg('Copied!');
        setTimeout(() => setCopyMsg(''), 1800);
      });
    } catch {
      setCopyMsg('Copy not supported in this browser');
      setTimeout(() => setCopyMsg(''), 2200);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-head">
          <h2>Share study note</h2>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 10, fontSize: 12 }}>
            {TOGGLES.map(([k, label]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <input type="checkbox" checked={opts[k]} onChange={() => tog(k)} /> {label}
              </label>
            ))}
          </div>
          <canvas ref={canvasRef} className="share-canvas" style={{ opacity: ready ? 1 : 0.3 }} />
          {!ready && <div className="hint" style={{ marginTop: 8 }}>Rendering card…</div>}
        </div>
        <div className="modal-foot">
          <span className="hint">{copyMsg || 'PNG, ready for Twitter/X or Discord'}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn ghost" onClick={copyImage} disabled={!ready}>Copy image</button>
            <button className="btn" onClick={download} disabled={!ready}>Download PNG</button>
          </div>
        </div>
      </div>
    </div>
  );
}
