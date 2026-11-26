// Finds files for each tool category and measures them.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TOOLS, TOOL_BY_ID, HOME } from './tools.js';
import { describe } from './friendly.js';

const run = promisify(execFile);

// ---------- glob ----------

const segRegex = (seg) =>
  new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

/** Expand a root-relative pattern ("projects/*\/memory") into absolute paths. */
export async function expand(root, pattern) {
  let current = [root];
  for (const seg of pattern.split('/')) {
    const next = [];
    if (!seg.includes('*')) {
      for (const dir of current) next.push(path.join(dir, seg));
    } else {
      const re = segRegex(seg);
      for (const dir of current) {
        let names = [];
        try { names = await fs.readdir(dir); } catch { continue; }
        for (const n of names) if (re.test(n) && n !== '.DS_Store') next.push(path.join(dir, n));
      }
    }
    current = next;
  }
  const existing = [];
  for (const p of current) {
    try { await fs.lstat(p); existing.push(p); } catch { /* missing */ }
  }
  return existing;
}

async function expandAll(root, patterns = [], exclude = []) {
  const out = new Set();
  for (const p of patterns) for (const m of await expand(root, p)) out.add(m);
  if (exclude.length) {
    const ex = new Set();
    for (const p of exclude) for (const m of await expand(root, p)) ex.add(m);
    for (const m of ex) out.delete(m);
  }
  return [...out];
}

/** expandAll across several roots (one per project for per-project tools). */
async function expandRoots(roots, patterns, exclude) {
  const out = await Promise.all(roots.map((r) => expandAll(r, patterns, exclude)));
  return [...new Set(out.flat())];
}

/** The deepest project that contains p, so a worktree isn't filed under its parent folder. */
const ownerOf = (roots, p) => roots.filter((r) => p.startsWith(r + path.sep)).sort((a, b) => b.length - a.length)[0];

const rootsOf = async (tool) => (tool.perProject ? projectDirs() : [tool.root]);

// ---------- projects ----------

let projectCache = null;

/**
 * Project folders your AI tools have worked in: Claude Code's project list
 * (including worktrees) and folders opened in VS Code. Only ones that still exist.
 */
export async function projectDirs() {
  if (projectCache && Date.now() - projectCache.at < 60_000) return projectCache.dirs;
  const found = new Set();
  try {
    const cj = JSON.parse(await fs.readFile(path.join(HOME, '.claude.json'), 'utf8'));
    for (const p of Object.keys(cj.projects || {})) found.add(p);
  } catch { /* no Claude */ }
  for (const p of (await claudeProjectNames()).values()) found.add(p);
  const vs = TOOL_BY_ID['vscode-copilot'];
  for (const p of (await vscodeWorkspaces(vs.root)).values()) found.add(p.replace(/ \+ \d+ more$/, ''));

  const toolRoots = TOOLS.filter((t) => t.root).map((t) => t.root);
  const dirs = [];
  await Promise.all([...found].map(async (p) => {
    if (!path.isAbsolute(p) || p === '/' || p === HOME || !p.startsWith(HOME + path.sep)) return;
    if (p.startsWith(path.join(HOME, 'Library') + path.sep)) return;
    // Skip hidden folders like repo/.claude — they belong to the repo above them
    if (path.relative(HOME, p).split(path.sep).some((seg) => seg.startsWith('.'))) return;
    if (toolRoots.some((r) => p === r || p.startsWith(r + path.sep))) return;
    try { if ((await fs.stat(p)).isDirectory()) dirs.push(p); } catch { /* gone */ }
  }));
  dirs.sort();
  projectCache = { at: Date.now(), dirs };
  return dirs;
}

// ---------- sizes ----------

/** Size in bytes of each path, via `du -sk` (fast, follows macOS conventions). */
export async function sizes(paths) {
  const result = new Map();
  for (let i = 0; i < paths.length; i += 400) {
    const batch = paths.slice(i, i + 400);
    try {
      const { stdout } = await run('du', ['-sk', ...batch], { maxBuffer: 32 * 1024 * 1024 });
      parseDu(stdout, result);
    } catch (e) {
      // du exits non-zero on unreadable subpaths but still prints what it could
      if (e.stdout) parseDu(e.stdout, result);
    }
  }
  return result;
}

function parseDu(stdout, result) {
  for (const line of stdout.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab > 0) result.set(line.slice(tab + 1), Number(line.slice(0, tab)) * 1024);
  }
}

const sum = (paths, map) => paths.reduce((acc, p) => acc + (map.get(p) || 0), 0);

// ---------- overview ----------

let overviewCache = null;

