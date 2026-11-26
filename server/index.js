// manage-ai — local server. Listens on 127.0.0.1 only.

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { overview, listCategory } from './scan.js';
import { readChat, listMcp } from './readers.js';
import { readFileForView, trash, restore, save, removeMcp, guard, trashHistory } from './actions.js';
import { TOOL_BY_ID } from './tools.js';

const HOST = '127.0.0.1';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(ROOT, 'public');
const VERSION = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
// Resolved through Node so it works when npx hoists htm somewhere else
// (htm's main entry is dist/htm.js, so its package root is two levels up)
const VENDOR = path.join(path.dirname(path.dirname(createRequire(import.meta.url).resolve('htm'))), 'preact', 'standalone.module.js');

// Random per-run token. Only the page we serve knows it, so other websites
// can't make your browser call this server (CSRF / DNS-rebinding guard).
const TOKEN = crypto.randomBytes(24).toString('hex');

const app = new Hono();

app.use('*', async (c, next) => {
  const host = (c.req.header('host') || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') return c.text('Forbidden host', 403);
  if (c.req.path.startsWith('/api/') && c.req.header('x-manage-ai') !== TOKEN) {
    return c.json({ error: 'Missing token — reload the page' }, 401);
  }
  await next();
});

app.onError((err, c) => c.json({ error: err.message }, err.status || 500));

// ---------- read ----------

app.get('/api/overview', async (c) => c.json(await overview({ fresh: c.req.query('fresh') === '1' })));

app.get('/api/category', async (c) => c.json(await listCategory(c.req.query('tool'), c.req.query('cat'))));

app.get('/api/file', async (c) => {
  const p = c.req.query('path');
  const tool = TOOL_BY_ID[c.req.query('tool')];
  const cat = tool?.categories.find((x) => x.id === c.req.query('cat'));
  return c.json(await readFileForView(p, { reveal: c.req.query('reveal') === '1', secret: cat?.kind === 'secret' }));
});

app.get('/api/chat', async (c) => c.json(await readChat(await guard(c.req.query('path')))));

app.get('/api/mcp', async (c) => c.json(await listMcp()));

app.get('/api/trash', async (c) => c.json(await trashHistory()));

// ---------- write ----------

app.post('/api/trash', async (c) => {
  const { paths } = await c.req.json();
  if (!Array.isArray(paths) || !paths.length) return c.json({ error: 'No paths' }, 400);
  const res = await trash(paths);
  await overview({ fresh: true });
  return c.json(res);
});

/** One-click cleanup: trash every item in the chosen categories as one undoable batch. */
app.post('/api/cleanup', async (c) => {
  const { targets } = await c.req.json();
  if (!Array.isArray(targets) || !targets.length) return c.json({ error: 'Nothing picked' }, 400);
  const paths = [];
  let size = 0;
  for (const { tool, cat } of targets) {
    const t = TOOL_BY_ID[tool];
    const def = t?.categories.find((x) => x.id === cat);
    if (!def || def.safety !== 'safe') return c.json({ error: `${tool}/${cat} isn’t safe to auto-clean` }, 400);
    const list = await listCategory(tool, cat);
    for (const i of list.items) { paths.push(i.path); size += i.size; }
  }
  if (!paths.length) return c.json({ batch: null, count: 0, size: 0 });
  const res = await trash(paths);
  await overview({ fresh: true });
  return c.json({ ...res, size });
});

app.post('/api/restore', async (c) => {
  const res = await restore((await c.req.json()).batch);
  await overview({ fresh: true });
  return c.json(res);
});

app.post('/api/save', async (c) => {
  const { path: p, content } = await c.req.json();
  return c.json(await save(p, content));
});

app.post('/api/mcp/remove', async (c) => {
  const { source, jsonPath } = await c.req.json();
  return c.json(await removeMcp(source, jsonPath));
});

// ---------- static ----------

app.get('/vendor/preact.js', async (c) =>
  c.body(await fs.readFile(VENDOR), 200, { 'content-type': 'text/javascript; charset=utf-8' }));

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };

app.get('*', async (c) => {
  let rel = c.req.path === '/' ? 'index.html' : c.req.path.slice(1);
  let file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return c.text('Not found', 404);
  try { await fs.access(file); } catch { rel = 'index.html'; file = path.join(PUBLIC, rel); }
  let body = await fs.readFile(file);
  if (rel === 'index.html') body = body.toString().replace('__TOKEN__', TOKEN).replace('__VERSION__', VERSION);
  return c.body(body, 200, {
    'content-type': `${TYPES[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`,
    'cache-control': 'no-store',
  });
});

/** Starts the server. Tries the next port if one is taken. Resolves with the URL. */
export function start(port = 4747, tries = 10) {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: HOST }, () => resolve(`http://localhost:${port}`));
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && tries > 1) resolve(start(port + 1, tries - 1));
      else reject(e);
    });
  });
}
