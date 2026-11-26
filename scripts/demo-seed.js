#!/usr/bin/env node
// Builds a small fake home folder with made-up Claude Code data, for demos and screenshots.
// Six full chats you can read and delete, plus a little memory, rules and junk.
//
//   npm run demo                      → seeds /tmp/manage-ai-demo and starts manage-ai on it
//   node scripts/demo-seed.js <dir>   → seeds only
//
// Nothing real is read or touched: manage-ai runs with HOME pointed at the fake folder,
// so deletes land in <dir>/.Trash too.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(process.argv[2] || '/tmp/manage-ai-demo');
if (ROOT === '/' || ROOT === path.resolve(process.env.HOME || '')) {
  console.error('Refusing to seed into / or your real home folder.');
  process.exit(1);
}

const H = (...p) => path.join(ROOT, ...p);
const DAY = 86_400_000;
const NOW = Date.now();
const uuid = () => crypto.randomUUID();
const json = (o) => JSON.stringify(o, null, 2);
const blob = (mb) => crypto.randomBytes(Math.round(mb * 1024 * 1024));

async function write(file, content, daysAgo = 0) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  const t = new Date(NOW - daysAgo * DAY);
  await fs.utimes(file, t, t);
}

const project = (name) => path.join(ROOT, 'Code', name);
const projectDir = (name) => H('.claude', 'projects', project(name).replace(/[^a-zA-Z0-9]/g, '-'));

// ---------- the six chats ----------
// Each turn: [userText, [{ tool, input } | "assistant text", ...]]