export async function overview({ fresh = false } = {}) {
  if (!fresh && overviewCache && Date.now() - overviewCache.at < 60_000) return overviewCache.data;

  const tools = await Promise.all(TOOLS.map(scanTool));
  const data = {
    scannedAt: new Date().toISOString(),
    total: tools.reduce((a, t) => a + t.size, 0),
    tools,
  };
  overviewCache = { at: Date.now(), data };
  return data;
}

async function scanTool(tool) {
  let exists = false;
  if (tool.perProject) exists = true;
  else try { exists = (await fs.stat(tool.root)).isDirectory(); } catch { /* not installed */ }
  if (!exists) {
    return { id: tool.id, name: tool.name, color: tool.color, root: tool.root, exists, size: 0, categories: [] };
  }

  const roots = await rootsOf(tool);
  const matched = await Promise.all(
    tool.categories.map((c) => expandRoots(roots, c.include, c.exclude)),
  );
  const extra = (tool.extraFiles || []).map((f) => f.path);
  const all = [...new Set([...matched.flat(), ...extra])];

  // Everything at the top of a dedicated folder that no category claims.
  let other = [];
  if (tool.dedicated) {
    const claimed = new Set(
      tool.categories.flatMap((c) => c.include.map((p) => p.split('/')[0])),
    );
    const top = await expand(tool.root, '*');
    const claimedRe = [...claimed].map(segRegex);
    other = top.filter((p) => !claimedRe.some((re) => re.test(path.basename(p))));
  }

  const sizeMap = await sizes([...all, ...other]);
  // Count what the user would see in the list (e.g. chat files, not project folders).
  const itemCounts = await Promise.all(tool.categories.map(async (c, i) => {
    if (c.list === 'claude-plugins') return (await claudePluginPaths()).length;
    return c.items ? (await expandRoots(roots, c.items)).length : matched[i].length;
  }));

  const categories = tool.categories.map((c, i) => {
    const paths = [...matched[i], ...(tool.extraFiles || []).filter((f) => f.category === c.id).map((f) => f.path)];
    const extras = paths.length - matched[i].length;
    return {
      id: c.id, label: c.label, kind: c.kind, safety: c.safety, about: c.about, clean: Boolean(c.clean),
      size: sum(paths, sizeMap), count: itemCounts[i] + extras,
    };
  });
  if (other.length) {
    categories.push({
      id: 'other', label: 'Other', kind: 'files', safety: 'careful',
      about: 'Everything else in this folder that manage-ai doesn’t recognize yet.',
      size: sum(other, sizeMap), count: other.length,
    });
  }
  categories.sort((a, b) => b.size - a.size);

  if (tool.perProject) exists = categories.some((c) => c.count > 0);
  return {
    id: tool.id, name: tool.name, color: tool.color, root: tool.root, exists, perProject: Boolean(tool.perProject),
    projects: tool.perProject ? new Set(matched.flat().map((p) => ownerOf(roots, p))).size : undefined,
    size: categories.reduce((a, c) => a + c.size, 0),
    categories,
  };
}

// ---------- category items ----------

export async function listCategory(toolId, catId) {
  const tool = TOOL_BY_ID[toolId];
  if (!tool) throw httpError(404, 'Unknown tool');

  let cat;
  let paths;
  if (catId === 'other') {
    const claimed = tool.categories.flatMap((c) => c.include.map((p) => segRegex(p.split('/')[0])));
    paths = (await expand(tool.root, '*')).filter((p) => !claimed.some((re) => re.test(path.basename(p))));
    cat = { id: 'other', label: 'Other', kind: 'files', safety: 'careful', about: 'Everything else in this folder that manage-ai doesn’t recognize yet.' };
  } else {
    cat = tool.categories.find((c) => c.id === catId);
    if (!cat) throw httpError(404, 'Unknown category');
    paths = cat.list === 'claude-plugins'
      ? await claudePluginPaths()
      : await expandRoots(await rootsOf(tool), cat.items || cat.include, cat.items ? [] : cat.exclude);
    for (const f of tool.extraFiles || []) if (f.category === cat.id) paths.push(f.path);
  }

  const sizeMap = await sizes(paths);
  const projects = tool.id === 'claude' ? await claudeProjectNames()
    : tool.id === 'vscode-copilot' ? await vscodeWorkspaces(tool.root)
      : tool.perProject ? await projectDirs() : null;
  const items = await Promise.all(paths.map(async (p) => {
    let st;
    try { st = await fs.stat(p); } catch { return null; }
    const item = {
      path: p,
      name: path.basename(p),
      group: groupLabel(tool, p, projects),
      dir: st.isDirectory(),
      size: sizeMap.get(p) ?? st.size,
      modified: st.mtime.toISOString(),
    };
    Object.assign(item, await describe(tool.id, cat.id, p, st));
    return item;
  }));

  return {
    tool: { id: tool.id, name: tool.name, color: tool.color },
    category: { id: cat.id, label: cat.label, kind: cat.kind, safety: cat.safety, about: cat.about, readonly: cat.readonly || null },
    items: items.filter(Boolean).sort((a, b) => b.modified.localeCompare(a.modified)),
  };
}

