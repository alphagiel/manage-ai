// Turns raw tool files into readable data: chat titles, chat messages, MCP servers.

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { HOME } from './tools.js';

// ---------- chats ----------

const titleCache = new Map(); // path -> { mtime, title }

/** Best one-line title for a chat file. Cached by mtime. */
export async function chatTitle(file, mtimeMs) {
  const hit = titleCache.get(file);
  if (hit && hit.mtime === mtimeMs) return hit.title;

  let title = '';
  try {
    if (file.includes(`${path.sep}chatSessions${path.sep}`) || file.includes('emptyWindowChatSessions')) {
      const st = await vscodeState(file);
      title = st?.customTitle || st?.requests?.find((r) => r?.message?.text)?.message.text || '';
    } else if (file.endsWith('.jsonl')) title = await jsonlTitle(file);
    else if (file.endsWith('.json')) {
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      const first = (data.messages || []).find((m) => m.type === 'user' || m.role === 'user');
      title = textOf(first?.content);
    }
  } catch { /* unreadable — leave blank */ }

  title = clean(title).slice(0, 160);
  titleCache.set(file, { mtime: mtimeMs, title });
  return title;
}

async function jsonlTitle(file) {
  const rl = readline.createInterface({ input: createReadStream(file, { end: 256 * 1024 }) });
  let summary = '';
  let firstPrompt = '';
  for await (const line of rl) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if ((e.type === 'summary' || e.type === 'custom-title' || e.type === 'ai-title') && (e.summary || e.title || e.customTitle)) {
      summary = e.summary || e.title || e.customTitle;
    }
    if (!firstPrompt) firstPrompt = userPrompt(e);
    if (firstPrompt && summary) break;
  }
  rl.close();
  return summary || firstPrompt;
}

/** First thing a human typed, across Claude / Codex line formats. */
function userPrompt(e) {
  // Claude Code
  if (e.type === 'user' && !e.isMeta && e.message?.role === 'user') {
    const t = textOf(e.message.content);
    const cmd = t.match(/<command-name>([^<]+)<\/command-name>/);
    if (cmd) return cmd[1];
    if (t && !t.startsWith('<')) return t;
  }
  // Codex
  if (e.type === 'response_item' && e.payload?.type === 'message' && e.payload.role === 'user') {
    const t = textOf(e.payload.content);
    if (t && !t.startsWith('<')) return t;
  }
  return '';
}

function textOf(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && (b.type === 'text' || b.type === 'input_text' || b.type === 'output_text' || typeof b.text === 'string'))
      .map((b) => b.text)
      .join('\n');
  }
  if (typeof content.text === 'string') return content.text;
  return '';
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Parse a chat file into a list of { role, text, ts, tool? } messages. */
export async function readChat(file) {
  const messages = [];
  const push = (m) => { if (m.text || m.tool) messages.push(m); };

  if (file.includes(`${path.sep}chatSessions${path.sep}`) || file.includes('emptyWindowChatSessions')) {
    const st = await vscodeState(file);
    for (const r of st?.requests || []) {
      const ts = r.timestamp ? new Date(r.timestamp).toISOString() : undefined;
      push({ role: 'user', text: r.message?.text || '', ts });
      const parts = (r.response || []).map((x) =>
        typeof x?.value === 'string' ? x.value : typeof x?.content?.value === 'string' ? x.content.value : '');
      push({ role: 'assistant', text: parts.join('').trim(), ts });
    }
    return { format: 'vscode', messages };
  }

  if (file.endsWith('.json')) {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    for (const m of data.messages || []) {
      push({ role: m.type === 'user' || m.role === 'user' ? 'user' : 'assistant', text: textOf(m.content), ts: m.timestamp });
    }
    return { format: 'json', messages };
  }

  const rl = readline.createInterface({ input: createReadStream(file) });
  for await (const line of rl) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }

    // Claude Code
    if ((e.type === 'user' || e.type === 'assistant') && e.message) {
      if (e.isMeta) continue;
      const c = e.message.content;
      if (typeof c === 'string') {
        push({ role: e.type, text: tidyClaude(c), ts: e.timestamp });
        continue;
      }
      for (const b of c || []) {
        if (b.type === 'text') push({ role: e.type, text: tidyClaude(b.text), ts: e.timestamp });
        else if (b.type === 'tool_use') push({ role: 'tool', tool: b.name, text: summarizeInput(b.input), ts: e.timestamp });
      }
      continue;
    }

    // Codex
    if (e.type === 'response_item' && e.payload) {
      const p = e.payload;
      if (p.type === 'message') push({ role: p.role === 'user' ? 'user' : 'assistant', text: textOf(p.content), ts: e.timestamp });
      else if (p.type === 'function_call') push({ role: 'tool', tool: p.name, text: summarizeInput(p.arguments), ts: e.timestamp });
    }
  }
  return { format: 'jsonl', messages };
}

/**
 * VS Code stores a chat either as one JSON object, or as JSONL where line 1 is the
 * object ({kind:0,v}) and later lines patch it ({kind:1,k:path,v} set, {kind:2,k:path,v:[...]} append).
 */
async function vscodeState(file) {
  const raw = await fs.readFile(file, 'utf8');
  if (file.endsWith('.json')) return JSON.parse(raw);
  let state = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.kind === 0) { state = d.v; continue; }
    if (!state || !Array.isArray(d.k)) continue;
    let node = state;
    for (const key of d.k.slice(0, -1)) node = node?.[key];
    const last = d.k.at(-1);
    if (!node) continue;
    if (d.kind === 1) node[last] = d.v;
    else if (d.kind === 2) {
      const arr = Array.isArray(node[last]) ? node[last] : (node[last] = []);
      const items = Array.isArray(d.v) ? d.v : [d.v];
      if (typeof d.i === 'number') arr.splice(d.i, arr.length - d.i, ...items); else arr.push(...items);
    }
  }
  return state;
}

