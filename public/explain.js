// "What this means": a short, plain-English read of an AI file.
// Rule-based and local — nothing is sent anywhere.
// Returns { what: string, points: string[] } or null.

const MAX = 8;
const code = (s) => `\`${s}\``;
const list = (arr, fmt = (x) => x) => {
  const shown = arr.slice(0, MAX).map(fmt);
  return arr.length > MAX ? [...shown, `…and ${arr.length - MAX} more`] : shown;
};

/** What the whole file is for, from its name and where it lives. */
function whatIs(p, kind) {
  const name = p.split('/').pop();
  const inHomeClaude = /\/\.claude\/[^/]+$/.test(p) && !/\/\.claude\/projects\//.test(p);
  const global = /^\/(Users|home)\/[^/]+\/\.claude\//.test(p) || /\/manage-ai-demo\/\.claude\//.test(p);

  if (name === 'settings.local.json') return 'Claude Code settings for this project. Just for you — not shared with your team.';
  if (name === 'settings.json' && p.includes('/.claude/')) return global && inHomeClaude
    ? 'Your Claude Code settings. They apply in every project.'
    : 'Claude Code settings for this project. Shared with anyone who has the repo.';
  if (name === '.claude.json') return 'Claude Code’s main memory file: your projects, connections and stats.';
  if (name === 'CLAUDE.md' || name === 'CLAUDE.local.md') return global && inHomeClaude
    ? 'Instructions Claude reads at the start of every chat, everywhere.'
    : 'Instructions Claude reads at the start of every chat in this project.';
  if (name === 'MEMORY.md') return 'The index of what Claude remembers. Loaded into every chat.';
  if (p.includes('/memory/')) return 'Something Claude remembered about you or this project.';
  if (name === 'AGENTS.md') return 'Instructions for Codex and other agents that read AGENTS.md.';
  if (name === 'GEMINI.md') return 'Instructions Gemini reads at the start of every chat.';
  if (name === 'copilot-instructions.md') return 'Instructions Copilot reads for this project.';
  if (name === '.cursorrules' || p.includes('/.cursor/rules/') || p.includes('/.cursor/rules')) return 'A Cursor rule. Steers how Cursor writes code.';
  if (name === '.windsurfrules') return 'Rules Windsurf follows in this project.';
  if (name === 'SKILL.md' || p.includes('/skills/')) return 'A skill. Claude uses it when your ask matches its description.';
  if (p.includes('/commands/') || p.includes('/prompts/')) return `A saved prompt. Type ${code('/' + name.replace(/\.(prompt\.md|md|toml)$/, ''))} to run it.`;
  if (p.includes('/agents/')) return 'A helper agent. Your AI can hand it a piece of the work.';
  if (name === 'config.toml' && p.includes('/.codex/')) return 'Codex settings, including tools it can connect to.';
  if (/mcp.*\.json$/i.test(name)) return 'Outside tools (MCP) your AI can connect to.';
  if (name === 'settings.json' && p.includes('/.gemini/')) return 'Gemini CLI settings.';
  if (kind === 'settings') return 'Settings for this AI tool.';
  if (kind === 'rules') return 'Instructions your AI follows.';
  return null;
}

/** "Bash(npx jest *)" → "run `npx jest *`" */
function perm(rule) {
  const m = /^(\w+)(?:\((.*)\))?$/.exec(rule);
  if (!m) return code(rule);
  const [, tool, arg] = m;
  if (tool.startsWith('mcp__')) {
    const [, server, fn] = tool.split('__');
    return fn ? `use ${code(fn)} from ${server}` : `use any ${server} tool`;
  }
  const verbs = { Bash: 'run', Read: 'read', Edit: 'edit', Write: 'write', WebFetch: 'fetch', Skill: 'use skill', Glob: 'search files', Grep: 'search text', WebSearch: 'search the web' };
  const verb = verbs[tool] || `use ${tool}`;
  if (!arg) return tool === 'Bash' ? 'run any command' : verb === `use ${tool}` ? verb : `${verb} anything`;
  return `${verb} ${code(arg.replace(/^domain:/, ''))}`;
}

const MODES = {
  default: 'Asks before doing most things.',
  acceptEdits: 'Edits files without asking.',
  plan: 'Starts in plan mode — looks, doesn’t touch.',
  bypassPermissions: 'Does anything without asking. Risky.',
  auto: 'Decides on its own what’s safe to run.',
};

