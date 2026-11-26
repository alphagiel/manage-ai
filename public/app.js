// manage-ai — UI
//
// Flow (overview → zoom → details):
//   Home        "Hey! You've used 4 AI tools" + one-click cleanup + a card per tool
//   Tool        boxes for each kind of stuff: Chats, Memory, Rules, Connections, Add-ons, Settings, Junk
//   Kind        friendly list (real names, never IDs), search, pick & delete
//   Details     read a chat like a chat, read/edit a note
//
// Rules: plain words · undo instead of scary prompts · one main button per screen ·
// raw files only behind "Show file details".

import { html, render, createContext, useState, useEffect, useMemo, useRef, useCallback, useContext } from '/vendor/preact.js';
import { Byte, ART, G } from '/art.js';

// ---------- api ----------

const TOKEN = document.querySelector('meta[name="manage-ai-token"]').content;
async function api(url, body) {
  const res = await fetch(url, body === undefined
    ? { headers: { 'x-manage-ai': TOKEN } }
    : { method: 'POST', headers: { 'x-manage-ai': TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
  return data;
}
const qs = (o) => new URLSearchParams(o).toString();

// ---------- words ----------

function bytes(n) {
  if (!n) return '0 KB';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
const photos = (n) => Math.round(n / (4 * 1024 * 1024)).toLocaleString();
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function when(iso) {
  const d = new Date(iso);
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 864e5);
  if (days <= 0) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
function dateGroup(iso) {
  const days = Math.floor((startOfDay(new Date()) - startOfDay(new Date(iso))) / 864e5);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return 'Older';
}
const tilde = (p) => p?.replace(/^\/Users\/[^/]+/, '~');

// ---------- what each tool and kind of stuff looks like ----------

const BADGE = {
  claude: 'Cl', codex: 'Cx', gemini: 'Ge', 'copilot-cli': 'Co', 'vscode-copilot': 'Vs', cursor: 'Cu', windsurf: 'Ws', projects: 'Pr',
};

const KINDS = {
  chats: { label: 'Chats', one: 'chat', many: 'chats', tag: 'yours', what: 'Conversations you had. Read them again anytime.',
    tip: 'Tap a chat to read it. Pick old ones to delete them — they go to the Trash, so you can always undo.' },
  memory: { label: 'Memory', one: 'note', many: 'notes', tag: 'yours', what: 'Things your AI wrote down so it remembers you.',
    tip: 'Your AI saved these notes about you and your projects. Tap one to read it or fix it.' },
  rules: { label: 'Rules', one: 'rule file', many: 'rule files', tag: 'needed', what: 'Instructions it reads before every chat.',
    tip: 'Your AI reads these before every single chat. Tap to read or change them.' },
  plug: { label: 'Connections', one: 'connection', many: 'connections', tag: 'needed', what: 'Other apps it can talk to (MCP servers).',
    tip: 'These let your AI talk to other apps, like Jira or Figma. Remove ones you don’t use.' },
  addons: { label: 'Add-ons', one: 'add-on', many: 'add-ons', tag: 'yours', what: 'Extra skills, commands and plugins.',
    tip: 'Extra tricks you’ve taught your AI. Tap one to see what it does.' },
  settings: { label: 'Settings', one: 'file', many: 'files', tag: 'needed', what: 'How the tool is set up.',
    tip: 'How this tool is set up. Only change these if you know what they do — we back up every edit.' },
  junk: { label: 'Junk', one: 'thing', many: 'things', tag: 'toss', what: 'Leftovers it can rebuild. Safe to toss.',
    tip: 'Leftovers your AI makes while it works. It rebuilds them when needed, so clearing them is safe.' },
  other: { label: 'Other stuff', one: 'thing', many: 'things', tag: 'yours', what: 'Things manage-ai doesn’t recognize yet.',
    tip: 'Files manage-ai doesn’t know yet. Look before you delete.' },
};
const KIND_ORDER = ['chats', 'memory', 'rules', 'plug', 'addons', 'settings', 'junk', 'other'];

const CAT_KIND = {
  chats: 'chats', memory: 'memory', rules: 'rules',
  settings: 'settings', auth: 'settings', mcp: 'settings',
  skills: 'addons', commands: 'addons', agents: 'addons', plugins: 'addons', extensions: 'addons',
  history: 'junk', undo: 'junk', cache: 'junk', backups: 'junk', logs: 'junk', index: 'junk', browser: 'junk', extension: 'junk',
  other: 'other',
};
const kindOf = (catId) => CAT_KIND[catId] || 'other';

const TAGS = {
  yours: { label: 'Your stuff', hint: 'Deleting loses it (you can undo from the Trash).' },
  toss: { label: 'Safe to toss', hint: 'Gets rebuilt when needed.' },
  needed: { label: 'Needed', hint: 'The tool uses this. Edit, don’t delete.' },
};

/** Why a junk item isn't ticked by default, or what to know first. */
const JUNK_NOTES = {
  history: 'You’d lose the up-arrow list of old prompts',
  browser: 'You’d be logged out of sites in its built-in browser',
  extension: 'Copilot rebuilds it, but may be slow for a bit',
  index: 'Close the app first — it rebuilds this when it reopens',
  undo: 'You won’t be able to rewind old chats',
};

const Tag = ({ t }) => html`<span class="tag ${t}" title=${TAGS[t]?.hint}>${TAGS[t]?.label}</span>`;
const Art = ({ kind, size = 64, icon = 34, radius }) => html`
  <div class="art" style="width:${size}px;height:${size}px;${radius ? `border-radius:${radius}px;` : ''}background:var(--${kind}-soft);color:var(--${kind})">${ART[kind](icon)}</div>`;
const Badge = ({ tool, small }) => html`<div class="badge ${small ? 'sm' : ''}" style="background:${tool.color}">${BADGE[tool.id] || tool.name[0]}</div>`;

// ---------- app state ----------

const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function useRoute() {
  const parse = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => { setR(parse()); scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}
const go = (...parts) => { location.hash = '/' + parts.map(encodeURIComponent).join('/'); };

function App() {
  const route = useRoute();
  const [ov, setOv] = useState(null);
  const [mcp, setMcp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [details, setDetailsState] = useState(() => store.get('manage-ai:details', false));
  const [version, setVersion] = useState(0);

  const setDetails = (v) => { setDetailsState(v); store.set('manage-ai:details', v); };

  const toast = useCallback((msg, opts = {}) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.ms || 5000);
  }, []);

  const refresh = useCallback(async (fresh = false) => {
    setBusy(true);
    try {
      const [o, m] = await Promise.all([api(`/api/overview?${qs({ fresh: fresh ? 1 : 0 })}`), api('/api/mcp')]);
      setOv(o); setMcp(m); setVersion((v) => v + 1);
    } catch (e) { toast(e.message, { error: true }); }
    finally { setBusy(false); }
  }, [toast]);
  useEffect(() => { refresh(); }, []);

  const confirm = (opts) => new Promise((resolve) => setModal({ ...opts, resolve }));

  const undoable = (msg, batch) => toast(msg, {
    ms: 10000,
    action: { label: 'Undo', run: async () => { await api('/api/restore', { batch }); toast('Put back ✨'); refresh(true); } },
  });

  /** Delete = move to Trash + Undo button. */
  const remove = async (paths, what) => {
    const res = await api('/api/trash', { paths });
    undoable(`Deleted ${what}`, res.batch);
    refresh();
    return res;
  };

  useEffect(() => {
    const on = (e) => {
      if (e.key !== 'Escape') return;
      if (modal) { modal.resolve(false); setModal(null); } else if (drawer) setDrawer(null);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [modal, drawer]);

  const app = { ov, mcp, busy, refresh, toast, confirm, remove, undoable, setDrawer, details, setDetails, version };

  const [view, a, b] = route;
  let page;
  if (view === 't' && b) page = html`<${KindPage} key=${a + b} toolId=${a} kind=${b} />`;
  else if (view === 't') page = html`<${ToolPage} key=${a} toolId=${a} />`;
  else if (view === 'cleanup') page = html`<${CleanupPage} />`;
  else if (view === 'connections') page = html`<${ConnectionsPage} />`;
  else if (view === 'deleted') page = html`<${DeletedPage} />`;
  else page = html`<${HomePage} />`;

  return html`
    <${Ctx.Provider} value=${app}>
      <div class="wrap">
        <header class="top">
          <a class="logo" href="#/"><${Byte} size=${34} /> manage-ai</a>
          <div class="grow" />
          <label class="switch" title="Show real file names and paths">
            <input type="checkbox" checked=${details} onChange=${(e) => setDetails(e.target.checked)} />
            <span class="track" /> File details
          </label>
          <button class="btn quiet icon" onClick=${() => refresh(true)} disabled=${busy} title="Look again" aria-label="Look again">${G.refresh}</button>
        </header>
        ${page}
      </div>
      ${drawer && html`<${Drawer} ...${drawer} onClose=${() => setDrawer(null)} />`}
      <${Support} />
      ${modal && html`<${Modal} ...${modal} onDone=${(v) => { modal.resolve(v); setModal(null); }} />`}
      <div class="toasts" role="status" aria-live="polite">
        ${toasts.map((t) => html`
          <div class="toast ${t.error ? 'error' : ''}" key=${t.id}>
            <span>${t.msg}</span>
            ${t.action && html`<button onClick=${() => { setToasts((x) => x.filter((y) => y.id !== t.id)); t.action.run().catch((e) => toast(e.message, { error: true })); }}>${t.action.label}</button>`}
          </div>`)}
      </div>
    <//>`;
}

// ---------- support ----------

// Built from parts so the address isn't sitting in the page as one scrapeable string.
const SUPPORT_EMAIL = ['lfagel84', 'gmail.com'].join('@');
const VERSION = document.querySelector('meta[name="manage-ai-version"]')?.content || '';

const SUPPORT_KINDS = [
  { id: 'question', emoji: '🙋', title: 'Ask a question', blurb: 'Anything about manage-ai', hint: 'What do you want to know?' },
  { id: 'bug', emoji: '🐞', title: 'Report a bug', blurb: 'Something broken or weird', hint: 'What happened, and what did you expect?' },
  { id: 'feature', emoji: '💡', title: 'Feature request', blurb: 'An idea to make it better', hint: 'What would make this better? A tool we should support?' },
  { id: 'feedback', emoji: '💬', title: 'General feedback', blurb: 'Love it, hate it, tell me', hint: 'Anything on your mind.' },
];

/**
 * Floating "Support" tab. Pick a type, write, then Send opens your mail app with
 * everything filled in — nothing is sent from here, you hit send yourself.
 */
function Support() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const K = SUPPORT_KINDS.find((k) => k.id === kind);

  const close = () => { setOpen(false); if (sent) { setKind(null); setText(''); setSent(false); } };
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, sent]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const first = text.trim().split('\n')[0].slice(0, 60);
    const subject = `[manage-ai] ${K.title}: ${first}`;
    const body = `${text.trim()}\n\n—\nmanage-ai ${VERSION}`;
    location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  return html`
    <button class="support-tab" onClick=${() => setOpen(true)}>💬 Support</button>
    ${open && html`
      <div class="modal-wrap" onClick=${(e) => e.target === e.currentTarget && close()}>
        <div class="card modal support" role="dialog" aria-modal="true" aria-labelledby="support-title">
          <div class="support-head">
            ${K && !sent && html`<button class="btn quiet icon" onClick=${() => setKind(null)} aria-label="Back">${G.back}</button>`}
            <h2 id="support-title">${sent ? 'Thanks!' : K ? K.title : 'Support'}</h2>
            <button class="btn quiet icon" onClick=${close} aria-label="Close">${G.close}</button>
          </div>

          ${sent ? html`
            <${Byte} size=${72} mood="happy" />
            <p>Your mail app should be open with the message ready. Hit send there and it comes straight to me.</p>
            <p class="ink-3 small">Mail app didn’t open? Email <b class="mono">${SUPPORT_EMAIL}</b></p>
            <div class="modal-actions"><button class="btn primary" onClick=${close}>Done</button></div>`

          : !K ? html`
            <p>Hey 👋 I’m the person who made manage-ai. Tell me anything.</p>
            <div class="support-kinds">
              ${SUPPORT_KINDS.map((k) => html`
                <button class="support-kind" onClick=${() => setKind(k.id)}>
                  <span class="emoji">${k.emoji}</span>
                  <span><b>${k.title}</b><small>${k.blurb}</small></span>
                </button>`)}
            </div>`

          : html`
            <form onSubmit=${send}>
              <textarea class="editor support-text" rows="6" maxlength="2000" autofocus
                placeholder=${K.hint} value=${text} onInput=${(e) => setText(e.target.value)} />
              <p class="ink-3 small">Opens your mail app with this filled in. Nothing is sent until you hit send there.</p>
              <div class="modal-actions">
                <button type="button" class="btn quiet" onClick=${() => setKind(null)}>Back</button>
                <button type="submit" class="btn primary" disabled=${!text.trim()}>Write email</button>
              </div>
            </form>`}
        </div>
      </div>`}`;
}

// ---------- shared ----------

function Hello({ children, mood, cta }) {
  return html`
    <section class="card hello">
      <${Byte} size=${64} mood=${mood} />
      <div class="say"><div class="bubble">${children}</div></div>
      ${cta && html`<div class="cta">${cta}</div>`}
    </section>`;
}

const Tip = ({ children }) => html`<div class="tip"><${Byte} size=${38} /><div class="bubble">${children}</div></div>`;
const Back = ({ href, label }) => html`<a class="back" href=${href}>${G.back} ${label}</a>`;
const Loading = () => html`<div class="card pad">${[70, 50, 60].map((w) => html`<div class="skeleton" style="height:20px;width:${w}%;margin:12px 0" />`)}</div>`;

/** Tool summary: kinds of stuff it has, with counts. */
function kindsFor(tool, mcp, details) {
  const kinds = {};
  for (const c of tool.categories) {
    const k = kindOf(c.id);
    if (k === 'other' && !details) continue;
    (kinds[k] ||= { kind: k, size: 0, count: 0, cats: [] });
    kinds[k].size += c.size; kinds[k].count += c.count; kinds[k].cats.push(c);
  }
  const conns = (mcp || []).filter((m) => m.tool === tool.id);
  if (conns.length) kinds.plug = { kind: 'plug', size: 0, count: conns.length, cats: [] };
  return KIND_ORDER.map((k) => kinds[k]).filter((k) => k && (k.count > 0 || k.size > 0));
}

/** Junk across tools that's safe to toss. */
function junkList(ov, toolId) {
  return (ov?.tools || [])
    .filter((t) => t.exists && (!toolId || t.id === toolId))
    .flatMap((t) => t.categories.filter((c) => c.safety === 'safe' && c.size > 0).map((c) => ({ tool: t, cat: c, key: `${t.id}/${c.id}` })));
}

// ---------- home ----------

function HomePage() {
  const { ov, mcp, details } = useApp();
  if (!ov) return html`<${Hello} mood="think">Let me look around your Mac…<//><${Loading} />`;

  const found = ov.tools.filter((t) => t.exists && t.size > 0);
  // The projects card goes last: it's a different kind of place, not an AI tool
  const tools = [...found.filter((t) => !t.perProject).sort((a, b) => b.size - a.size), ...found.filter((t) => t.perProject)];
  const missing = ov.tools.filter((t) => !t.perProject && (!t.exists || t.size === 0));
  const aiCount = found.filter((t) => !t.perProject).length;
  const junk = junkList(ov).filter((j) => j.cat.clean);
  const junkSize = junk.reduce((a, j) => a + j.cat.size, 0);

  return html`
    <${Hello} cta=${junkSize > 0 && html`
      <button class="btn primary big" onClick=${() => go('cleanup')}>🧹 Free up ${bytes(junkSize)}</button>
      <small>Only junk. Nothing you’d miss.</small>`}>
      Hey! 👋 I looked around your Mac. You’ve used <b>${plural(aiCount, 'AI tool', 'AI tools')}</b>,
      and they’re keeping <b>${bytes(ov.total)}</b> of stuff${ov.total >= 8 * 1024 * 1024 ? ` — about as much as ${photos(ov.total)} photos` : ''}.
    <//>

    <div class="section-title"><h2>Your AI tools</h2><span class="ink-3">Tap one to see what it keeps</span></div>
    <div class="tools">
      ${tools.map((t) => {
        const kinds = kindsFor(t, mcp, details).filter((k) => k.kind !== 'junk' && k.kind !== 'other').slice(0, 4);
        return html`
          <button class="card tool" onClick=${() => go('t', t.id)}>
            <div class="tool-top">
              <${Badge} tool=${t} />
              <div style="min-width:0">
                <div class="tool-name truncate">${t.name}</div>
                <div class="tool-size">${t.perProject ? `${plural(t.projects, 'project', 'projects')} · ${bytes(t.size)}` : bytes(t.size)}</div>
              </div>
            </div>
            <div class="pills">
              ${kinds.map((k) => html`
                <span class="pill" style="color:var(--${k.kind});background:var(--${k.kind}-soft)">
                  ${ART[k.kind](16)} ${plural(k.count, KINDS[k.kind].one, KINDS[k.kind].many)}
                </span>`)}
              ${!kinds.length && html`<span class="pill">Mostly junk</span>`}
            </div>
            <div class="tool-go">Look inside ${G.go}</div>
          </button>`;
      })}
    </div>

    <div class="links">
      <a class="btn" href="#/connections">${ART.plug(18)} All connections</a>
      <a class="btn" href="#/deleted">${ART.trash(18)} Recently deleted</a>
    </div>

    ${missing.length > 0 && html`<p class="missing">Didn’t find anything from ${missing.map((t) => t.name).join(', ')}.</p>`}`;
}

// ---------- tool ----------

function ToolPage({ toolId }) {
  const { ov, mcp, details } = useApp();
  const tool = ov?.tools.find((t) => t.id === toolId);
  if (!ov) return html`<${Loading} />`;
  if (!tool) return html`<${Back} href="#/" label="All tools" /><div class="card empty"><h2>Hmm, can’t find that tool</h2></div>`;

  const kinds = kindsFor(tool, mcp, details);
  const biggest = [...kinds].sort((a, b) => b.size - a.size)[0];

  return html`
    <${Back} href="#/" label="All tools" />
    <div class="head">
      <${Badge} tool=${tool} />
      <div>
        <h1>${tool.name}</h1>
        <div class="sub">${bytes(tool.size)}${details ? html` · <span class="mono">${tilde(tool.root)}</span>` : ''}</div>
      </div>
    </div>

    <${Tip}>
      ${tool.perProject ? html`These live inside <b>${plural(tool.projects, 'project', 'projects')}</b> you’ve opened with AI —
        including old worktrees. They load every time you work there, so stale ones still steer your AI.` : html`
      <b>${tool.name}</b> is keeping ${bytes(tool.size)}.`}
      ${!tool.perProject && biggest && biggest.size > 0 && html` Most of it is <b>${KINDS[biggest.kind].label.toLowerCase()}</b>.`}
      ${' '}Tap a box to look inside.
    <//>

    <div class="buckets">
      ${kinds.map((k) => {
        const K = KINDS[k.kind];
        return html`
          <button class="card bucket" onClick=${() => go('t', tool.id, k.kind)}>
            <${Art} kind=${k.kind} />
            <div>
              <h3>${K.label}</h3>
              <div class="count num">${k.kind === 'junk' ? bytes(k.size) : k.count.toLocaleString()}
                ${k.kind !== 'junk' && html`<small>${k.count === 1 ? K.one : K.many}</small>`}</div>
            </div>
            <div class="what">${K.what}</div>
            <div class="foot"><${Tag} t=${K.tag} /><span>${k.size ? bytes(k.size) : ''}</span></div>
          </button>`;
      })}
    </div>`;
}

// ---------- one kind of stuff ----------

function KindPage({ toolId, kind }) {
  const app = useApp();
  const tool = app.ov?.tools.find((t) => t.id === toolId);
  const K = KINDS[kind];
  if (!app.ov) return html`<${Loading} />`;
  if (!tool || !K) return html`<${Back} href="#/" label="All tools" /><div class="card empty"><h2>Nothing here</h2></div>`;

  const header = html`
    <${Back} href=${`#/t/${tool.id}`} label=${tool.name} />
    <div class="head">
      <${Art} kind=${kind} size=${72} icon=${40} />
      <div><h1>${K.label}</h1><div class="sub">${tool.name} · ${K.what}</div></div>
    </div>
    <${Tip}>${K.tip}<//>`;

  if (kind === 'junk') return html`${header}<${JunkChecklist} toolId=${tool.id} />`;
  if (kind === 'plug') return html`${header}<${Connections} toolId=${tool.id} />`;

  const cats = tool.categories.filter((c) => kindOf(c.id) === kind);
  return html`${header}<${ItemList} key=${app.version} tool=${tool} cats=${cats} kind=${kind} />`;
}

function ItemList({ tool, cats, kind }) {
  const app = useApp();
  const [lists, setLists] = useState(null);
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [limit, setLimit] = useState(60);
  const K = KINDS[kind];

  const load = () => Promise.all(cats.map((c) => api(`/api/category?${qs({ tool: tool.id, cat: c.id })}`)))
    .then(setLists, (e) => app.toast(e.message, { error: true }));
  useEffect(() => { load(); }, []);

  const all = useMemo(() => (lists || []).flatMap((l) => l.items.map((i) => ({ ...i, cat: l.category }))), [lists]);
  const projects = useMemo(() => [...new Set(all.map((i) => i.group).filter(Boolean))].sort(), [all]);

  const label = (i) => i.title || (app.details ? i.name : `${cap(K.one)} from ${when(i.modified)}`);

  const shown = useMemo(() => {
    const n = query.trim().toLowerCase();
    return all.filter((i) => (!project || i.group === project) &&
      (!n || `${i.title || ''} ${i.subtitle || ''} ${i.group || ''} ${app.details ? i.name : ''}`.toLowerCase().includes(n)));
  }, [all, query, project, app.details]);

  if (!lists) return html`<${Loading} />`;

  const readonly = lists.find((l) => l.category.readonly)?.category.readonly;
  const sel = shown.filter((i) => picked.has(i.path));
  const selSize = sel.reduce((a, i) => a + i.size, 0);
  const toggle = (p) => setPicked((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const allOn = shown.length > 0 && sel.length === shown.length;
  const someOn = sel.length > 0 && !allOn;
  const pickAll = () => setPicked(allOn ? new Set() : new Set(shown.map((i) => i.path)));
  const shownSize = shown.reduce((a, i) => a + i.size, 0);
  const filtered = !!(query.trim() || project);

  // Group: chats by date, multi-category kinds (add-ons) by category, else one list
  const byDate = kind === 'chats' || kind === 'memory';
  const groups = [];
  for (const i of shown.slice(0, limit)) {
    const g = byDate ? dateGroup(i.modified) : cats.length > 1 ? i.cat.label : '';
    if (!groups.length || groups.at(-1).name !== g) groups.push({ name: g, items: [] });
    groups.at(-1).items.push(i);
  }

  const del = async () => {
    const what = plural(sel.length, K.one, K.many);
    const ok = await app.confirm({
      mood: 'think', title: `Delete ${what}?`,
      body: [`That’s ${bytes(selSize)}.`, 'They go to your Trash, so you can put them back.'],
      yes: 'Delete',
    });
    if (!ok) return;
    try { await app.remove(sel.map((i) => i.path), what); setPicked(new Set()); load(); }
    catch (e) { app.toast(e.message, { error: true }); }
  };

  const open = (i) => app.setDrawer({ item: { ...i, label: label(i) }, tool, kind, readonly, onDeleted: load });

  return html`
    ${readonly && html`<div class="tip" style="background:var(--warn-soft);color:var(--warn);border:0">ℹ️ ${readonly}</div>`}

    ${all.length > 6 && html`
      <div class="bar">
        <label class="search">${G.search}
          <input placeholder="Search ${K.many}…" value=${query} onInput=${(e) => { setQuery(e.target.value); setLimit(60); }} aria-label="Search" />
        </label>
        ${projects.length > 1 && html`
          <select class="select" value=${project} onChange=${(e) => setProject(e.target.value)} aria-label="Project">
            <option value="">All projects</option>
            ${projects.map((p) => html`<option value=${p}>${p.split('/').pop()}</option>`)}
          </select>`}
      </div>`}

    ${!shown.length
      ? html`<div class="card empty"><${Byte} size=${72} mood="think" /><h2>${all.length ? 'No matches' : `No ${K.many} yet`}</h2>${all.length ? 'Try another word.' : ''}</div>`
      : html`
        <div class="card list">
          ${!readonly && shown.length > 1 && html`
            <div class="pick-all" role="checkbox" aria-checked=${allOn ? 'true' : someOn ? 'mixed' : 'false'} tabindex="0"
              onClick=${pickAll} onKeyDown=${(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pickAll(); } }}>
              <span class="pick ${allOn ? 'on' : someOn ? 'some' : ''}">${allOn ? G.check : someOn ? html`<i />` : ''}</span>
              <span>${allOn ? 'Unpick all' : `Pick all ${shown.length.toLocaleString()}${filtered ? ' matches' : ''}`}</span>
              <span class="ink-3">· ${bytes(shownSize)}</span>
            </div>`}
          ${groups.map((g) => html`
            ${g.name && html`<div class="group-label">${g.name}</div>`}
            ${g.items.map((i) => html`
              <div class="item ${picked.has(i.path) ? 'picked' : ''}" key=${i.path} role="button" tabindex="0"
                onClick=${() => open(i)} onKeyDown=${(e) => e.key === 'Enter' && open(i)}>
                ${!readonly && html`
                  <span class="pick ${picked.has(i.path) ? 'on' : ''}" role="checkbox" aria-checked=${picked.has(i.path)} tabindex="0"
                    aria-label="Pick ${label(i)}"
                    onClick=${(e) => { e.stopPropagation(); toggle(i.path); }}
                    onKeyDown=${(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); toggle(i.path); } }}>
                    ${picked.has(i.path) && G.check}
                  </span>`}
                <span class="ic" style="background:var(--${kind}-soft);color:var(--${kind})">${ART[kind](22)}</span>
                <div class="body">
                  <div class="t truncate">${label(i)}</div>
                  <div class="s truncate">${[
                    i.subtitle,
                    i.group && (!i.subtitle || tool.perProject) ? `in ${i.group.split('/').pop()}` : null,
                    app.details ? tilde(i.path) : null,
                  ].filter(Boolean).join(' · ') || ' '}</div>
                </div>
                <div class="meta"><b>${when(i.modified)}</b>${bytes(i.size)}</div>
              </div>`)}`)}
          ${shown.length > limit && html`<div class="more"><button class="btn small" onClick=${() => setLimit(limit + 100)}>Show more (${(shown.length - limit).toLocaleString()} left)</button></div>`}
        </div>`}

    ${sel.length > 0 && html`
      <div class="float">
        <span>${allOn && sel.length > 1 ? `All ${sel.length.toLocaleString()} ${K.many}` : plural(sel.length, K.one, K.many)} picked · ${bytes(selSize)}</span>
        <button class="btn quiet small" onClick=${() => setPicked(new Set())}>Cancel</button>
        <button class="btn danger" onClick=${del}>${allOn && sel.length > 1 ? 'Delete all' : 'Delete'}</button>
      </div>`}`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- junk / cleanup ----------

function JunkChecklist({ toolId }) {
  const app = useApp();
  const items = junkList(app.ov, toolId);
  const [on, setOn] = useState(() => new Set(items.filter((j) => j.cat.clean).map((j) => j.key)));
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(null);

  const chosen = items.filter((j) => on.has(j.key));
  const total = chosen.reduce((a, j) => a + j.cat.size, 0);
  const toggle = (k) => setOn((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const go_ = async () => {
    setWorking(true);
    try {
      const res = await api('/api/cleanup', { targets: chosen.map((j) => ({ tool: j.tool.id, cat: j.cat.id })) });
      setDone(res);
      app.refresh();
    } catch (e) { app.toast(e.message, { error: true }); }
    finally { setWorking(false); }
  };

  if (done) return html`
    <div class="card done">
      <${Byte} size=${96} mood="happy" />
      <div class="big-num">${bytes(done.size)}</div>
      <h2>freed up! 🎉</h2>
      <p class="ink-2">Moved ${plural(done.count, 'thing', 'things')} to the Trash.</p>
      <div class="modal-actions">
        ${done.batch && html`<button class="btn" onClick=${async () => { await api('/api/restore', { batch: done.batch }); app.toast('Put back ✨'); app.refresh(true); setDone(null); }}>Changed my mind — put it back</button>`}
        <a class="btn primary" href="#/">Back home</a>
      </div>
    </div>`;

  if (!items.length) return html`<div class="card empty"><${Byte} size=${80} mood="happy" /><h2>All clean!</h2>No junk to clear right now.</div>`;

  let lastTool = null;
  return html`
    <div class="card checklist">
      ${items.map((j) => {
        const head = !toolId && j.tool.id !== lastTool;
        lastTool = j.tool.id;
        const isOn = on.has(j.key);
        return html`
          ${head && html`<div class="tool-group"><${Badge} tool=${j.tool} small /> ${j.tool.name}</div>`}
          <div class="check-row ${isOn ? '' : 'off'}" role="checkbox" aria-checked=${isOn} tabindex="0"
            onClick=${() => toggle(j.key)} onKeyDown=${(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), toggle(j.key))}>
            <span class="pick ${isOn ? 'on' : ''}">${isOn && G.check}</span>
            <div class="body">
              <div class="t" style="font-weight:700">${j.cat.label}</div>
              <div class="ink-3" style="font-size:13px">${JUNK_NOTES[j.cat.id] ? `${isOn ? 'Heads up: ' : ''}${JUNK_NOTES[j.cat.id]}` : j.cat.about}</div>
            </div>
            <span class="size">${bytes(j.cat.size)}</span>
          </div>`;
      })}
    </div>
    <div style="display:flex;justify-content:center;margin-top:22px">
      <button class="btn primary big" disabled=${!chosen.length || working} onClick=${go_}>
        ${working ? 'Cleaning…' : `🧹 Free up ${bytes(total)}`}
      </button>
    </div>
    <p class="missing" style="margin-top:12px">Everything goes to your Trash first. You can put it back.</p>`;
}

function CleanupPage() {
  const { ov } = useApp();
  if (!ov) return html`<${Loading} />`;
  return html`
    <${Back} href="#/" label="Home" />
    <div class="head"><${Art} kind="junk" size=${72} icon=${40} /><div><h1>Free up space</h1><div class="sub">Junk from all your AI tools, in one go</div></div></div>
    <${Tip}>I picked the stuff that’s <b>safe to toss</b> — your AI tools rebuild it when they need it. Untick anything you want to keep.<//>
    <${JunkChecklist} />`;
}

// ---------- connections ----------

function scopeWords(m) {
  const [kind, where] = m.scope.split(' · ');
  const proj = where?.split('/').pop();
  if (m.remote) return 'From your claude.ai account';
  if (kind === 'user') return 'Works everywhere';
  if (kind === 'local') return `Only in ${proj} (just you)`;
  if (kind === 'project') return `Only in ${proj} (shared with your team)`;
  if (kind === 'plugin') return `Comes with the ${where} add-on`;
  return m.scope;
}

function Connections({ toolId }) {
  const app = useApp();
  const tools = Object.fromEntries((app.ov?.tools || []).map((t) => [t.id, t]));
  const list = (app.mcp || []).filter((m) => !toolId || m.tool === toolId);
  if (!app.mcp) return html`<${Loading} />`;
  if (!list.length) return html`<div class="card empty"><${Byte} size=${72} mood="think" /><h2>No connections</h2>Nothing plugged in yet.</div>`;

  const byTool = list.reduce((acc, m) => ((acc[m.tool] ||= []).push(m), acc), {});

  const remove = async (m) => {
    const ok = await app.confirm({
      mood: 'think', title: `Unplug “${m.name}”?`,
      body: [`${tools[m.tool]?.name || m.tool} won’t be able to use it anymore.`, 'We save a backup first. Restart the tool after.'],
      yes: 'Unplug',
    });
    if (!ok) return;
    try { await api('/api/mcp/remove', { source: m.source, jsonPath: m.jsonPath }); app.toast(`Unplugged ${m.name}`); app.refresh(); }
    catch (e) { app.toast(e.message, { error: true }); }
  };

  return Object.entries(byTool).map(([tid, items]) => html`
    ${!toolId && html`<div class="section-title" style="margin-top:8px"><h2>${tools[tid]?.name || tid}</h2><span class="ink-3">${plural(items.length, 'connection', 'connections')}</span></div>`}
    <div class="card" style="padding:6px;margin-bottom:22px">
      ${items.map((m) => html`
        <div class="conn">
          <span class="ic" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--plug-soft);color:var(--plug);flex:none">${ART.plug(22)}</span>
          <div class="body">
            <div style="font-weight:700">${m.name}${m.disabled ? html` <span class="tag needed">off</span>` : ''}</div>
            <div class="ink-3 truncate" style="font-size:13px">${scopeWords(m)}${app.details && m.target ? html` · <span class="mono">${m.target}</span>` : ''}</div>
          </div>
          ${m.remote
            ? html`<span class="ink-3" style="font-size:12.5px">Manage on claude.ai</span>`
            : html`
              ${app.details && html`<button class="btn small" onClick=${() => app.setDrawer({ item: { path: m.source, label: m.source.split('/').pop() }, kind: 'settings' })}>Setup file</button>`}
              ${m.removable && html`<button class="btn small" onClick=${() => remove(m)}>Unplug</button>`}`}
        </div>`)}
    </div>`);
}

function ConnectionsPage() {
  return html`
    <${Back} href="#/" label="Home" />
    <div class="head"><${Art} kind="plug" size=${72} icon=${40} /><div><h1>Connections</h1><div class="sub">Every app your AI tools can talk to</div></div></div>
    <${Tip}>${KINDS.plug.tip}<//>
    <${Connections} />`;
}

// ---------- recently deleted ----------

function DeletedPage() {
  const app = useApp();
  const [list, setList] = useState(null);
  const load = () => api('/api/trash').then(setList, (e) => app.toast(e.message, { error: true }));
  useEffect(() => { load(); }, [app.version]);

  const putBack = async (b) => {
    try { await api('/api/restore', { batch: b.batch }); app.toast('Put back ✨'); app.refresh(true); }
    catch (e) { app.toast(e.message, { error: true }); }
  };

  return html`
    <${Back} href="#/" label="Home" />
    <div class="head"><${Art} kind="trash" size=${72} icon=${40} radius=${22} /><div><h1>Recently deleted</h1><div class="sub">Changed your mind? Put things back.</div></div></div>
    ${!list && html`<${Loading} />`}
    ${list && !list.length && html`<div class="card empty"><${Byte} size=${80} mood="happy" /><h2>Nothing deleted yet</h2>Things you delete show up here.</div>`}
    ${list?.length > 0 && html`
      <div class="card list">
        ${list.map((b) => html`
          <div class="item" style="cursor:default">
            <span class="ic" style="background:var(--other-soft);color:var(--other)">${ART.trash(22)}</span>
            <div class="body">
              <div class="t truncate">${b.items.length === 1 ? 'One thing' : plural(b.items.length, 'thing', 'things')}</div>
              <div class="s truncate">${app.details ? b.items.slice(0, 3).map((i) => tilde(i.from)).join(' · ') : `Deleted ${when(b.at)}`}</div>
            </div>
            <button class="btn small" onClick=${() => putBack(b)}>Put back</button>
          </div>`)}
      </div>`}`;
}

// ---------- drawer ----------

function Drawer({ item, tool, kind, readonly, onClose, onDeleted }) {
  const app = useApp();
  const [stack, setStack] = useState([item]);
  const cur = stack.at(-1);
  const isChat = kind === 'chats' && !cur.dir && /\.jsonl?$/.test(cur.path);

  const del = async () => {
    const ok = await app.confirm({
      mood: 'think', title: `Delete “${cur.label || cur.name}”?`,
      body: ['It goes to your Trash, so you can put it back.'], yes: 'Delete',
    });
    if (!ok) return;
    try {
      await app.remove([cur.path], `“${(cur.label || cur.name).slice(0, 40)}”`);
      if (stack.length > 1) setStack(stack.slice(0, -1)); else { onDeleted?.(); onClose(); }
    } catch (e) { app.toast(e.message, { error: true }); }
  };

  return html`
    <div class="scrim" onClick=${onClose} />
    <aside class="drawer" role="dialog" aria-label=${cur.label || cur.name}>
      <div class="drawer-head">
        ${stack.length > 1
          ? html`<button class="btn quiet icon" onClick=${() => setStack(stack.slice(0, -1))} aria-label="Back">${G.back}</button>`
          : kind && html`<span class="ic" style="width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:none;background:var(--${kind}-soft);color:var(--${kind})">${ART[kind](24)}</span>`}
        <div style="flex:1;min-width:0">
          <div class="t clamp-2">${cur.label || cur.name}</div>
          <div class="s">${[cur.modified && when(cur.modified), cur.size != null && bytes(cur.size), cur.group?.split('/').pop()].filter(Boolean).join(' · ')}</div>
          ${app.details && html`<div class="s mono" style="word-break:break-all">${tilde(cur.path)}</div>`}
        </div>
        <button class="btn quiet icon" onClick=${onClose} aria-label="Close">${G.close}</button>
      </div>
      ${isChat
        ? html`<${ChatView} key=${cur.path} path=${cur.path} />`
        : html`<${FileView} key=${cur.path} item=${cur} tool=${tool} kind=${kind} readonly=${readonly}
            onOpen=${(e) => setStack([...stack, { path: e.path, name: e.name, label: e.name, dir: e.dir }])} />`}
      <div class="drawer-foot">
        ${app.details && html`<button class="btn small quiet" onClick=${() => navigator.clipboard.writeText(cur.path).then(() => app.toast('Copied'))}>${G.copy} Copy path</button>`}
        <div style="flex:1" />
        ${!readonly && kind !== 'settings' && kind !== 'rules' && html`<button class="btn" onClick=${del}>Delete</button>`}
      </div>
    </aside>`;
}

function ChatView({ path }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tools, setTools] = useState(false);
  useEffect(() => { api(`/api/chat?${qs({ path })}`).then(setData, (e) => setErr(e.message)); }, [path]);

  if (err) return html`<div class="drawer-body"><div class="empty">${err}</div></div>`;
  if (!data) return html`<div class="drawer-body"><${Loading} /></div>`;

  const steps = data.messages.filter((m) => m.role === 'tool').length;
  const msgs = data.messages.filter((m) => tools || m.role !== 'tool');

  return html`
    <div class="drawer-body">
      ${steps > 0 && html`
        <div style="display:flex;justify-content:center;margin-bottom:14px">
          <button class="btn small" onClick=${() => setTools(!tools)}>${tools ? 'Hide' : 'Show'} ${plural(steps, 'step', 'steps')} the AI took</button>
        </div>`}
      <div class="chat">
        ${msgs.slice(0, 1500).map((m) => m.role === 'tool'
          ? html`<div class="msg-tool"><b>${m.tool}</b><span class="truncate">${m.text}</span></div>`
          : html`
            <div class="msg-row ${m.role}">
              ${m.role === 'assistant' && html`<${Byte} size=${32} />`}
              <div class="msg">${m.text}</div>
            </div>`)}
        ${!msgs.length && html`<div class="empty"><${Byte} size=${64} mood="think" /><h2>Empty chat</h2>Nothing was said in this one.</div>`}
      </div>
    </div>`;
}

function FileView({ item, tool, kind, readonly, onOpen }) {
  const app = useApp();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);

  // A skill is a folder — show its SKILL.md instead of a file list.
  const target = item.dir && kind === 'addons' && !app.details ? `${item.path}/SKILL.md` : item.path;

  useEffect(() => {
    api(`/api/file?${qs({ path: target, tool: tool?.id || '', cat: item.cat?.id || '', reveal: reveal ? 1 : 0 })}`)
      .then((d) => { setData(d); setText(d.content || ''); }, (e) => setErr(e.message));
  }, [target, reveal]);

  const dirty = editing && text !== data?.content;
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await api('/api/save', { path: target, content: text });
      app.toast('Saved ✓ (old version backed up)');
      setData({ ...data, content: text }); setEditing(false);
    } catch (e) { app.toast(e.message, { error: true }); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    const on = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });

  if (err) return html`<div class="drawer-body"><div class="empty"><${Byte} size=${64} mood="think" /><h2>Can’t open this one</h2>${err}</div></div>`;
  if (!data) return html`<div class="drawer-body"><${Loading} /></div>`;

  if (data.type === 'dir') return html`
    <div class="drawer-body">
      <p class="ink-2" style="margin-top:0">A folder with ${plural(data.entries.length, 'thing', 'things')} inside.</p>
      <div class="card list" style="box-shadow:none">
        ${data.entries.map((e) => html`
          <button class="item" onClick=${() => onOpen(e)}>
            <span class="ink-3">${e.dir ? G.folder : G.file}</span><span class="t truncate" style="font-weight:600">${e.name}</span>
          </button>`)}
      </div>
    </div>`;

  if (data.type === 'secret') return html`
    <div class="drawer-body"><div class="empty">
      <span class="ink-3">${G.lock}</span>
      <h2>Your login is in here</h2>
      <p>It’s hidden so nobody sees it over your shoulder.</p>
      <button class="btn" onClick=${() => setReveal(true)}>Show it anyway</button>
    </div></div>`;

  if (data.type === 'binary') return html`
    <div class="drawer-body"><div class="empty"><${Byte} size=${64} mood="think" /><h2>Can’t show this one</h2>It’s not text — only ${tool?.name || 'the tool'} can read it.</div></div>`;

  const isCode = /\.(json|toml|ya?ml|jsonl)$/i.test(target);
  const canEdit = data.editable && !readonly;

  return html`
    <div class="drawer-body">
      ${data.truncated && html`<div class="tip">This file is big — showing the start only.</div>`}
      ${editing
        ? html`<textarea class="editor" value=${text} spellcheck=${false} onInput=${(e) => setText(e.target.value)} aria-label="Edit" />`
        : html`<div class="reader ${isCode ? 'mono' : ''}">${data.content || html`<span class="ink-3">Empty</span>`}</div>`}
    </div>
    ${canEdit && html`
      <div class="drawer-foot" style="border-top:0;padding-top:0">
        ${editing
          ? html`
            <span class="ink-3" style="font-size:12.5px">${dirty ? 'Not saved yet' : 'We back up the old version'}</span>
            <div style="flex:1" />
            <button class="btn small quiet" onClick=${() => { setText(data.content); setEditing(false); }}>Cancel</button>
            <button class="btn small primary" disabled=${!dirty || saving} onClick=${save}>${saving ? 'Saving…' : 'Save'}</button>`
          : html`<div style="flex:1" /><button class="btn small" onClick=${() => setEditing(true)}>✏️ Edit</button>`}
      </div>`}`;
}

// ---------- modal ----------

function Modal({ title, body = [], yes = 'OK', mood = 'think', onDone }) {
  const cancel = useRef();
  useEffect(() => { cancel.current?.focus(); }, []);
  return html`
    <div class="modal-wrap" onClick=${() => onDone(false)}>
      <div class="card modal" role="alertdialog" aria-modal="true" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
        <${Byte} size=${64} mood=${mood} />
        <h2>${title}</h2>
        ${[].concat(body).map((p) => html`<p>${p}</p>`)}
        <div class="modal-actions">
          <button class="btn" ref=${cancel} onClick=${() => onDone(false)}>Keep it</button>
          <button class="btn danger" onClick=${() => onDone(true)}>${yes}</button>
        </div>
      </div>
    </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
