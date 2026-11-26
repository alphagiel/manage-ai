// Human names for things that are stored under IDs.
// Every item gets { title, subtitle } so the UI never has to show a raw ID.

import fs from 'node:fs/promises';
import path from 'node:path';
import { HOME } from './tools.js';
import { chatTitle } from './readers.js';

const UUIDish = /^[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-f]{16,}$|^[0-9a-f]{6,}@v\d+$/i;
export const looksLikeId = (name) => UUIDish.test(name.replace(/\.[a-z]+$/i, ''));

/** "feedback_code_comments_short" → "Feedback code comments short" */
const humanize = (s) => {
  const t = s.replace(/\.(md|json|jsonl|txt|toml|yaml)$/i, '').replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Reads `name:` / `description:` from a markdown file's frontmatter. */
async function frontmatter(file) {
  try {
    const fh = await fs.open(file, 'r');
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(buf, 0, 4096, 0);
    await fh.close();
    const text = buf.subarray(0, bytesRead).toString('utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    const get = (k) => {
      const m = fm?.[1].match(new RegExp(`^${k}:[ \\t]*(.*)$((?:\\n[ \\t]+.*)*)`, 'm'));
      if (!m) return undefined;
      // "description: >" or "|" means the text is on the indented lines below
      const v = /^[>|][-+]?$/.test(m[1].trim()) || !m[1].trim() ? m[2].replace(/\s+/g, ' ') : m[1];
      return v.replace(/^\s*["']|["']\s*$/g, '').replace(/\\"/g, '"').trim() || undefined;
    };
    const firstLine = text.replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim();
    return { name: get('name'), description: get('description') || firstLine };
  } catch { return {}; }
}

/** Gemini commands are TOML: read `description = "..."`. */
async function tomlDescription(file) {
  try {
    const t = await fs.readFile(file, 'utf8');
    return { description: t.match(/^description\s*=\s*["'](.+?)["']\s*$/m)?.[1] };
  } catch { return {}; }
}

/** sessionId → chat title, so "file-history/<uuid>" can say which chat it came from. */
let sessionIndex = null;
async function sessionTitles() {
  if (sessionIndex && Date.now() - sessionIndex.at < 60_000) return sessionIndex.map;
  const map = new Map();
  const root = path.join(HOME, '.claude', 'projects');
  try {
    for (const proj of await fs.readdir(root)) {
      let files = [];
      try { files = await fs.readdir(path.join(root, proj)); } catch { continue; }
      for (const f of files) if (f.endsWith('.jsonl')) map.set(f.slice(0, -6), path.join(root, proj, f));
    }
  } catch { /* none */ }
  sessionIndex = { at: Date.now(), map };
  return map;
}

/**
 * Friendly { title, subtitle } for one item. Returns nulls when there's nothing
 * better than the date — the UI then says e.g. "Session · Nov 25".
 */
export async function describe(toolId, catId, p, st) {
  const name = path.basename(p);

  if (catId === 'chats' && !st.isDirectory()) {
    return { title: await chatTitle(p, st.mtimeMs) || null, subtitle: null };
  }

  if (catId === 'memory' && name.endsWith('.md')) {
    if (name === 'MEMORY.md') return { title: 'Memory index', subtitle: 'The list of memories loaded into every chat' };
    const fm = await frontmatter(p);
    return { title: humanize(fm.name || name), subtitle: fm.description || null };
  }

  if (toolId === 'projects' && catId === 'rules') {
    const parent = path.basename(path.dirname(p));
    const known = {
      'CLAUDE.md': 'CLAUDE.md · Claude Code', 'CLAUDE.local.md': 'CLAUDE.local.md · your private Claude rules',
      'AGENTS.md': 'AGENTS.md · Codex and others', 'GEMINI.md': 'GEMINI.md · Gemini',
      'copilot-instructions.md': 'Copilot instructions', '.cursorrules': 'Cursor rules', '.windsurfrules': 'Windsurf rules',
    };
    const fm = await frontmatter(p);
    const title = known[name]
      || (parent === 'rules' && p.includes(`${path.sep}.cursor${path.sep}`) ? `Cursor rule: ${humanize(name.replace(/\.mdc$/, ''))}`
        : parent === 'rules' ? `Claude rule: ${humanize(name)}`
          : parent === 'instructions' ? `Copilot instruction: ${humanize(name.replace(/\.instructions\.md$/, ''))}`
            : name);
    return { title, subtitle: fm.description || null };
  }

  if (toolId === 'projects' && catId === 'settings') {
    return { title: name === 'settings.local.json' ? 'Claude settings (just you)' : 'Claude settings (shared)', subtitle: null };
  }

  if (catId === 'skills' || catId === 'commands' || catId === 'agents') {
    const file = st.isDirectory() ? path.join(p, 'SKILL.md') : p;
    const fm = name.endsWith('.toml') ? await tomlDescription(file) : await frontmatter(file);
    const bare = name.replace(/\.(prompt\.md|agent\.md|md|mdc|toml)$/, '');
    return { title: '/' + (fm.name || bare), subtitle: fm.description || null };
  }

  if (toolId === 'claude' && catId === 'undo') {
    const chat = (await sessionTitles()).get(name);
    const t = chat ? await chatTitle(chat, (await fs.stat(chat)).mtimeMs) : null;
    return { title: t ? `Edits from “${t}”` : 'Edits from a deleted chat', subtitle: null };
  }

  if (toolId === 'copilot-cli' && catId === 'chats') {
    try {
      const y = await fs.readFile(path.join(p, 'workspace.yaml'), 'utf8');
      const cwd = y.match(/^cwd:\s*(.+)$/m)?.[1];
      const summary = y.match(/^summary:\s*(.+)$/m)?.[1];
      return { title: summary || (cwd ? `Session in ${path.basename(cwd)}` : null), subtitle: cwd?.replace(HOME, '~') || null };
    } catch { return { title: null, subtitle: null }; }
  }

  if (toolId === 'claude' && catId === 'plugins') {
    // …/plugins/cache/<marketplace>/<plugin>/<version>
    const parts = p.split(path.sep);
    const i = parts.lastIndexOf('cache');
    return { title: parts[i + 2] || name, subtitle: `from ${parts[i + 1] || 'unknown'} · version ${String(parts[i + 3] || '').slice(0, 12)}` };
  }

  if (looksLikeId(name)) return { title: null, subtitle: null };
  return { title: humanize(name), subtitle: null };
}