function claudeSettings(j) {
  const out = [];
  const p = j.permissions || {};
  if (p.allow?.length) out.push(`Can do these without asking:`, ...list(p.allow, (r) => `• ${perm(r)}`));
  if (p.ask?.length) out.push(`Always asks first before:`, ...list(p.ask, (r) => `• ${perm(r)}`));
  if (p.deny?.length) out.push(`Never allowed to:`, ...list(p.deny, (r) => `• ${perm(r)}`));
  if (p.defaultMode) out.push(MODES[p.defaultMode] || `Starts in ${code(p.defaultMode)} mode.`);
  if (p.additionalDirectories?.length) out.push(`Can also reach: ${p.additionalDirectories.map(code).join(', ')}`);
  if (j.model) out.push(`Uses the ${code(j.model)} model.`);
  if (j.hooks) out.push(`Runs your scripts automatically on: ${Object.keys(j.hooks).join(', ')}.`);
  if (j.env) out.push(`Sets ${Object.keys(j.env).length} environment variable(s): ${Object.keys(j.env).map(code).join(', ')}.`);
  if (j.enabledPlugins) {
    const on = Object.entries(j.enabledPlugins).filter(([, v]) => v).map(([k]) => k.split('@')[0]);
    if (on.length) out.push(`Plugins on: ${list(on).join(', ')}.`);
  }
  if (j.mcpServers) out.push(`Connects to: ${list(Object.keys(j.mcpServers)).join(', ')}.`);
  if (j.enabledMcpjsonServers?.length) out.push(`Turns on these connections: ${j.enabledMcpjsonServers.join(', ')}.`);
  if (j.statusLine) out.push('Shows a custom status line.');
  if (j.outputStyle) out.push(`Answers in the ${code(j.outputStyle)} style.`);
  if (j.includeCoAuthoredBy === false) out.push('Commits don’t credit the AI.');
  if (j.cleanupPeriodDays) out.push(`Deletes chats older than ${j.cleanupPeriodDays} days.`);
  const known = new Set(['permissions', 'model', 'hooks', 'env', 'enabledPlugins', 'mcpServers', 'enabledMcpjsonServers', 'statusLine', 'outputStyle', 'includeCoAuthoredBy', 'cleanupPeriodDays', '$schema']);
  const other = Object.keys(j).filter((k) => !known.has(k));
  if (other.length) out.push(`Also sets: ${list(other, code).join(', ')}.`);
  return out;
}

function mcpFile(j) {
  const servers = j.mcpServers || j.servers || j.mcp?.servers;
  if (!servers) return [];
  const names = Object.keys(servers);
  if (!names.length) return ['No connections set up.'];
  return [`Connects to ${names.length}:`, ...list(names, (n) => {
    const s = servers[n] || {};
    const how = s.url ? `online at ${new URL(s.url, 'http://x').host}` : s.command ? `runs ${code(s.command)} on your Mac` : '';
    return `• ${n}${how ? ` — ${how}` : ''}`;
  })];
}

function codexToml(t) {
  const out = [];
  const get = (k) => new RegExp(`^${k}\\s*=\\s*"?([^"\\n]+)"?`, 'm').exec(t)?.[1];
  if (get('model')) out.push(`Uses the ${code(get('model'))} model.`);
  const ap = get('approval_policy');
  if (ap) out.push({ never: 'Never asks before acting.', 'on-request': 'Asks when it thinks it should.', 'on-failure': 'Asks only when something fails.', untrusted: 'Asks before anything risky.' }[ap] || `Approval: ${code(ap)}.`);
  const sb = get('sandbox_mode');
  if (sb) out.push({ 'read-only': 'Can only read files.', 'workspace-write': 'Can write inside the project only.', 'danger-full-access': 'Full access to your Mac. Risky.' }[sb] || `Sandbox: ${code(sb)}.`);
  const mcp = [...t.matchAll(/^\[mcp_servers\.([^\]]+)\]/gm)].map((m) => m[1].replace(/"/g, ''));
  if (mcp.length) out.push(`Connects to: ${list(mcp).join(', ')}.`);
  return out;
}

/** Frontmatter of a skill/command/agent → when it kicks in and what it may use. */
function frontmatter(t) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(t)?.[1];
  if (!fm) return [];
  const get = (k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim().replace(/^["']|["']$/g, '');
  const out = [];
  const tools = get('allowed-tools') || get('tools');
  if (tools) out.push(`Allowed to use: ${tools}.`);
  if (get('model')) out.push(`Runs on the ${code(get('model'))} model.`);
  if (get('argument-hint')) out.push(`Takes: ${get('argument-hint')}`);
  if (get('disable-model-invocation') === 'true') out.push('Only runs when you type it. The AI won’t pick it on its own.');
  return out;
}

export function explain(path, content, kind) {
  if (!path || content == null) return null;
  const what = whatIs(path, kind);
  let points = [];
  try {
    if (/\.json$/i.test(path)) {
      const j = JSON.parse(content);
      if (/\/\.claude\/settings(\.local)?\.json$/.test(path)) points = claudeSettings(j);
      else points = mcpFile(j);
    } else if (/\/\.codex\/config\.toml$/.test(path)) points = codexToml(content);
    else if (/\.(md|mdc)$/i.test(path)) points = frontmatter(content);
  } catch { /* not valid — just say what the file is */ }
  if (!what && !points.length) return null;
  return { what, points };
}
