// The office: Claude Code sessions, chat history, stats, replay log, approvals, pairing, saved people and names.
// One office per hub. Everything lives in memory and is saved to one JSON file (see save()).
// Same rules and limits as the former Supabase backend it replaces.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HOUR = 3600e3;
const SILENT_AFTER = 6 * HOUR;
const STATS_DAYS = 16;
const HISTORY_FOR = 2 * 24 * HOUR;
const HISTORY_MAX = 8000;
const MESSAGES_MAX = 300;
const TOOL_STALE = 10 * 60e3;
const APPROVAL_FOR = 10 * 60e3;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** 6 characters of 31 (no look-alikes): about 887 million codes. */
const CODE_LENGTH = 6;

export class HubError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const secret = () => crypto.randomBytes(32).toString('hex');
const hash = (s) => crypto.createHash('sha256').update(s ?? '', 'utf8').digest('hex');
const iso = (ms) => new Date(ms).toISOString();
const utcHour = (ms = Date.now()) => Math.floor(ms / HOUR) * HOUR;
const folder = (cwd) => (cwd ?? '').replace(/^.*[\\/]/, '');
const left = (s, n) => (s == null ? s : String(s).slice(0, n));
const nonEmpty = (s) => (s == null || s === '' ? undefined : s);

function toolDetail(tool, input = {}) {
  let d;
  if (['Read', 'Edit', 'MultiEdit', 'Write'].includes(tool)) {
    d = folder(input.file_path);
  } else if (tool === 'NotebookEdit') {
    d = folder(input.notebook_path);
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    d = input.description || (input.command ?? '').trim().split(' ')[0];
  } else if (tool === 'Grep' || tool === 'Glob') {
    d = input.pattern;
  } else if (tool === 'WebSearch') {
    d = input.query;
  } else if (tool === 'WebFetch') {
    d = /^[a-zA-Z]+:\/\/([^/:?#]+)/.exec(input.url ?? '')?.[1];
  } else if (tool === 'Agent' || tool === 'Task') {
    d = input.description || input.subagent_type;
  } else if (tool === 'Skill') {
    d = input.skill ?? input.name;
  } else if (tool?.startsWith('mcp__')) {
    d = tool.split('__')[1];
  }
  d = typeof d === 'string' ? d.trim() : undefined;
  return d ? d.slice(0, 60) : undefined;
}

const toolLabel = (tool) => (tool?.startsWith('mcp__') ? `MCP · ${tool.split('__')[1]}` : tool);

function emptyData() {
  return {
    ingestKey: secret(),
    visitorToken: null,
    away: false,
    devices: {},
    sessions: {},
    messages: {},
    nextMessage: 1,
    statHours: {},
    statFiles: {},
    careers: {},
    history: [],
    nextHistory: 1,
    people: {},
    labels: {},
  };
}

export class Office {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file) ? { ...emptyData(), ...JSON.parse(fs.readFileSync(file, 'utf8')) } : emptyData();
    this.approvals = new Map();
    this.dirty = true;
    this.listeners = new Set();
  }

  /** Called with no arguments whenever the live office changes. */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    this.dirty = true;
    this.listeners.forEach((fn) => fn());
  }

  save() {
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  // ---------------------------------------------------------------- devices and pairing

  mustHome(token) {
    if (!token || !this.data.devices[hash(token)]) {
      throw new HubError('not paired', 401);
    }
  }

  checkKey(key) {
    if (!key || key !== this.data.ingestKey) {
      throw new HubError('unknown key', 401);
    }
  }

  /** A browser on this computer (the hub only listens here) gets its own device token, stored only as a hash. */
  join() {
    const token = secret();
    this.data.devices[hash(token)] = iso(Date.now());
    this.changed();
    return token;
  }

  /** The office code devices elsewhere connect with (see link.mjs), and the device token their requests run as. */
  remote() {
    if (this.data.officeCode?.length !== CODE_LENGTH) {
      this.newCode();
    }
    return { code: this.data.officeCode, token: this.data.remoteToken };
  }

  /** A new office code: every device elsewhere loses access until it's given the new one. */
  newCode() {
    if (this.data.remoteToken) {
      delete this.data.devices[hash(this.data.remoteToken)];
    }
    this.data.officeCode = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    this.data.remoteToken = secret();
    this.data.devices[hash(this.data.remoteToken)] = iso(Date.now());
    this.changed();
    return this.data.officeCode;
  }

  forgetDevice(token) {
    delete this.data.devices[hash(token)];
    this.changed();
  }

  // ---------------------------------------------------------------- sessions (with the replay log the SQL trigger kept)

  logHistory(s, state) {
    const tool = state === 'tool' ? s.tool : undefined;
    this.data.history.push({
      id: this.data.nextHistory++, at: iso(Date.now()), agentId: s.id, kind: s.kind, agentType: s.agentType, parent: s.parent,
      machine: nonEmpty(s.machine), project: nonEmpty(folder(s.cwd)), state, tool, detail: state === 'tool' ? s.detail : undefined,
    });
  }

  insertSession(s) {
    const now = iso(Date.now());
    const row = {
      kind: 'main', agentType: 'main', parent: null, machine: '', cwd: '', title: null, description: null, model: null, mode: null,
      state: 'starting', since: now, startedAt: now, lastAt: now, tool: null, detail: null, prompts: 0, toolCalls: 0, errors: 0,
      error: null, background: 0, pendingTask: null, turnAt: null, ...s,
    };
    this.data.sessions[row.id] = row;
    this.logHistory(row, row.state);
    return row;
  }

  /** Applies changes to a session; the replay log records state changes and, while on a tool, tool changes. */
  update(id, changes) {
    const s = this.data.sessions[id];
    if (!s) {
      return;
    }
    const was = { state: s.state, tool: s.tool, detail: s.detail };
    if ('state' in changes && changes.state !== s.state) {
      s.since = iso(Date.now());
    }
    Object.assign(s, changes);
    if (s.state !== was.state || (s.state === 'tool' && (s.tool !== was.tool || s.detail !== was.detail))) {
      this.logHistory(s, s.state);
    }
  }

  deleteSession(id) {
    const s = this.data.sessions[id];
    if (!s) {
      return;
    }
    delete this.data.sessions[id];
    delete this.data.messages[id];
    this.logHistory(s, 'ended');
  }

  note(id, role, text) {
    if (!text || !this.data.sessions[id]) {
      return;
    }
    const list = (this.data.messages[id] ??= []);
    list.push({ id: this.data.nextMessage++, at: iso(Date.now()), role, text: String(text).slice(0, 8000) });
    if (list.length > MESSAGES_MAX) {
      list.splice(0, list.length - MESSAGES_MAX);
    }
  }

  /** Adds to today's counters and the career of the staff member behind main session `sid`. */
  tally(sid, { sessions = 0, prompts = 0, tool = null, errors = 0, turns = 0, longest = 0, file = null } = {}) {
    const s = this.data.sessions[sid];
    if (!s) {
      return;
    }
    const project = folder(s.cwd);
    const hour = utcHour();
    const hk = `${hour}|${s.machine}|${project}`;
    const h = (this.data.statHours[hk] ??= { hour, machine: s.machine, project, sessions: 0, prompts: 0, toolCalls: 0, errors: 0, turns: 0, longestMin: 0, tools: {} });
    h.sessions += sessions;
    h.prompts += prompts;
    h.toolCalls += tool ? 1 : 0;
    h.errors += errors;
    h.turns += turns;
    h.longestMin = Math.max(h.longestMin, longest);
    if (tool) {
      h.tools[tool] = (h.tools[tool] ?? 0) + 1;
    }
    const today = new Date().toISOString().slice(0, 10);
    const ck = `${s.machine}|${project}`;
    const now = iso(Date.now());
    const c = (this.data.careers[ck] ??= { machine: s.machine, project, sessions: 0, prompts: 0, toolCalls: 0, turns: 0, tools: {}, daysWorked: 1, lastDay: today, firstSeen: now, lastSeen: now });
    c.sessions += sessions;
    c.prompts += prompts;
    c.toolCalls += tool ? 1 : 0;
    c.turns += turns;
    if (tool) {
      c.tools[tool] = (c.tools[tool] ?? 0) + 1;
    }
    if (c.lastDay < today) {
      c.daysWorked += 1;
    }
    c.lastDay = today;
    c.lastSeen = now;
    if (file) {
      const files = (this.data.statFiles[hour] ??= []);
      const fh = hash(file).slice(0, 32);
      if (!files.includes(fh)) {
        files.push(fh);
      }
    }
  }

  /** Sessions that went silent without a SessionEnd, old stats, the replay log and expired requests. */
  sweep() {
    const now = Date.now();
    for (const s of Object.values(this.data.sessions)) {
      if (Date.parse(s.lastAt) < now - SILENT_AFTER) {
        this.deleteSession(s.id);
      }
    }
    const statsFrom = now - STATS_DAYS * 24 * HOUR;
    for (const [k, h] of Object.entries(this.data.statHours)) {
      if (h.hour < statsFrom) {
        delete this.data.statHours[k];
      }
    }
    for (const hour of Object.keys(this.data.statFiles)) {
      if (Number(hour) < statsFrom) {
        delete this.data.statFiles[hour];
      }
    }
    const historyFrom = iso(now - HISTORY_FOR);
    this.data.history = this.data.history.filter((e) => e.at >= historyFrom).slice(-HISTORY_MAX);
    for (const [id, a] of this.approvals) {
      if (a.expiresAt < now) {
        this.approvals.delete(id);
      }
    }
    this.changed();
  }

  // ---------------------------------------------------------------- one Claude Code hook event

  ingest(key, machineHeader, evt) {
    this.checkKey(key);
    const sid = left(evt?.session_id, 100);
    const name = evt?.hook_event_name;
    if (!sid || !name) {
      return;
    }
    const sessions = this.data.sessions;
    const agent = left(evt.agent_id, 100);
    const tool = evt.tool_name;
    const label = toolLabel(tool);
    const machine = left(machineHeader ?? '', 40);

    if (name === 'SessionEnd') {
      const s = sessions[sid];
      if (s) {
        this.tally(sid, { longest: Math.floor((Date.now() - Date.parse(s.startedAt)) / 60e3) });
      }
      for (const id of Object.keys(sessions)) {
        if (sessions[id].sessionId === sid) {
          this.deleteSession(id);
        }
      }
      this.changed();
      return;
    }

    const model = typeof evt.model === 'string' ? evt.model : evt.model && typeof evt.model === 'object' ? (evt.model.display_name ?? evt.model.id) : undefined;
    if (!sessions[sid]) {
      this.insertSession({ id: sid, sessionId: sid, machine });
    }
    const main = sessions[sid];
    main.lastAt = iso(Date.now());
    // the folder the session started in: its project (and so its team and that team's name) stays put when Claude moves into a subfolder
    main.cwd = main.cwd || evt.cwd || '';
    main.mode = evt.permission_mode ?? main.mode;
    main.model = model ?? main.model;
    main.machine = machine || main.machine;

    // events from inside a subagent carry agent_id: they act on the subagent's own row
    let id = sid;
    if (agent) {
      id = `${sid}:${agent}`;
      if (!sessions[id]) {
        this.insertSession({
          id, sessionId: sid, kind: 'sub', agentType: evt.agent_type ?? 'general-purpose', parent: sid, machine: main.machine, cwd: main.cwd,
          state: 'thinking', description: main.pendingTask,
        });
        main.pendingTask = null;
      }
      sessions[id].lastAt = iso(Date.now());
    }
    const prev = sessions[id]?.state;

    switch (name) {
      case 'SessionStart':
        if (!agent) {
          this.update(sid, {
            agentType: evt.agent_type ?? 'main', title: left(evt.session_title, 120) ?? main.title, tool: null, detail: null,
            state: evt.source === 'compact' ? 'thinking' : 'starting',
          });
          if (evt.source !== 'compact') {
            this.tally(sid, { sessions: 1 });
          }
          this.sweep();
        }
        break;
      case 'UserPromptSubmit':
        this.update(sid, { prompts: main.prompts + 1, error: null, tool: null, detail: null, turnAt: iso(Date.now()), state: 'thinking' });
        this.tally(sid, { prompts: 1 });
        this.note(sid, 'user', evt.prompt);
        break;
      case 'PreToolUse': {
        const detail = toolDetail(tool, evt.tool_input ?? {});
        const s = sessions[id];
        this.update(id, { tool: label, detail: detail ?? null, toolCalls: s.toolCalls + 1, state: tool === 'AskUserQuestion' || tool === 'ExitPlanMode' ? 'permission' : 'tool' });
        const input = evt.tool_input ?? {};
        this.tally(sid, { tool: label, file: ['Edit', 'Write', 'MultiEdit'].includes(tool) ? input.file_path : tool === 'NotebookEdit' ? input.notebook_path : null });
        this.note(id, 'tool', label + (detail ? ` · ${detail}` : ''));
        if (!agent && (tool === 'Agent' || tool === 'Task')) {
          main.pendingTask = detail ?? null;
        }
        break;
      }
      case 'PermissionRequest':
        this.update(id, { state: 'permission' });
        this.note(id, 'note', `Asking to use ${label ?? 'a tool'}`);
        break;
      case 'PostToolUse':
        this.update(id, { state: 'thinking' });
        break;
      case 'PermissionDenied':
        this.update(id, { state: 'thinking' });
        this.note(id, 'note', `${label ?? 'Tool'} was denied`);
        break;
      case 'PostToolUseFailure':
        this.update(id, { errors: sessions[id].errors + 1, state: 'thinking' });
        this.tally(sid, { errors: 1 });
        this.note(id, 'note', `${label ?? 'Tool'} failed`);
        break;
      case 'Notification': {
        const type = evt.notification_type ?? (/permission/i.test(evt.message ?? '') ? 'permission_prompt' : undefined);
        if (type === 'permission_prompt' || type === 'elicitation_dialog') {
          this.update(id, { state: 'permission' });
        } else if (type === 'idle_prompt' && !agent) {
          this.update(sid, { state: 'idle' });
        }
        break;
      }
      case 'PreCompact':
        this.update(sid, { state: 'compacting' });
        this.note(sid, 'note', 'Compacting its context');
        break;
      case 'PostCompact':
        this.update(sid, { state: 'thinking' });
        break;
      case 'Stop':
        if (!agent) {
          const count = (v) => (Array.isArray(v) ? v.length : 0);
          this.tally(sid, { turns: 1, longest: Math.floor((Date.now() - Date.parse(main.startedAt)) / 60e3) });
          this.update(sid, { tool: null, detail: null, turnAt: null, background: count(evt.background_tasks) + count(evt.session_crons), state: 'idle' });
          this.note(sid, 'assistant', evt.last_assistant_message);
        }
        break;
      case 'StopFailure':
        this.update(sid, { errors: main.errors + 1, error: left(evt.error ?? 'unknown', 60), tool: null, detail: null, turnAt: null, state: 'error' });
        this.tally(sid, { errors: 1 });
        this.note(sid, 'note', `Stopped: ${String(evt.error ?? 'unknown error').replace(/_/g, ' ')}`);
        break;
      case 'SubagentStart':
        if (agent) {
          this.update(id, { state: 'thinking' });
        }
        break;
      case 'SubagentStop':
        if (agent) {
          this.note(sid, 'note', `Helper finished: ${evt.agent_type ?? 'subagent'}`);
          this.deleteSession(id);
        }
        break;
    }
    if (this.data.history.length > HISTORY_MAX) {
      this.data.history.splice(0, this.data.history.length - HISTORY_MAX);
    }
    this.changed();
  }

  // ---------------------------------------------------------------- viewing

  liveState(s) {
    return s.state === 'tool' && Date.parse(s.since) < Date.now() - TOOL_STALE ? 'thinking' : s.state;
  }

  live() {
    const from = Date.now() - SILENT_AFTER;
    return Object.values(this.data.sessions)
      .filter((s) => Date.parse(s.lastAt) > from)
      .sort((p, q) => p.kind.localeCompare(q.kind) || p.id.localeCompare(q.id));
  }

  snapshot(token) {
    this.mustHome(token);
    const now = Date.now();
    const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
    return this.live().map((s) => {
      const state = this.liveState(s);
      const approval = this.data.away
        ? [...this.approvals.values()].filter((a) => a.agentId === s.id && !a.decision && a.expiresAt > now).sort((p, q) => q.createdAt - p.createdAt)[0]
        : undefined;
      const recent = (this.data.messages[s.id] ?? []).filter((m) => m.role === 'tool' || m.role === 'note').slice(-6).reverse()
        .map((m) => ({ ago: Math.floor((now - Date.parse(m.at)) / 1000), text: m.text.slice(0, 80) }));
      return strip({
        id: s.id, kind: s.kind, type: s.agentType, parent: s.parent, machine: nonEmpty(s.machine), project: nonEmpty(folder(s.cwd)),
        title: s.title, description: s.description, model: s.model, mode: s.mode, state,
        busy: ['thinking', 'tool', 'compacting'].includes(state), waiting: state === 'permission',
        tool: state === 'tool' ? s.tool : undefined, detail: state === 'tool' ? s.detail : undefined,
        stateFor: Math.floor((now - Date.parse(s.since)) / 1000), age: Math.floor((now - Date.parse(s.startedAt)) / 1000),
        prompts: s.prompts, toolCalls: s.toolCalls, errors: s.errors, error: s.error, background: s.background,
        subagents: Object.values(this.data.sessions).filter((c) => c.parent === s.id).length,
        approval: approval && strip({ id: approval.id, tool: approval.tool, detail: approval.detail }),
        recent,
      });
    });
  }

  messages(token, agentId, after = 0) {
    this.mustHome(token);
    return (this.data.messages[agentId] ?? []).filter((m) => m.id > (after ?? 0)).slice(-120);
  }

  installInfo(token) {
    this.mustHome(token);
    return { ingestKey: this.data.ingestKey };
  }

  // ---------------------------------------------------------------- stats and careers

  stats(token, tzOffset = 0) {
    this.mustHome(token);
    const off = Math.max(-840, Math.min(840, Number(tzOffset) || 0)) * 60e3;
    const dayOf = (ms) => new Date(ms + off).toISOString().slice(0, 10);
    const today = dayOf(Date.now());
    const days = new Map();
    const per = new Map();
    for (const h of Object.values(this.data.statHours)) {
      const day = dayOf(h.hour);
      const d = days.get(day) ?? { day, sessions: 0, prompts: 0, toolCalls: 0, files: 0, errors: 0, turns: 0, longestMin: 0, tools: {} };
      d.sessions += h.sessions;
      d.prompts += h.prompts;
      d.toolCalls += h.toolCalls;
      d.errors += h.errors;
      d.turns += h.turns;
      d.longestMin = Math.max(d.longestMin, h.longestMin);
      for (const [t, n] of Object.entries(h.tools)) {
        d.tools[t] = (d.tools[t] ?? 0) + n;
      }
      days.set(day, d);
      const pk = `${day}|${h.machine}|${h.project}`;
      per.set(pk, { day, machine: h.machine, project: h.project, toolCalls: (per.get(pk)?.toolCalls ?? 0) + h.toolCalls });
    }
    const files = new Map();
    for (const [hour, hashes] of Object.entries(this.data.statFiles)) {
      const day = dayOf(Number(hour));
      const set = files.get(day) ?? new Set();
      hashes.forEach((x) => set.add(x));
      files.set(day, set);
    }
    for (const d of days.values()) {
      d.files = files.get(d.day)?.size ?? 0;
      const top = [...per.values()].filter((p) => p.day === d.day && p.toolCalls > 0).sort((p, q) => q.toolCalls - p.toolCalls)[0];
      if (top) {
        d.busiest = { machine: top.machine, project: top.project, toolCalls: top.toolCalls };
      }
    }
    const from = dayOf(Date.now() - 14 * 24 * HOUR);
    const list = [...days.values()].filter((d) => d.day >= from && d.day <= today).sort((p, q) => q.day.localeCompare(p.day));
    const careers = Object.values(this.data.careers);
    return {
      today: list.find((d) => d.day === today) ?? { day: today, sessions: 0, prompts: 0, toolCalls: 0, files: 0, errors: 0, turns: 0, longestMin: 0, tools: {} },
      history: list.filter((d) => d.day < today),
      lifetimeTurns: careers.reduce((n, c) => n + c.turns, 0),
      careers: careers.sort((p, q) => q.lastSeen.localeCompare(p.lastSeen)).slice(0, 50).map((c) => ({
        machine: c.machine, project: c.project, daysWorked: c.daysWorked, sessions: c.sessions, prompts: c.prompts, toolCalls: c.toolCalls,
        turns: c.turns, topTool: Object.entries(c.tools).sort((p, q) => q[1] - p[1])[0]?.[0], firstSeen: c.firstSeen, lastSeen: c.lastSeen,
      })),
    };
  }

  /** Changes since `since` (at most 2 days back), oldest first; agents still around get their last earlier change first. */
  history(token, since) {
    this.mustHome(token);
    const from = iso(Math.max(Date.parse(since ?? '') || Date.now(), Date.now() - HISTORY_FOR));
    const before = new Map();
    for (const e of this.data.history) {
      if (e.at < from) {
        before.set(e.agentId, e);
      }
    }
    const out = [...before.values()].filter((e) => e.state !== 'ended').concat(this.data.history.filter((e) => e.at >= from));
    return out.map((e) => ({ at: e.at, id: e.agentId, kind: e.kind, type: e.agentType, parent: e.parent ?? undefined, machine: e.machine, project: e.project, state: e.state, tool: e.tool, detail: e.detail }));
  }

  // ---------------------------------------------------------------- visitor links: states only

  visitorLink(token) {
    this.mustHome(token);
    this.data.visitorToken ??= secret();
    this.changed();
    return this.data.visitorToken;
  }

  visitorRevoke(token) {
    this.mustHome(token);
    this.data.visitorToken = null;
    this.changed();
  }

  visitorSnapshot(visitor) {
    if (!visitor || visitor !== this.data.visitorToken) {
      throw new HubError('unknown visitor link', 401);
    }
    const vid = (id) => hash(`v:${id}`).slice(0, 16);
    return this.live().map((s) => {
      const state = this.liveState(s);
      return {
        id: vid(s.id), kind: s.kind, type: s.agentType, ...(s.parent ? { parent: vid(s.parent) } : {}), project: '', state,
        busy: ['thinking', 'tool', 'compacting'].includes(state), waiting: state === 'permission',
      };
    });
  }

  // ---------------------------------------------------------------- away mode: approvals from a paired device

  awayInfo(token) {
    this.mustHome(token);
    return { away: this.data.away };
  }

  setAway(token, on) {
    this.mustHome(token);
    this.data.away = !!on;
    if (!on) {
      this.approvals.clear();
    }
    this.changed();
  }

  pendingApprovals(token) {
    this.mustHome(token);
    if (!this.data.away) {
      return [];
    }
    const now = Date.now();
    return [...this.approvals.values()].filter((a) => !a.decision && a.expiresAt > now).sort((p, q) => p.createdAt - q.createdAt)
      .map((a) => ({ id: a.id, agentId: a.agentId, tool: a.tool, ...(a.detail ? { detail: a.detail } : {}), at: iso(a.createdAt) }));
  }

  decide(token, request, allow) {
    this.mustHome(token);
    const a = this.approvals.get(request);
    if (!this.data.away || !a || a.decision || a.expiresAt <= Date.now()) {
      throw new HubError('this request expired or was already answered');
    }
    a.decision = allow ? 'allow' : 'deny';
    this.changed();
  }

  /** The approvals hook on a computer: registers a PermissionRequest (request null), then polls it by id. */
  approvalWait(key, request, event) {
    this.checkKey(key);
    if (!this.data.away) {
      return { state: 'off' };
    }
    if (!request) {
      if (!event?.session_id) {
        throw new HubError('missing event');
      }
      const tool = event.tool_name;
      const command = typeof event.tool_input?.command === 'string' ? event.tool_input.command.trim() : '';
      const a = {
        id: crypto.randomUUID(), agentId: left(event.session_id, 100) + (event.agent_id ? `:${left(event.agent_id, 100)}` : ''),
        tool: toolLabel(tool) ?? 'a tool',
        // the approver should see what they approve: the command itself, kept only until answered
        detail: (tool === 'Bash' || tool === 'PowerShell') && command ? command.slice(0, 300) : toolDetail(tool, event.tool_input ?? {}),
        createdAt: Date.now(), expiresAt: Date.now() + APPROVAL_FOR, decision: null,
      };
      this.approvals.set(a.id, a);
      this.changed();
      return { state: 'pending', id: a.id };
    }
    const a = this.approvals.get(request);
    if (!a || a.expiresAt <= Date.now()) {
      this.approvals.delete(request);
      return { state: 'expired' };
    }
    if (a.decision) {
      this.approvals.delete(request);
      this.changed();
      return { state: a.decision };
    }
    return { state: 'pending', id: request };
  }

  // ---------------------------------------------------------------- saved people and names, shared by every device

  people(token) {
    this.mustHome(token);
    return this.data.people;
  }

  savePerson(token, slot, person) {
    this.mustHome(token);
    if (typeof slot !== 'string' || !slot || slot.length > 120 || !person || typeof person !== 'object' || JSON.stringify(person).length > 4096) {
      throw new HubError('not a person');
    }
    this.data.people[slot] = typeof person.name === 'string' ? { ...person, name: person.name.trim().slice(0, 24) } : person;
    this.changed();
  }

  forgetPerson(token, slot) {
    this.mustHome(token);
    delete this.data.people[slot];
    this.changed();
  }

  labels(token) {
    this.mustHome(token);
    return this.data.labels;
  }

  saveLabel(token, key, name) {
    this.mustHome(token);
    const clean = String(name ?? '').trim().slice(0, 40);
    if (typeof key !== 'string' || !key || key.length > 120 || !clean) {
      throw new HubError('not a name');
    }
    this.data.labels[key] = clean;
    this.changed();
  }

  forgetLabel(token, key) {
    this.mustHome(token);
    delete this.data.labels[key];
    this.changed();
  }
}