const CHATS = [
  {
    project: 'recipe-box', daysAgo: 0,
    turns: [
      ['Add dark mode to the settings page', [
        { tool: 'Read', input: { file_path: 'src/pages/Settings.jsx' } },
        { tool: 'Read', input: { file_path: 'src/styles/theme.css' } },
        "Your colors are hard-coded in `theme.css`, so dark mode is mostly a matter of turning them into variables.\n\nHere's the plan:\n1. Move the colors into CSS variables on `:root`.\n2. Add a `[data-theme=\"dark\"]` block that swaps them.\n3. Add a toggle on the Settings page that saves the choice.",
        { tool: 'Edit', input: { file_path: 'src/styles/theme.css' } },
        { tool: 'Edit', input: { file_path: 'src/pages/Settings.jsx' } },
        "Done. The toggle is under **Appearance** in Settings, and the choice is saved in `localStorage` so it sticks after a reload.\n\n```jsx\n<Toggle\n  label=\"Dark mode\"\n  checked={theme === 'dark'}\n  onChange={(on) => setTheme(on ? 'dark' : 'light')}\n/>\n```",
      ]],
      ['Can it follow my system setting by default?', [
        { tool: 'Edit', input: { file_path: 'src/hooks/useTheme.js' } },
        "Yes. It now starts with your system setting (`prefers-color-scheme`) until you pick one yourself. Picking **Auto** in the menu goes back to following the system.",
      ]],
    ],
  },
  {
    project: 'pixel-pets', daysAgo: 1,
    turns: [
      ['Make the pet sprites animate when you click them', [
        { tool: 'Read', input: { file_path: 'src/Pet.js' } },
        "The sprites are single frames right now. The easiest way to animate them is a sprite sheet: one image with every frame side by side, and we shift which part is visible.",
        { tool: 'Bash', input: { command: 'ls assets/sprites' } },
        "You already have `cat-sheet.png` with 4 frames, so I wired that up.",
        { tool: 'Edit', input: { file_path: 'src/Pet.js' } },
        "Clicking a pet now plays a little 4-frame bounce, about 400ms long.\n\n```js\npet.onClick(() => pet.play('bounce', { frames: 4, fps: 10 }))\n```",
      ]],
      ['Add a heart that floats up too', [
        { tool: 'Edit', input: { file_path: 'src/effects/Heart.js' } },
        "Added. A small heart floats up and fades out over 1 second each time you click. Clicking fast makes several hearts, which looks pretty cute.",
      ]],
    ],
  },
  {
    project: 'budget-buddy', daysAgo: 3,
    turns: [
      ['Why is my useEffect running twice?', [
        "That's almost always React's **Strict Mode**. In development, React mounts each component, unmounts it, and mounts it again. It does this on purpose, to catch effects that don't clean up after themselves.\n\nIt only happens in development. Your production build runs the effect once.",
        { tool: 'Read', input: { file_path: 'src/hooks/useBudgets.js' } },
        "Your effect starts a fetch but never cancels it, so the double run causes two requests. Add a cleanup:\n\n```js\nuseEffect(() => {\n  const ctrl = new AbortController()\n  fetch('/api/budgets', { signal: ctrl.signal })\n    .then((r) => r.json())\n    .then(setBudgets)\n  return () => ctrl.abort()\n}, [])\n```",
      ]],
      ['Should I just turn Strict Mode off?', [
        "I wouldn't. It's catching a real bug here: if someone leaves the page before the fetch finishes, the old code would still try to update the state. The cleanup fixes both problems.",
      ]],
    ],
  },
  {
    project: 'weather-widget', daysAgo: 6,
    turns: [
      ['Write tests for the temperature formatter', [
        { tool: 'Read', input: { file_path: 'src/formatTemp.js' } },
        "It handles Celsius/Fahrenheit, rounding, and the empty case. I'll cover each of those.",
        { tool: 'Edit', input: { file_path: 'src/formatTemp.test.js' } },
        { tool: 'Bash', input: { command: 'pnpm test formatTemp' } },
        "All 6 tests pass:\n\n- rounds 21.6 → 22°C\n- converts to Fahrenheit\n- handles negative numbers\n- shows `--` when there's no reading\n- keeps one decimal when asked\n- handles 0 correctly (no `--`)",
      ]],
      ['Nice. What about really big numbers?', [
        { tool: 'Edit', input: { file_path: 'src/formatTemp.test.js' } },
        "Added a test for 1000°. It formats fine, but no weather station will ever send that, so I also added a guard that treats anything over 70°C as a bad reading.",
      ]],
    ],
  },
  {
    project: 'portfolio-site', daysAgo: 12,
    turns: [
      ['Make the project cards look good on mobile', [
        { tool: 'Read', input: { file_path: 'src/components/ProjectGrid.css' } },
        "The grid has a fixed `3` columns, so on a phone each card gets squished to about 100px wide.",
        { tool: 'Edit', input: { file_path: 'src/components/ProjectGrid.css' } },
        "Switched to a grid that fits as many cards as it can:\n\n```css\n.grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));\n  gap: 20px;\n}\n```\n\nThat's 1 column on phones, 2 on tablets and 3 on desktop, with no media queries needed.",
      ]],
    ],
  },
  {
    project: 'recipe-box', daysAgo: 20,
    turns: [
      ['Plan the database tables for recipes and ingredients', [
        "Here's a simple setup that keeps ingredients reusable across recipes:\n\n- **recipes**: id, title, minutes, servings\n- **ingredients**: id, name\n- **recipe_ingredients**: recipe_id, ingredient_id, amount, unit\n\nThe middle table lets one ingredient (like flour) show up in many recipes, each with its own amount.",
      ]],
      ['Can you write the SQL?', [
        { tool: 'Edit', input: { file_path: 'db/schema.sql' } },
        "Added `db/schema.sql`:\n\n```sql\nCREATE TABLE recipes (\n  id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL,\n  minutes INTEGER,\n  servings INTEGER\n);\n\nCREATE TABLE ingredients (\n  id INTEGER PRIMARY KEY,\n  name TEXT UNIQUE NOT NULL\n);\n\nCREATE TABLE recipe_ingredients (\n  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,\n  ingredient_id INTEGER REFERENCES ingredients(id),\n  amount REAL,\n  unit TEXT\n);\n```",
      ]],
    ],
  },
];

