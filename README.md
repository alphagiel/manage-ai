# manage-ai

One local dashboard for everything AI coding tools save on your Mac.

See it, search it, edit it, clean it up — chats, memory, rules, settings, MCP servers, skills, plugins, caches.

## Run

```sh
npm install
npm start        # → http://localhost:4747
```

## Supports

Claude Code · Codex · Gemini CLI · Copilot CLI · Copilot in VS Code · Cursor · Windsurf/Codeium

Tool definitions live in `server/tools.js` — add a tool by adding an entry.

## Safety

- Listens on `127.0.0.1` only. Nothing leaves your machine.
- Only touches files inside known AI tool folders.
- Deletes go to the macOS Trash (`~/.Trash/manage-ai`) with one-click undo.
- Edits back up the old file to `~/.manage-ai/backups` first.
- Login tokens are hidden until you click Reveal.

## Stack

Node + Hono (server) · Preact + htm (UI, no build step) · 3 dependencies.
