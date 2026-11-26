// What each AI tool saves, described in plain words.
// Patterns are relative to the tool's root. `*` matches one path segment.
//
// safety:
//   safe    – rebuildable or disposable, fine to delete
//   careful – your history or work; deleting loses it
//   keep    – config the tool needs; edit, don't delete
//
// clean: true – ticked by default in the one-click cleanup

import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const APP_SUPPORT = path.join(HOME, 'Library', 'Application Support');

export const TOOLS = [
  {
    id: 'claude',
    name: 'Claude Code',
    color: '#d97757',
    root: path.join(HOME, '.claude'),
    dedicated: true,
    categories: [
      {
        id: 'chats', label: 'Chats', kind: 'chats', safety: 'careful',
        about: 'Full transcripts of every session. Reopen with /resume. Auto-deleted after 30 days by default.',
        include: ['projects/*/*'], exclude: ['projects/*/memory'], items: ['projects/*/*.jsonl'],
      },
      {
        id: 'memory', label: 'Memory', kind: 'notes', safety: 'careful',
        about: 'Notes Claude saved about you and your projects. Loaded into new chats.',
        include: ['projects/*/memory'], items: ['projects/*/memory/*.md'],
      },
      {
        id: 'rules', label: 'Rules', kind: 'text', safety: 'keep',
        about: 'Your instructions, loaded into every chat (CLAUDE.md).',
        include: ['CLAUDE.md'],
      },
      {
        id: 'settings', label: 'Settings', kind: 'text', safety: 'keep',
        about: 'Permissions, hooks, env vars and preferences.',
        include: ['settings.json', 'settings.local.json', 'keybindings.json'],
      },
      {
        id: 'skills', label: 'Skills', kind: 'files', safety: 'careful',
        about: 'Your custom skills. Each folder is one skill.',
        include: ['skills'], items: ['skills/*'],
      },
      {
        id: 'commands', label: 'Commands', kind: 'files', safety: 'careful',
        about: 'Your custom slash commands.',
        include: ['commands'], items: ['commands/*'],
      },
      {
        id: 'agents', label: 'Agents', kind: 'files', safety: 'careful',
        about: 'Custom subagent definitions.',
        include: ['agents'], items: ['agents/*'],
      },
      {
        id: 'plugins', label: 'Plugins', kind: 'files', safety: 'careful',
        about: 'Add-on packs that bring extra skills, commands and connections.',
        include: ['plugins'], list: 'claude-plugins',
        readonly: 'Remove plugins inside Claude Code with /plugin, so it stays in sync.',
      },
      {
        id: 'history', label: 'Prompt history', kind: 'text', safety: 'safe',
        about: 'Every prompt you typed. Powers the up-arrow.',
        include: ['history.jsonl'],
      },
      {
        clean: true, id: 'undo', label: 'Undo copies', kind: 'files', safety: 'safe',
        about: 'Copies of files from before Claude edited them, used by rewind.',
        include: ['file-history'], items: ['file-history/*'],
      },
      {
        clean: true, id: 'cache', label: 'Caches & temp', kind: 'files', safety: 'safe',
        about: 'Rebuildable leftovers: pastes, shell snapshots, session env, caches.',
        include: ['cache', 'paste-cache', 'shell-snapshots', 'session-env', 'statsig', 'todos', 'stats-cache.json'],
      },
      {
        clean: true, id: 'backups', label: 'Backups', kind: 'files', safety: 'safe',
        about: 'Old copies of config files.',
        include: ['backups', 'settings.json.*'],
      },
    ],
    extraFiles: [
      {
        path: path.join(HOME, '.claude.json'), category: 'settings', safety: 'keep',
        about: 'App state, per-project settings and MCP servers. Claude rewrites this often.',
      },
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    color: '#10a37f',
    root: path.join(HOME, '.codex'),
    dedicated: true,
    categories: [
      { id: 'chats', label: 'Chats', kind: 'chats', safety: 'careful', about: 'Session transcripts.', include: ['sessions', 'archived_sessions'], items: ['sessions/*/*/*/*.jsonl', 'archived_sessions/*.jsonl'] },
      { id: 'rules', label: 'Rules', kind: 'text', safety: 'keep', about: 'Your instructions (AGENTS.md).', include: ['AGENTS.md'] },
      { id: 'commands', label: 'Custom prompts', kind: 'files', safety: 'careful', about: 'Saved prompts you run as /name.', include: ['prompts'], items: ['prompts/*'] },
      { id: 'settings', label: 'Settings', kind: 'text', safety: 'keep', about: 'Config, including MCP servers.', include: ['config.toml'] },
      { id: 'auth', label: 'Login', kind: 'secret', safety: 'keep', about: 'Your login token. Hidden by default.', include: ['auth.json'] },
      { id: 'history', label: 'Prompt history', kind: 'text', safety: 'safe', about: 'Every prompt you typed.', include: ['history.jsonl'] },
      { clean: true, id: 'logs', label: 'Logs', kind: 'files', safety: 'safe', about: 'Debug logs.', include: ['log'], items: ['log/*'] },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    color: '#4285f4',
    root: path.join(HOME, '.gemini'),
    dedicated: true,
    categories: [
      { id: 'chats', label: 'Chats', kind: 'chats', safety: 'careful', about: 'Saved sessions, per project.', include: ['tmp'], items: ['tmp/*/chats/*.json'] },
      { id: 'rules', label: 'Rules', kind: 'text', safety: 'keep', about: 'Your instructions (GEMINI.md).', include: ['GEMINI.md'] },
      { id: 'commands', label: 'Custom commands', kind: 'files', safety: 'careful', about: 'Your custom slash commands.', include: ['commands'], items: ['commands/*'] },
      { id: 'settings', label: 'Settings', kind: 'text', safety: 'keep', about: 'Config, including MCP servers.', include: ['settings.json'] },
      { id: 'auth', label: 'Login', kind: 'secret', safety: 'keep', about: 'Your login token. Hidden by default.', include: ['oauth_creds.json', 'google_accounts.json'] },
    ],
  },
  {
    id: 'copilot-cli',
    name: 'Copilot CLI',
    color: '#8250df',
    root: path.join(HOME, '.copilot'),
    dedicated: true,
    categories: [
      { id: 'chats', label: 'Sessions', kind: 'files', safety: 'careful', about: 'Saved session state, one folder per session.', include: ['session-state'], items: ['session-state/*'] },
      { id: 'settings', label: 'Settings', kind: 'text', safety: 'keep', about: 'Config and MCP servers.', include: ['config.json', 'mcp-config.json'] },
      { id: 'plugins', label: 'Plugins', kind: 'files', safety: 'careful', about: 'Installed plugins.', include: ['installed-plugins'], items: ['installed-plugins/*'] },
      { id: 'agents', label: 'Custom agents', kind: 'files', safety: 'careful', about: 'Your custom agents.', include: ['agents'], items: ['agents/*'] },
      { clean: true, id: 'logs', label: 'Logs', kind: 'files', safety: 'safe', about: 'Debug logs.', include: ['logs'], items: ['logs/*'] },
      { clean: true, id: 'cache', label: 'Locks & temp', kind: 'files', safety: 'safe', about: 'IDE connection lock files.', include: ['ide'], items: ['ide/*'] },
    ],
  },
  {
    id: 'vscode-copilot',
    name: 'Copilot in VS Code',
    color: '#0078d4',
    root: path.join(APP_SUPPORT, 'Code', 'User'),
    dedicated: false, // shared with the rest of VS Code — only count AI parts
    categories: [
      { id: 'chats', label: 'Chats', kind: 'chats', safety: 'careful', about: 'Copilot chat sessions, per workspace.', include: ['workspaceStorage/*/chatSessions', 'globalStorage/emptyWindowChatSessions'], items: ['workspaceStorage/*/chatSessions/*', 'globalStorage/emptyWindowChatSessions/*'] },
      { id: 'extension', label: 'Extension data', kind: 'files', safety: 'safe', about: 'Copilot Chat extension storage and indexes.', include: ['globalStorage/github.copilot-chat', 'globalStorage/github.copilot'], items: ['globalStorage/github.copilot-chat/*'] },
      { id: 'mcp', label: 'MCP config', kind: 'text', safety: 'keep', about: 'MCP servers for VS Code.', include: ['mcp.json'] },
      { id: 'rules', label: 'Prompts & instructions', kind: 'files', safety: 'careful', about: 'Reusable prompts and instruction files.', include: ['prompts'], items: ['prompts/*'] },
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    color: '#6b7280',
    root: path.join(HOME, '.cursor'),
    dedicated: true,
    categories: [
      { id: 'settings', label: 'MCP config', kind: 'text', safety: 'keep', about: 'Global MCP servers.', include: ['mcp.json'] },
      { id: 'rules', label: 'Rules', kind: 'files', safety: 'careful', about: 'Global rules.', include: ['rules'], items: ['rules/*'] },
      { id: 'extensions', label: 'Extensions', kind: 'files', safety: 'careful', about: 'Installed extensions.', include: ['extensions'], items: ['extensions/*'] },
    ],
  },
  {
    id: 'windsurf',
    name: 'Windsurf / Codeium',
    color: '#09b6a2',
    root: path.join(HOME, '.codeium'),
    dedicated: true,
    categories: [
      { id: 'chats', label: 'Cascade chats', kind: 'files', safety: 'careful', about: 'Cascade conversation data (binary).', include: ['cascade', 'windsurf/cascade'], items: ['cascade/*', 'windsurf/cascade/*'] },
      { id: 'memory', label: 'Memories', kind: 'files', safety: 'careful', about: 'Things Cascade remembers about you.', include: ['memories', 'windsurf/memories'], items: ['memories/*', 'windsurf/memories/*'] },
      { id: 'settings', label: 'Settings & MCP', kind: 'text', safety: 'keep', about: 'MCP servers and workflows.', include: ['windsurf/mcp_config.json', 'windsurf/workflows'] },
      { clean: true, id: 'index', label: 'Code index', kind: 'files', safety: 'safe', about: 'Search index of your code. Rebuilds itself.', include: ['database', 'context_state', 'code_tracker', 'implicit', 'brain'] },
      { id: 'browser', label: 'Built-in browser', kind: 'files', safety: 'safe', about: 'Browser profile used by Windsurf.', include: ['ws-browser', 'ws-browser-profile'] },
    ],
  },
  {
    id: 'projects',
    name: 'Inside your projects',
    color: '#e8590c',
    root: null,
    perProject: true, // patterns are relative to each project folder your AI tools have opened
    categories: [
      {
        id: 'rules', label: 'Project rules', kind: 'text', safety: 'keep',
        about: 'Rules files that live inside each project and load when you work there.',
        include: [
          'CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md', '.claude/rules/*', 'AGENTS.md', 'GEMINI.md',
          '.github/copilot-instructions.md', '.github/instructions/*', '.cursorrules', '.cursor/rules/*', '.windsurfrules',
        ],
      },
      { id: 'skills', label: 'Project skills', kind: 'files', safety: 'careful', about: 'Skills that only exist in one project.', include: ['.claude/skills/*'] },
      {
        id: 'commands', label: 'Project commands & prompts', kind: 'files', safety: 'careful', about: 'Slash commands and saved prompts that only exist in one project.',
        include: ['.claude/commands/*', '.gemini/commands/*', '.github/prompts/*', '.codex/prompts/*'],
      },
      { id: 'agents', label: 'Project agents', kind: 'files', safety: 'careful', about: 'Custom agents that only exist in one project.', include: ['.claude/agents/*', '.github/agents/*'] },
      { id: 'settings', label: 'Project settings', kind: 'text', safety: 'keep', about: 'Per-project permissions and hooks.', include: ['.claude/settings.json', '.claude/settings.local.json'] },
    ],
  },
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
export { HOME };
