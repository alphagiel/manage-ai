// Everything that changes files. Nothing is ever hard-deleted:
// deletes go to ~/.Trash/manage-ai, edits keep a backup in ~/.manage-ai/backups.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { TOOLS, HOME } from './tools.js';
import { listMcp } from './readers.js';
import { httpError } from './scan.js';

const STATE_DIR = path.join(HOME, '.manage-ai');
const BACKUP_DIR = path.join(STATE_DIR, 'backups');
const TRASH_LOG = path.join(STATE_DIR, 'trash.json');
const TRASH_DIR = path.join(HOME, '.Trash', 'manage-ai');

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ---------- path guard ----------

/** Only paths inside a known AI tool folder (or a known MCP/config file) are allowed. */
export async function guard(p, { forWrite = false } = {}) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw httpError(400, 'Bad path');
  const resolved = path.resolve(p);

  const roots = TOOLS.map((t) => t.root);
  const files = new Set(TOOLS.flatMap((t) => (t.extraFiles || []).map((f) => f.path)));
  for (const m of await listMcp()) if (m.source?.startsWith('/')) files.add(m.source);

  const real = await realish(resolved);
  const insideRoot = roots.some((r) => real !== r && real.startsWith(r + path.sep));
  if (!insideRoot && !files.has(resolved)) throw httpError(403, 'Outside AI tool folders');
  if (forWrite && roots.includes(real)) throw httpError(403, 'Won’t touch a whole tool folder');
  return resolved;
}

/** realpath of the path, or of its nearest existing parent (for files about to be created). */
async function realish(p) {
  try { return await fs.realpath(p); } catch {
    return path.join(await realish(path.dirname(p)), path.basename(p));
  }
}

// ---------- read ----------

const TEXT_LIMIT = 2 * 1024 * 1024;

export async function readFileForView(p, { reveal = false, secret = false } = {}) {
  const file = await guard(p);
  const st = await fs.stat(file);
  if (st.isDirectory()) {
    const names = await fs.readdir(file, { withFileTypes: true });
    return {
      type: 'dir',
      entries: names.slice(0, 500).map((d) => ({ name: d.name, dir: d.isDirectory(), path: path.join(file, d.name) })),
      truncated: names.length > 500,
    };
  }
  if (secret && !reveal) return { type: 'secret', size: st.size };

  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(Math.min(st.size, TEXT_LIMIT));
    await fh.read(buf, 0, buf.length, 0);
    if (buf.includes(0)) return { type: 'binary', size: st.size };
    return {
      type: 'text',
      content: buf.toString('utf8'),
      truncated: st.size > TEXT_LIMIT,
      editable: st.size <= TEXT_LIMIT,
      size: st.size,
      modified: st.mtime.toISOString(),
    };
  } finally {
    await fh.close();
  }
}

// ---------- trash / undo ----------

async function readLog() {
  try { return JSON.parse(await fs.readFile(TRASH_LOG, 'utf8')); } catch { return []; }
}
async function writeLog(log) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(TRASH_LOG, JSON.stringify(log.slice(-1000), null, 2));
}

export async function trash(paths) {
  const batch = crypto.randomUUID();
  let dir = path.join(TRASH_DIR, stamp());
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    // macOS may block ~/.Trash without Full Disk Access — fall back to our own folder
    if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
    dir = path.join(STATE_DIR, 'trash', stamp());
    await fs.mkdir(dir, { recursive: true });
  }
  const log = await readLog();
  const moved = [];

  for (const p of paths) {
    const from = await guard(p, { forWrite: true });
    const to = path.join(dir, `${moved.length}__${path.basename(from)}`);
    await move(from, to);
    moved.push({ batch, from, to, at: new Date().toISOString() });
  }
  log.push(...moved);
  await writeLog(log);
  return { batch, count: moved.length };
}

/** Recently deleted batches, newest first, for the undo list. */
export async function trashHistory() {
  const log = await readLog();
  const batches = new Map();
  for (const e of log) {
    const b = batches.get(e.batch) || { batch: e.batch, at: e.at, items: [] };
    b.items.push({ from: e.from, name: path.basename(e.from) });
    batches.set(e.batch, b);
  }
  return [...batches.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export async function restore(batch) {
  const log = await readLog();
  const items = log.filter((e) => e.batch === batch);
  if (!items.length) throw httpError(404, 'Nothing to undo');
  for (const e of items) {
    try { await fs.access(e.from); throw httpError(409, `Something already exists at ${e.from}`); } catch (err) {
      if (err.status) throw err;
    }
    await fs.mkdir(path.dirname(e.from), { recursive: true });
    await move(e.to, e.from);
  }
  await writeLog(log.filter((e) => e.batch !== batch));
  return { count: items.length };
}

async function move(from, to) {
  try {
    await fs.rename(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    await fs.cp(from, to, { recursive: true, preserveTimestamps: true });
    await fs.rm(from, { recursive: true });
  }
}

// ---------- save ----------

export async function save(p, content) {
  const file = await guard(p, { forWrite: true });
  if (typeof content !== 'string') throw httpError(400, 'Content must be text');
  if (file.endsWith('.json')) {
    try { JSON.parse(content); } catch (e) { throw httpError(422, `Not valid JSON: ${e.message}`); }
  }
  let backup = null;
  try {
    await fs.access(file);
    backup = path.join(BACKUP_DIR, stamp(), path.basename(file));
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.copyFile(file, backup);
  } catch { /* new file — nothing to back up */ }

  const tmp = `${file}.manage-ai-${process.pid}.tmp`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, file);
  return { backup };
}

// ---------- MCP ----------

export async function removeMcp(source, jsonPath) {
  const known = (await listMcp()).find(
    (m) => m.removable && m.source === source && JSON.stringify(m.jsonPath) === JSON.stringify(jsonPath),
  );
  if (!known) throw httpError(404, 'MCP server not found (it may have changed)');

  const data = JSON.parse(await fs.readFile(source, 'utf8'));
  let node = data;
  for (const key of jsonPath.slice(0, -1)) node = node?.[key];
  if (!node || !(jsonPath.at(-1) in node)) throw httpError(404, 'MCP server not found');
  const removed = node[jsonPath.at(-1)];
  delete node[jsonPath.at(-1)];

  const { backup } = await save(source, JSON.stringify(data, null, 2) + '\n');
  return { backup, removed };
}