/** Friendly project name for grouping, e.g. "-Users-me-Work-app" → "Work/app". */
function groupLabel(tool, p, projects) {
  if (tool.perProject) {
    // longest matching project wins, so a worktree isn't filed under its parent repo
    const root = ownerOf(projects, p);
    return root ? root.replace(HOME, '~') : '';
  }
  const rel = path.relative(tool.root, p).split(path.sep);
  if (tool.id === 'claude' && rel[0] === 'projects' && rel[1]) {
    const real = projects?.get(rel[1]);
    if (real) return real === HOME ? '~' : real.replace(HOME + path.sep, '~/');
    return rel[1];
  }
  // Gemini only keeps a hash of the project path, so there's no friendly name to show
  if (tool.id === 'vscode-copilot' && rel[0] === 'workspaceStorage' && rel[1]) {
    const real = projects?.get(rel[1]);
    if (real) return real.startsWith(HOME) ? real.replace(HOME, '~') : real;
    return 'Unknown folder';
  }
  if (tool.id === 'vscode-copilot') return 'No folder open';
  return '';
}

/** VS Code workspaceStorage/<hash> → the folder that was open, from workspace.json. */
async function vscodeWorkspaces(root) {
  const map = new Map();
  const dir = path.join(root, 'workspaceStorage');
  let hashes = [];
  try { hashes = await fs.readdir(dir); } catch { return map; }
  await Promise.all(hashes.map(async (h) => {
    try {
      const j = JSON.parse(await fs.readFile(path.join(dir, h, 'workspace.json'), 'utf8'));
      const uri = j.folder || j.workspace;
      if (!uri) return;
      const u = new URL(uri);
      let p = decodeURIComponent(u.pathname);
      if (u.protocol !== 'file:') p = `${u.protocol.replace(':', '')} ${p}`;
      if (j.workspace) {
        // Multi-root workspace: name it after its folders
        try {
          const ws = JSON.parse((await fs.readFile(p, 'utf8')).replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
          const dirs = (ws.folders || []).map((f) => path.resolve(path.dirname(p), f.path || '')).filter(Boolean);
          if (dirs.length) p = dirs.length > 1 ? `${dirs[0]} + ${dirs.length - 1} more` : dirs[0];
        } catch { p = 'A multi-folder workspace'; }
      }
      map.set(h, p);
    } catch { /* no workspace.json */ }
  }));
  return map;
}

/** Install folders of Claude plugins, from installed_plugins.json. */
async function claudePluginPaths() {
  try {
    const j = JSON.parse(await fs.readFile(path.join(HOME, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    return Object.values(j.plugins || {}).flat().map((i) => i.installPath).filter(Boolean);
  } catch { return []; }
}

/** Claude encodes project paths as folder names ("/a/b-c" → "-a-b-c"). Map them back. */
async function claudeProjectNames() {
  const map = new Map();
  try {
    const cj = JSON.parse(await fs.readFile(path.join(HOME, '.claude.json'), 'utf8'));
    for (const real of Object.keys(cj.projects || {})) map.set(real.replace(/[^a-zA-Z0-9]/g, '-'), real);
  } catch { /* no state file */ }
  // Fill gaps (e.g. worktrees) by rebuilding the path from folders that exist on disk.
  try {
    for (const name of await fs.readdir(path.join(HOME, '.claude', 'projects'))) {
      if (!map.has(name)) {
        const real = await decodeProject(name);
        if (real) map.set(name, real);
      }
    }
  } catch { /* no projects dir */ }
  return map;
}

/** "-Users-me-Code-my-app" → "/Users/me/Code/my-app", choosing splits that exist on disk. */
async function decodeProject(name) {
  const parts = name.replace(/^-/, '').split('-');
  async function walk(dir, i) {
    if (i === parts.length) return dir;
    // try the longest folder name first: "my-app-worktree-2" before "my"
    for (let j = parts.length; j > i; j--) {
      for (const joiner of ['-', '.', '_', ' ']) {
        const candidate = path.join(dir, parts.slice(i, j).join(joiner));
        try {
          if ((await fs.stat(candidate)).isDirectory()) {
            const found = await walk(candidate, j);
            if (found) return found;
          }
        } catch { /* not this split */ }
        if (j - i === 1) break; // joiner irrelevant for a single part
      }
    }
    return null;
  }
  return walk('/', 0);
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