/** Claude wraps slash commands in tags; show them as "/name args". */
function tidyClaude(t) {
  const cmd = t.match(/<command-name>([^<]+)<\/command-name>/);
  if (cmd) {
    const args = t.match(/<command-args>([^<]*)<\/command-args>/)?.[1] || '';
    return `${cmd[1]} ${args}`.trim();
  }
  if (/^<(local-command-stdout|system-reminder|local-command-caveat)/.test(t)) return '';
  return t;
}

function summarizeInput(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { return input.slice(0, 200); }
  }
  const v = input.command || input.file_path || input.path || input.pattern || input.url || input.description || input.prompt;
  return clean(typeof v === 'string' ? v : JSON.stringify(input)).slice(0, 200);
}

// ---------- MCP servers ----------

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

function entry(tool, name, cfg, source, jsonPath, scope, extra = {}) {
  const url = cfg?.url || cfg?.serverUrl || cfg?.httpUrl;
  return {
    tool, name, scope, source, jsonPath,
    transport: url ? (cfg.type || 'http') : 'stdio',
    target: url || [cfg?.command, ...(cfg?.args || [])].filter(Boolean).join(' '),
    envKeys: Object.keys(cfg?.env || {}),
    disabled: Boolean(cfg?.disabled),
    removable: Boolean(jsonPath),
    ...extra,
  };
}

const fromObject = (tool, obj, source, basePath, scope) =>
  Object.entries(obj || {}).map(([name, cfg]) => entry(tool, name, cfg, source, [...basePath, name], scope));

/** Every MCP server configured in any tool on this machine. */
export async function listMcp() {
  const out = [];

  // Claude Code: user scope, per-project (local) scope, project .mcp.json, plugins, claude.ai remote
  const claudeJsonPath = path.join(HOME, '.claude.json');
  const cj = await readJson(claudeJsonPath);
  if (cj) {
    out.push(...fromObject('claude', cj.mcpServers, claudeJsonPath, ['mcpServers'], 'user'));
    for (const [proj, p] of Object.entries(cj.projects || {})) {
      out.push(...fromObject('claude', p.mcpServers, claudeJsonPath, ['projects', proj, 'mcpServers'], `local · ${short(proj)}`));
      const projFile = path.join(proj, '.mcp.json');
      const pm = await readJson(projFile);
      if (pm) out.push(...fromObject('claude', pm.mcpServers, projFile, ['mcpServers'], `project · ${short(proj)}`));
    }
    for (const name of cj.claudeAiMcpEverConnected || []) {
      out.push({
        tool: 'claude', name: name.replace(/^claude\.ai /, ''), scope: 'claude.ai account', source: 'claude.ai → Settings → Connectors',
        transport: 'remote', target: 'Managed in your claude.ai account', envKeys: [], disabled: false, removable: false, remote: true,
      });
    }
  }
  const installed = await readJson(path.join(HOME, '.claude', 'plugins', 'installed_plugins.json'));
  for (const [plugin, installs] of Object.entries(installed?.plugins || {})) {
    for (const inst of installs) {
      const f = path.join(inst.installPath, '.mcp.json');
      const pm = await readJson(f);
      const servers = pm?.mcpServers || pm;
      if (servers && typeof servers === 'object') {
        for (const [name, cfg] of Object.entries(servers)) {
          if (cfg && typeof cfg === 'object') out.push(entry('claude', name, cfg, f, null, `plugin · ${plugin.split('@')[0]}`));
        }
      }
    }
  }

  // Codex: TOML — read-only listing
  const codexToml = path.join(HOME, '.codex', 'config.toml');
  try {
    const toml = await fs.readFile(codexToml, 'utf8');
    const servers = [];
    let cur = null;
    for (const line of toml.split('\n')) {
      const h = line.match(/^\s*\[mcp_servers\.("?)([^"\]]+)\1\]\s*$/);
      if (h) { cur = { name: h[2], cfg: {} }; servers.push(cur); continue; }
      if (/^\s*\[/.test(line)) { cur = null; continue; }
      const kv = cur && line.match(/^\s*(command|url)\s*=\s*"([^"]*)"/);
      if (kv) cur.cfg[kv[1]] = kv[2];
    }
    for (const s of servers) out.push(entry('codex', s.name, s.cfg, codexToml, null, 'user'));
  } catch { /* no codex */ }

  const jsonSources = [
    ['gemini', path.join(HOME, '.gemini', 'settings.json'), 'mcpServers'],
    ['copilot-cli', path.join(HOME, '.copilot', 'mcp-config.json'), 'mcpServers'],
    ['vscode-copilot', path.join(HOME, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'), 'servers'],
    ['cursor', path.join(HOME, '.cursor', 'mcp.json'), 'mcpServers'],
    ['windsurf', path.join(HOME, '.codeium', 'windsurf', 'mcp_config.json'), 'mcpServers'],
  ];
  for (const [tool, file, key] of jsonSources) {
    const j = await readJson(file);
    if (j) out.push(...fromObject(tool, j[key], file, [key], 'user'));
  }

  return out;
}

const short = (p) => p.replace(HOME, '~');
