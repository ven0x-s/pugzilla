// Dependency-free JSON store for Study / Learn notes (ICT concepts etc.), atomic writes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'study.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function clean(input) {
  return {
    title: String(input.title || '').slice(0, 200),
    category: String(input.category || '').slice(0, 80),
    tags: Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(input.tags || '').split(/[;,]/).map((t) => t.trim()).filter(Boolean),
    content: String(input.content || ''),
  };
}

function list() {
  // newest first
  return readAll().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function get(id) {
  return readAll().find((p) => p.id === id) || null;
}

function create(input) {
  const all = readAll();
  const now = new Date().toISOString();
  const p = { id: crypto.randomUUID(), ...clean(input), screenshots: [], createdAt: now, updatedAt: now };
  all.push(p);
  writeAll(all);
  return p;
}

function update(id, input) {
  const all = readAll();
  const i = all.findIndex((p) => p.id === id);
  if (i === -1) return null;
  all[i] = { ...all[i], ...clean(input), updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[i];
}

function remove(id) {
  const all = readAll();
  const p = all.find((x) => x.id === id);
  if (!p) return null;
  writeAll(all.filter((x) => x.id !== id));
  return p;
}

function addScreenshot(id, filename, label) {
  const all = readAll();
  const i = all.findIndex((p) => p.id === id);
  if (i === -1) return null;
  const shot = { id: crypto.randomUUID(), filename, label: label || '' };
  all[i].screenshots = all[i].screenshots || [];
  all[i].screenshots.push(shot);
  all[i].updatedAt = new Date().toISOString();
  writeAll(all);
  return shot;
}

function removeScreenshot(id, shotId) {
  const all = readAll();
  const i = all.findIndex((p) => p.id === id);
  if (i === -1) return null;
  const shot = (all[i].screenshots || []).find((s) => s.id === shotId);
  if (!shot) return null;
  all[i].screenshots = all[i].screenshots.filter((s) => s.id !== shotId);
  all[i].updatedAt = new Date().toISOString();
  writeAll(all);
  return shot;
}

module.exports = { list, get, create, update, remove, addScreenshot, removeScreenshot };
