// Add-ons (skills, slash commands, agents) that exist in more than one place.
//
// Claude Code loads ~/.claude/{skills,commands,agents} everywhere, and
// <repo>/.claude/{...} only in that repo. When the same name lives in both, or in
// several repos/worktrees, the copies drift and which one runs depends on the folder.
// This finds those copies, groups identical ones into "versions", and helps pick one.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HOME } from './tools.js';
import { expand, projectDirs, httpError } from './scan.js';
import { describe } from './friendly.js';
import { guard, trash, restore } from './actions.js';

const run = promisify(execFile);
const GLOBAL = path.join(HOME, '.claude');
const TYPES = ['skills', 'commands', 'agents'];
const tilde = (p) => p.replace(HOME, '~');

/** "write-test.md" or "write-test/" → "write-test" */
const bareName = (p) => path.basename(p).replace(/\.md$/, '');

/** Skills and commands both become /name, so they collide with each other; agents are separate. */
const keyOf = (type, p) => `${type === 'agents' ? 'agent' : 'cmd'}:${bareName(p)}`;

/** The file people actually read: SKILL.md inside a folder, or the file itself. */
async function mainFile(p) {
  const st = await fs.stat(p);
  if (!st.isDirectory()) return p;
  const skill = path.join(p, 'SKILL.md');
  try { await fs.access(skill); return skill; } catch { /* look for any .md */ }
  const md = (await fs.readdir(p)).filter((n) => n.endsWith('.md')).sort()[0];
  return md ? path.join(p, md) : null;
}

/** Content hash of a file, or of every file in a folder (by relative path), ignoring .DS_Store. */
async function contentHash(p) {
  const h = crypto.createHash('sha1');
  async function walk(abs, rel) {
    const st = await fs.stat(abs);
    if (st.isDirectory()) {
      for (const n of (await fs.readdir(abs)).sort()) if (n !== '.DS_Store') await walk(path.join(abs, n), path.join(rel, n));
    } else {
      h.update(`\0${rel}\0`);
      h.update(await fs.readFile(abs));
    }
  }
  await walk(p, '');
  return h.digest('hex').slice(0, 12);
}

/** Paths under .claude that git tracks in this project, or null if it isn't a git repo. */
async function trackedIn(root) {
  try {
    const { stdout } = await run('git', ['-C', root, 'ls-files', '-z', '--', '.claude'], { maxBuffer: 8 * 1024 * 1024 });
    return new Set(stdout.split('\0').filter(Boolean).map((f) => path.join(root, f)));
  } catch { return null; }
}

/** All Claude add-ons: global ones plus every project's. */
async function allAddons() {
  const out = [];
  for (const type of TYPES) {
    for (const p of await expand(GLOBAL, `${type}/*`)) out.push({ path: p, type, scope: 'global', project: null, git: null });
  }
  for (const root of await projectDirs()) {
    const tracked = await trackedIn(root);
    for (const type of TYPES) {
      for (const p of await expand(root, `.claude/${type}/*`)) {
        const inGit = tracked ? [...tracked].some((f) => f === p || f.startsWith(p + path.sep)) : null;
        out.push({ path: p, type, scope: 'project', project: tilde(root), git: tracked ? (inGit ? 'tracked' : 'local') : null });
      }
    }
  }
  return out.filter((a) => path.basename(a.path) !== '.DS_Store');
}

export async function duplicates() {
  const groups = new Map();
  for (const a of await allAddons()) {
    const k = keyOf(a.type, a.path);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }

  const projects = (await projectDirs()).map(tilde);
  const result = [];
  for (const [key, copies] of groups) {
    if (copies.length < 2) continue;
    const detailed = await Promise.all(copies.map(async (c) => {
      const st = await fs.stat(c.path);
      return { ...c, dir: st.isDirectory(), modified: st.mtime.toISOString(), hash: await contentHash(c.path), main: await mainFile(c.path) };
    }));

    // Identical copies form one "version". Global version first, then most copies.
    const versions = new Map();
    for (const c of detailed) {
      if (!versions.has(c.hash)) versions.set(c.hash, { hash: c.hash, main: c.main, copies: [] });
      versions.get(c.hash).copies.push(c);
    }
    const vs = [...versions.values()].sort((a, b) =>
      (b.copies.some((c) => c.scope === 'global') - a.copies.some((c) => c.scope === 'global')) || b.copies.length - a.copies.length);
    for (const v of vs) {
      v.copies.sort((a, b) => (a.scope === 'global' ? -1 : b.scope === 'global' ? 1 : a.project.localeCompare(b.project)));
      v.modified = v.copies.map((c) => c.modified).sort().at(-1);
    }

    const first = detailed[0];
    const info = await describe('claude', first.type, first.path, await fs.stat(first.path));
    result.push({
      key,
      name: `/${bareName(first.path)}`,
      type: first.type === 'agents' ? 'agent' : 'command',
      description: info.subtitle || null,
      hasGlobal: detailed.some((c) => c.scope === 'global'),
      // Projects that rely on the global copy (no copy of their own)
      onlyGlobalIn: projects.filter((p) => !detailed.some((c) => c.project === p)),
      copies: detailed.length,
      versions: vs,
    });
  }

  result.sort((a, b) => b.versions.length - a.versions.length || b.copies - a.copies || a.name.localeCompare(b.name));
  return {
    groups: result,
    stats: {
      addons: result.length,
      drifted: result.filter((g) => g.versions.length > 1).length,
      copies: result.reduce((n, g) => n + g.copies, 0),
    },
  };
}

/** Main-file text of two copies, for a side-by-side compare. */
export async function addonDiff(a, b) {
  const read = async (p) => {
    const file = await mainFile(await guard(p));
    if (!file) return { name: null, text: '' };
    return { name: path.basename(file), text: await fs.readFile(file, 'utf8') };
  };
  const [A, B] = await Promise.all([read(a), read(b)]);
  return { a: A, b: B };
}

/**
 * Make this copy the global one: the current global copy (if any) goes to the
 * Trash, then this copy is copied into ~/.claude/<type>/. Returns what to undo.
 */
export async function promote(from) {
  const src = await guard(from);
  const type = path.basename(path.dirname(src));
  if (!TYPES.includes(type)) throw httpError(400, 'Not a skill, command or agent');
  if (src.startsWith(GLOBAL + path.sep)) throw httpError(400, 'Already the global one');

  const target = path.join(GLOBAL, type, path.basename(src));
  await guard(target, { forWrite: true });

  // Anything already global under this name (either form: folder or .md) gets replaced.
  const existing = [];
  for (const t of (type === 'agents' ? ['agents'] : ['skills', 'commands'])) {
    for (const form of [bareName(src), `${bareName(src)}.md`]) {
      const p = path.join(GLOBAL, t, form);
      try { await fs.lstat(p); existing.push(p); } catch { /* not there */ }
    }
  }
  const replaced = existing.length ? await trash(existing) : null;

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(src, target, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
  return { created: target, replacedBatch: replaced?.batch || null };
}

/** Undo a promote: trash the new global copy, then put the old one back. */
export async function unpromote(created, replacedBatch) {
  const p = await guard(created, { forWrite: true });
  if (!p.startsWith(GLOBAL + path.sep)) throw httpError(400, 'Can only undo a global copy');
  await trash([p]);
  if (replacedBatch) await restore(replacedBatch);
  return { ok: true };
}