async function writeChat(chat) {
  const id = uuid();
  const lines = [];
  let t = NOW - chat.daysAgo * DAY - 3_600_000;
  const at = () => new Date((t += 45_000)).toISOString();

  for (const [ask, replies] of chat.turns) {
    lines.push({ type: 'user', sessionId: id, timestamp: at(), message: { role: 'user', content: ask } });
    for (const r of replies) {
      const block = typeof r === 'string'
        ? { type: 'text', text: r }
        : { type: 'tool_use', id: uuid(), name: r.tool, input: r.input };
      lines.push({ type: 'assistant', sessionId: id, timestamp: at(), message: { role: 'assistant', content: [block] } });
    }
  }
  await write(path.join(projectDir(chat.project), `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'), chat.daysAgo);

  // Undo copies for the files Claude edited in this chat
  await write(H('.claude', 'file-history', id, `${crypto.randomBytes(8).toString('hex')}@v1`), blob(1.5), chat.daysAgo);
}

// ---------- the rest of Claude Code ----------

const MEMORIES = [
  ['prefers-short-answers', 'Prefers short, direct answers', 'feedback', 'Keep answers short. Lead with the fix, then explain only if asked.'],
  ['uses-pnpm', 'Uses pnpm, not npm', 'user', 'Every project uses pnpm. Suggest `pnpm add`, never `npm install`.'],
  ['recipe-box-stack', 'recipe-box is React + SQLite', 'project', 'recipe-box: React front end, SQLite database, deployed on a small VPS.'],
  ['pixel-pets-goal', 'pixel-pets is a weekend game for a kid', 'project', 'pixel-pets is a fun side project made for a 9-year-old. Keep it simple and colorful.'],
];

async function claude() {
  for (const c of CHATS) await writeChat(c);

  const mem = path.join(projectDir('recipe-box'), 'memory');
  for (const [name, desc, type, body] of MEMORIES) {
    await write(path.join(mem, `${name}.md`), `---\nname: ${name}\ndescription: ${desc}\nmetadata:\n  type: ${type}\n---\n\n${body}\n`, 5);
  }
  await write(path.join(mem, 'MEMORY.md'), MEMORIES.map(([n, d]) => `- [${n}](${n}.md) — ${d}`).join('\n') + '\n', 2);

  await write(H('.claude', 'CLAUDE.md'), '# My rules\n\n- Keep answers short.\n- Use pnpm.\n- Ask before committing anything.\n', 14);
  await write(H('.claude', 'settings.json'), json({ permissions: { allow: ['Bash(pnpm test)', 'Bash(git status)'] }, theme: 'dark' }), 8);
  await write(H('.claude', 'skills', 'write-tests', 'SKILL.md'),
    '---\nname: write-tests\ndescription: Write tests for a file, matching the repo style\n---\n\n# Write tests\n\n1. Read the file.\n2. Find the existing test style.\n3. Cover the happy path and the edge cases.\n', 10);

  await write(H('.claude.json'), json({
    projects: Object.fromEntries([...new Set([...CHATS.map((c) => c.project), 'recipe-box-worktree-old-search'])].map((p) => [project(p), {}])),
    mcpServers: {
      github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 'demo-not-a-real-token' } },
      playwright: { command: 'npx', args: ['@playwright/mcp'] },
    },
  }), 0);

  // Stuff living inside the projects themselves, including a forgotten worktree
  const rp = project('recipe-box');
  await write(path.join(rp, 'CLAUDE.md'), '# recipe-box\n\n- React + SQLite.\n- Run `pnpm test` before committing.\n', 9);
  await write(path.join(rp, 'AGENTS.md'), '# recipe-box\n\nSame rules as CLAUDE.md, for Codex.\n', 9);
  await write(path.join(rp, '.claude', 'commands', 'seed-db.md'), '---\ndescription: Fill the database with sample recipes\n---\n\nRun db/seed.sql.\n', 7);
  await write(path.join(rp, '.claude', 'settings.local.json'), json({ permissions: { allow: ['Bash(pnpm dev)'] } }), 7);
  // A drifted copy of the global /write-tests skill, so "Duplicate add-ons" has something to show
  await write(path.join(rp, '.claude', 'skills', 'write-tests', 'SKILL.md'),
    '---\nname: write-tests\ndescription: Write tests for a file, matching the repo style\n---\n\n# Write tests\n\n1. Read the file.\n2. Use Jest (we moved to Vitest since).\n3. Cover the happy path.\n', 45);
  const wt = project('recipe-box-worktree-old-search');
  await write(path.join(wt, 'CLAUDE.md'), '# recipe-box (search branch)\n\n- Use the OLD search API (v1). We dropped this months ago.\n', 60);
  await write(path.join(wt, '.claude', 'skills', 'search-v1', 'SKILL.md'), '---\nname: search-v1\ndescription: Query the old v1 search API\n---\n\nUse /api/v1/search.\n', 60);
  await write(path.join(project('pixel-pets'), '.cursor', 'rules', 'game-style.mdc'), '---\ndescription: Keep it colorful and kid friendly\n---\n\nBright colors, big buttons.\n', 15);

  // Junk
  await write(H('.claude', 'paste-cache', 'paste-1.txt'), blob(6), 3);
  await write(H('.claude', 'shell-snapshots', 'snapshot-zsh.sh'), blob(3), 5);
  await write(H('.claude', 'cache', 'changelog.md'), blob(12), 1);
}

await fs.rm(ROOT, { recursive: true, force: true });
await claude();

console.log(`\n  🌱 Demo data ready in ${ROOT}`);
console.log(`  Run: HOME=${ROOT} npx manage-ai   (or: npm run demo)\n`);
