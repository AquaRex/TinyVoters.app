import { app } from '../app';
import { Agent, Task } from '../agents/agent';
import type { Director } from '../agents/director';
import { NEED_IDS, NeedId, urgency } from '../agents/needs';
import { FRIEND, affinity, colleagues } from '../agents/relationships';
import { roomAt, roomName } from '../agents/rooms';
import { Conversation, readTime } from '../agents/social';
import { deviceToken, messages } from '../cloud/api';
import { Priority, REACTION, REPLY, ROUTINE, engine, mindStats } from './engine';
import officeLife from './officeLife.json';

/** A concrete thing an agent can do next, as the director ranks it. */
export interface Choice {
  label: string;
  u: number;
  make: () => Task | null;
}

/** Marks lines the model wrote, in front of the bubble text. */
export const AI_MARK = '·';

// ---------------------------------------------------------------- switching AI staff on and off

const PREF = 'tiny-agents.ai.v1';

/** On by default; off only when switched off in Settings. */
export function aiWanted(): boolean {
  try {
    return localStorage.getItem(PREF) !== 'off';
  } catch {
    return true;
  }
}

/** AI staff on (the shared engine loads, every worker gets its own mind) or off (the rule-based brain). */
export function setAi(on: boolean): void {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off');
  } catch {
    // storage unavailable: the switch lasts for this session
  }
  if (on) {
    void engine.start();
  } else {
    engine.stop();
  }
}

export function aiOn(): boolean {
  return engine.ready;
}

// ---------------------------------------------------------------- each worker's own mind

/** One worker's mind: its persona, short memory, and what it last decided and said. */
export interface Mind {
  system: string;
  memory: string[];
  /** when this mind first came to work today (performance.now) */
  since: number;
  last: { options: string[]; chosen: string; say: string; at: number; ms: number } | null;
  lastLine: { text: string; at: number; ms: number } | null;
  /** the latest private thought (shown in the worker's window, never said aloud, and on its mind in every prompt) */
  thought: { text: string; at: number; ms: number } | null;
  /** the moment that thought was about (see moment()) */
  thoughtOf: string;
  /** what it intends to do next when free (an option label like "coffee" or "chat with Theo"), from a thought or a talk */
  plan: { label: string; at: number } | null;
  /** what others told it today, which it may pass on if it finds it interesting */
  heard: { from: string; text: string; at: number }[];
  /** when it next thinks on its own (performance.now) */
  nextThought: number;
}

const minds = new WeakMap<Agent, Mind>();

export function mindOf(a: Agent): Mind | undefined {
  return minds.get(a);
}

/** The agent's mind when AI staff are on and it may use one (Claude subagents don't: they're always at work). */
function mind(a: Agent): Mind | undefined {
  if (!engine.ready || a.isSub || a.gone || a.leaving || !a.arrived) {
    return undefined;
  }
  let m = minds.get(a);
  if (!m) {
    m = { system: persona(a), memory: [], since: performance.now(), last: null, lastLine: null, thought: null, thoughtOf: '', plan: null, heard: [], nextThought: performance.now() + 5000 + Math.random() * 40000 };
    minds.set(a, m);
    noteTurn(a);
  }
  return m;
}

/** Whether the agent's mind has a request with the model right now (shown as "…" over its head). */
export function thinking(a: Agent): boolean {
  return engine.pending.has(a);
}

function ask(a: Agent, m: Mind, priority: Priority, kind: string, user: string, schema: object, maxTokens: number, stale?: () => boolean, temperature = 0.7): Promise<Record<string, unknown> | null> {
  return engine.ask(a, priority, kind, [{ role: 'system', content: m.system }, { role: 'user', content: user }], schema, maxTokens, stale, temperature).then((r) => r?.json ?? null);
}

/** Says a model-written line, marked as such, and remembers it for the panel. */
function speak(a: Agent, m: Mind, text: string, ms: number): void {
  a.say(text, readTime(text), AI_MARK);
  m.lastLine = { text, at: performance.now(), ms };
}

// ---------------------------------------------------------------- who can hear whom

function onDoor(a: Agent): boolean {
  const item = a.floor.office.itemAt(a.tx, a.ty, 'object');
  return !!item && !!a.floor.office.defOf(item)?.door;
}

/** Within earshot: same floor, both visible, in the same room (or one in the doorway) and within 4 tiles. */
export function earshot(a: Agent, b: Agent): boolean {
  if (a === b || a.floor !== b.floor || a.hidden || b.hidden || a.alpha < 1 || b.alpha < 1 || a.tilesTo(b) > 4) {
    return false;
  }
  const nav = a.floor.nav;
  return nav.roomOf(a.tx, a.ty) === nav.roomOf(b.tx, b.ty) || ((onDoor(a) || onDoor(b)) && a.tilesTo(b) <= 2);
}

/** What the person said aloud in the last 10 s (their own words, not status bubbles like "?" or "ding!"), else ''. */
function justSaid(b: Agent): string {
  return b.said && b.said.icon === AI_MARK && performance.now() - b.said.at < 10000 ? b.said.text : '';
}

function listeners(a: Agent): Agent[] {
  return a.floor.agents.filter((b) => earshot(a, b));
}

/** Free to answer and chat: here, not working, not waiting for you, not in transit or another conversation. */
function free(a: Agent): boolean {
  return a.arrived && !a.leaving && !a.locked && !a.info.busy && !a.info.waiting && !a.conv && !!mind(a);
}

/** Can answer a line said nearby with a quick reply (also from the desk while working), without starting a chat. */
function canAnswer(a: Agent): boolean {
  return a.arrived && !a.leaving && !a.conv && !!mind(a);
}

// ---------------------------------------------------------------- memory of today: people talked to, and about what

interface Pair {
  count: number;
  /** epoch ms */
  at: number;
  gist: string;
}

const MEM_KEY = 'tiny-agents.minds.v1';
const today = new Date().toDateString();
const pairs: Record<string, Record<string, Pair>> = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(MEM_KEY) ?? '{}') as { day?: string; pairs?: Record<string, Record<string, Pair>> };
    return saved.day === today ? saved.pairs ?? {} : {};
  } catch {
    return {};
  }
})();
let saveAt = 0;

function savePairs(): void {
  if (performance.now() < saveAt) {
    return;
  }
  saveAt = performance.now() + 5000;
  try {
    localStorage.setItem(MEM_KEY, JSON.stringify({ day: today, pairs }));
  } catch {
    // storage unavailable: today's memory lasts for this visit
  }
}

const counted = new WeakSet<Conversation>();

/** A conversation line was said: both remember having talked today, and the gist of it. */
function noteTalk(conv: Conversation): void {
  const lines = conv.log;
  if (lines.length < 2) {
    return;
  }
  const gist = clip(lines[0].text, 40);
  const fresh = !counted.has(conv);
  counted.add(conv);
  for (const a of conv.members) {
    for (const b of conv.members) {
      if (a === b) {
        continue;
      }
      const mine = (pairs[a.slot] ??= {});
      const p = mine[b.slot] ?? { count: 0, at: 0, gist: '' };
      mine[b.slot] = { count: p.count + (fresh ? 1 : 0), at: Date.now(), gist: fresh ? gist : p.gist || gist };
    }
  }
  savePairs();
}

function ago(ms: number): string {
  const min = Math.round(ms / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

/** One line about someone: who they are to me, what we talked about today, what they're doing and how busy they look. */
function about(a: Agent, b: Agent): string {
  const tie = affinity(a, b) >= FRIEND ? 'friend' : colleagues(a, b) ? 'teammate' : affinity(a, b) > 0.1 ? 'colleague' : 'barely know them';
  const p = pairs[a.slot]?.[b.slot];
  const talked = p ? `talked ${p.count === 1 ? 'once' : `${p.count} times`} today, last ${ago(Date.now() - p.at)} about "${p.gist}"` : 'not talked today';
  const doing = b.info.waiting ? 'waiting on their boss' : b.info.busy ? (b.seated ? 'typing hard' : 'busy') : b.task?.kind === 'lunch' ? 'at lunch' : 'on a break';
  const said = justSaid(b) ? `, just said "${justSaid(b)}"` : '';
  return `${b.name} (${b.role.title}, ${tie}, ${talked}; ${doing}: ${b.statusText.replace(/ · .*/, '').toLowerCase()}${said})`;
}

// ---------------------------------------------------------------- perception

const DUTY: Record<string, string> = {
  chef: 'cook and serve lunch', it: 'run the IT help desk', guard: 'keep the building safe',
  reception: 'welcome people at reception', cleaner: 'keep the office clean',
};
const FEEL: Record<NeedId, string> = { energy: 'tired', thirst: 'thirsty', hunger: 'hungry', bladder: 'needs the restroom', social: 'lonely', comfort: 'stiff' };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trim()}…` : s).replace(/\s+/g, ' ');

function traits(a: Agent): string {
  const t = a.traits;
  const words = [
    t.sociability > 0.65 ? 'sociable' : t.sociability < 0.35 ? 'shy' : '',
    t.chattiness > 0.65 ? 'chatty' : '',
    t.coffee > 0.7 ? 'loves coffee' : '',
    t.diligence > 0.7 ? 'hard-working' : t.diligence < 0.35 ? 'laid-back' : '',
    t.playful > 0.65 ? 'playful' : '',
    t.bookish > 0.6 ? 'bookish' : '',
    t.outdoorsy > 0.65 ? 'outdoorsy' : '',
  ].filter(Boolean);
  return (words.length ? words : ['friendly']).slice(0, 3).join(', ');
}

function persona(a: Agent): string {
  return `You are ${a.name}, ${a.npc ? 'the' : 'a'} ${a.role.title} at a small cozy office. You are ${traits(a)}. Talk like yourself: casual and natural, with a sense of humour, about what's going on and your work. Never quote your work, put it in your own words. Answer only with JSON.`;
}

function innerVoice(a: Agent): string {
  return `You are ${a.name}, ${a.npc ? 'the' : 'a'} ${a.role.title} at a small cozy office. You are ${traits(a)}. These are your private thoughts, never said out loud: honest, in your own voice, the way people really think. Answer only with JSON.`;
}

/** The gist of a Claude agent's real session: what was last asked and answered (fetched when a turn ends). */
const session = new WeakMap<Agent, string>();

/** A Claude agent finished a turn: refresh the short summary of its session for its mind. */
export function noteTurn(a: Agent): void {
  if (!engine.ready || !a.claude || a.isSub || !deviceToken()) {
    return;
  }
  messages(a.info.id)
    .then((all) => {
      const user = [...all].reverse().find((m) => m.role === 'user')?.text;
      const reply = [...all].reverse().find((m) => m.role === 'assistant')?.text;
      session.set(a, [user ? `asked "${clip(user, 90)}"` : '', reply ? `answered "${clip(reply, 90)}"` : ''].filter(Boolean).join('; '));
    })
    .catch(() => undefined);
}

function place(a: Agent): string {
  const d = a.floor;
  const floor = app.floors.find((f) => f.director === d)?.label ?? '';
  const room = roomAt(d, a.tx, a.ty);
  const where = room ? roomName(d, room) : d.office.isOutdoor(a.tx, a.ty) ? 'outside' : 'the hallway';
  return `${floor}, ${where}`;
}

function clock(d: Director): string {
  const h = d.hour;
  return `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}

function work(a: Agent): string {
  if (a.npc) {
    return DUTY[a.role.id] ?? '';
  }
  const i = a.info;
  const going = (i.errors ?? 0) > 2 ? 'going badly' : i.busy ? 'in progress' : 'paused';
  const title = i.title ? `${clip(i.title, 50)} (${going})` : '';
  return [i.project && title ? `${i.project}: ${title}` : title, i.busy && i.tool ? `${i.tool}${i.detail ? ' ' + clip(i.detail, 30) : ''}` : '', session.get(a) ?? ''].filter(Boolean).join('; ');
}

/** What someone is working on, in a few words (for chat topics). */
export function topicOf(b: Agent): string {
  if (b.npc) {
    return DUTY[b.role.id] ?? 'their day';
  }
  return b.info.title ? clip(b.info.title, 30).toLowerCase() : b.statusText.replace(/ · .*/, '').toLowerCase();
}

/** Something that happened to `a`, kept as one of its last 3 memories. */
export function remember(a: Agent, event: string): void {
  const m = minds.get(a);
  if (m) {
    m.memory = [...m.memory, event].slice(-3);
  }
}

/** Someone heard `from` say `text`: it stays with them today, and they may pass it on. */
function hear(a: Agent, from: Agent, text: string): void {
  const m = minds.get(a);
  if (m) {
    m.heard = [...m.heard, { from: from.name, text, at: performance.now() }].slice(-4);
  }
}

const seeded = (key: string) => {
  let h = 2166136261;
  for (const c of key) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
};
const pick = <T>(list: T[], n: number, rand: () => number) => [...list].sort(() => rand() - 0.5).slice(0, n);
/** What goes on in the office today: each desk worker saw one of these first-hand, everyone else only hears it from them. */
const todaysNews = pick(officeLife.news, 4, seeded(today));
const gripes = officeLife.gripes as Record<string, string[]>;

/** Office news and the person's one gripe of the day, now and then, so minds have the everyday office to talk about. */
function officeTalk(a: Agent): string[] {
  const rand = seeded(`${today}|${a.slot}`);
  const news = !a.npc && Math.random() < 0.25 ? pick(todaysNews, 1, rand) : [];
  const gripe = Math.random() < 0.15 ? pick(gripes[a.npc ? a.role.id : 'worker'] ?? [], 1, rand)[0] : '';
  return [news.length ? `Around the office: ${news.join('; ')}.` : '', gripe ? `Bugging you: ${gripe}.` : ''];
}

/** What others said to it a while ago (not the person it's talking to), the latest two. */
function heardLine(m: Mind | undefined, focus?: Agent): string {
  const now = performance.now();
  const old = (m?.heard ?? []).filter((h) => h.from !== focus?.name && now - h.at > 60000).slice(-2);
  return old.length ? `Heard earlier: ${old.map((h) => `${h.from} said "${h.text}" (${ago(now - h.at)})`).join('; ')}.` : '';
}

/** A compact picture of the agent's situation: time and place, own work and mood, the people it can see, memories. */
export function context(a: Agent, focus?: Agent): string {
  const feel = NEED_IDS.filter((id) => urgency(a.needs[id]) > 0.55).map((id) => FEEL[id]);
  const m = minds.get(a);
  const atWork = m ? Math.round((performance.now() - m.since) / 60000) : 0;
  const seen = listeners(a).filter((b) => b !== focus).slice(0, 2);
  return [
    `${clock(a.floor)}, ${place(a)}. At work ${atWork} min. Doing: ${a.statusText.replace(/ · .*/, '')}. Mood: ${feel.length ? feel.join(', ') : 'fine'}.`,
    work(a) ? `Your work: ${work(a)}.` : '',
    focus ? `With: ${about(a, focus)}.` : '',
    seen.length ? `Also here: ${seen.map((b) => `${b.name} (${b.role.title}, ${b.statusText.replace(/ · .*/, '').toLowerCase()})`).join('; ')}.` : focus ? '' : 'Nobody else is here.',
    m?.thought && performance.now() - m.thought.at < ON_MIND * 1000 ? `On your mind: "${m.thought.text}"` : '',
    m && planOf(m) ? `Plan: ${m.plan!.label} (decided ${ago(performance.now() - m.plan!.at)}).` : '',
    ...officeTalk(a),
    heardLine(m, focus),
    m?.memory.length ? `Recent: ${m.memory.join(' ')}` : '',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- thoughts

const URGENT: Partial<Record<NeedId, string>> = { bladder: 'needs the restroom', hunger: 'starving', thirst: 'very thirsty', energy: 'exhausted' };
/** Seconds between fresh thoughts while the player keeps a worker's window open. */
const THOUGHT_EVERY = 20;
/** Seconds between thoughts of their own (random in this range). */
const MUSE_EVERY: [number, number] = [60, 150];
/** Seconds a thought stays on the mind (in every prompt). */
const ON_MIND = 240;
const thoughtAsked = new WeakMap<Agent, number>();

/** What weighs on the mind beyond the usual context: how long the meeting has gone on, a pressing need, what's next. */
function preoccupations(a: Agent): string[] {
  const out: string[] = [];
  const c = a.conv;
  if (c && c.kind === 'meeting' && c.started) {
    const others = c.members.filter((m) => m !== a).map((m) => m.name).join(', ');
    out.push(`In a team meeting for ${Math.max(1, Math.round((performance.now() - c.startedAt) / 60000))} min with ${others}.`);
  }
  const worst = NEED_IDS.filter((id) => URGENT[id] && urgency(a.needs[id]) > 0.8).sort((p, q) => urgency(a.needs[q]) - urgency(a.needs[p]))[0];
  if (worst) {
    out.push(`Urgent: ${URGENT[worst]}.`);
  }
  if (a.floor.hour >= 10 && a.floor.hour < 11) {
    out.push('Next: lunch, the canteen opens at 11:00.');
  }
  return out;
}

/** What a thought is about. While none of it changes, the last thought still stands: nothing new to think about. */
function moment(a: Agent, m: Mind): string {
  const i = a.info;
  const urgent = NEED_IDS.filter((id) => URGENT[id] && urgency(a.needs[id]) > 0.8);
  return [place(a), a.statusText.replace(/ · .*/, ''), i.title, i.busy, (i.errors ?? 0) > 2, session.get(a), a.conv?.kind, m.memory.at(-1), m.heard.length, urgent].join('|');
}

function fresh(a: Agent, m: Mind): boolean {
  return !m.thought || performance.now() - m.thought.at > ON_MIND * 1000 || moment(a, m) !== m.thoughtOf;
}

/** Asks the agent's mind what it's thinking; the thought stays on its mind and may set a plan. */
function think(a: Agent, m: Mind, priority: Priority): void {
  const now = performance.now();
  m.thoughtOf = moment(a, m);
  m.nextThought = now + (MUSE_EVERY[0] + Math.random() * (MUSE_EVERY[1] - MUSE_EVERY[0])) * 1000;
  const plans = planLabels(a);
  const schema = { type: 'object', properties: { think: { type: 'string', maxLength: 220 }, ...planProp(plans) }, required: ['think', ...planKey(plans)] };
  const user = [context(a), ...preoccupations(a), 'What are you thinking right now?'].join('\n');
  void engine.ask(a, priority, 'thought', [{ role: 'system', content: innerVoice(a) }, { role: 'user', content: user }], schema, 96, () => a.gone).then((r) => {
    const text = words(r?.json.think, 28);
    if (text.split(' ').length >= 3 && !offClock(text, user)) {
      m.thought = { text, at: performance.now(), ms: performance.now() - now };
      setPlan(a, m, r?.json.plan);
    }
  });
}

/** The worker's window is open: a fresh thought at most every THOUGHT_EVERY s, shown there. */
export function wantThought(a: Agent): void {
  const m = mind(a);
  const now = performance.now();
  if (!m || now - (thoughtAsked.get(a) ?? -1e9) < THOUGHT_EVERY * 1000 || !fresh(a, m)) {
    return;
  }
  thoughtAsked.set(a, now);
  think(a, m, REPLY);
}

/** Every worker thinks on its own now and then, and soon after something happens to it (see soon()). */
export function muse(a: Agent): void {
  const m = mind(a);
  if (m && performance.now() >= m.nextThought && !engine.pending.has(a)) {
    if (fresh(a, m)) {
      think(a, m, ROUTINE);
    } else {
      m.nextThought = performance.now() + 20000;
    }
  }
}

/** Something happened that's worth a thought in a moment (a talk ended, its work finished, someone spoke to it). */
function soon(a: Agent): void {
  const m = minds.get(a);
  if (m) {
    m.nextThought = Math.min(m.nextThought, performance.now() + 2000 + Math.random() * 3000);
  }
}

// ---------------------------------------------------------------- plans: what a mind intends to do next when free

/** Free-time options a plan can name (the director's labels for them) besides "chat with <someone here>". */
const PLAN_LABELS = ['coffee', 'water', 'a snack', 'lunch', 'restroom', 'read a book', 'sketch on the whiteboard', 'play foosball', 'relax on the sofa', 'walk in the park', 'back to your desk', 'stretch your legs'];
/** Minutes a plan lasts before it's forgotten. */
const PLAN_FOR = 15;

/** What the agent may plan: 'none' (no new plan), an activity, or a chat with a colleague on this floor. Building staff don't plan. */
function planLabels(a: Agent): string[] {
  if (a.npc) {
    return [];
  }
  const people = a.floor.agents.filter((b) => b !== a && !b.npc && !b.isSub && b.arrived && !b.gone).sort((p, q) => a.tilesTo(p) - a.tilesTo(q)).slice(0, 6);
  return ['none', ...PLAN_LABELS, ...people.map((b) => `chat with ${b.name}`)];
}

/** The answer's "plan" field (only for those who plan). */
function planProp(plans: string[]): Record<string, object> {
  return plans.length ? { plan: { type: 'string', enum: plans } } : {};
}

function planKey(plans: string[]): string[] {
  return plans.length ? ['plan'] : [];
}

function setPlan(a: Agent, m: Mind, plan: unknown): void {
  if (typeof plan === 'string' && plan !== 'none' && planLabels(a).includes(plan)) {
    m.plan = { label: plan, at: performance.now() };
    console.info(`[mind] ${a.name} plans: ${plan}`);
  }
}

/** The agent's current plan, while it lasts. */
function planOf(m: Mind): string | null {
  if (m.plan && performance.now() - m.plan.at > PLAN_FOR * 60000) {
    m.plan = null;
  }
  return m.plan?.label ?? null;
}

/** Whether a free-time option is what the plan says ("lunch" covers every way of having lunch). */
function fulfils(option: string, plan: string): boolean {
  return option === plan || (plan === 'lunch' && (option.startsWith('lunch') || option === 'a bite to eat')) || (plan.startsWith('chat with ') && option.startsWith(`${plan} `));
}

/** The person the agent plans to chat with, if any. */
export function plannedChat(a: Agent): string | null {
  const m = minds.get(a);
  const plan = m && planOf(m);
  return plan?.startsWith('chat with ') ? plan.slice('chat with '.length) : null;
}

/** Ranks the planned option well above the rest, so the plan is on the shortlist and usually wins. */
export function favourPlan(a: Agent, options: Choice[]): Choice[] {
  const m = minds.get(a);
  const plan = m && planOf(m);
  return plan ? options.map((o) => (fulfils(o.label, plan) ? { ...o, u: o.u * 3 + 0.4 } : o)) : options;
}

// ---------------------------------------------------------------- output checks

/** At most n words, ending on a whole sentence: an unfinished line is cut back to its last full stop, or dropped. */
const words = (s: unknown, n: number): string => {
  if (typeof s !== 'string') {
    return '';
  }
  const text = s.trim().split(/\s+/).slice(0, n).join(' ');
  return /[.!?]['")]?$/.test(text) ? text : (/^.*[.!?]/.exec(text)?.[0] ?? '');
};
const bag = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);

/** The last lines any mind said, so nobody repeats a stock phrase over and over. */
const spoken: string[] = [];

/** Words from the prompt's instructions: a line using them is the model reading its orders aloud, not talking. */
const ORDERS = /\b(remark|options?|json|prompt|directly|your own words|what do you say)\b/i;

const NUMBERS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const CLOCK_WORD = new RegExp(`\\b(?:barely|nearly|almost|past|gone|half|it's|its)\\s+(${NUMBERS.join('|')}|\\d{1,2})\\b|\\b(${NUMBERS.join('|')}|\\d{1,2})\\s+(?:at night|in the morning|o'clock)`, 'gi');

/**
 * Whether the text says a time of day that the clock at the start of the prompt ("15:57, ...") contradicts: "barely
 * nine" in the afternoon, "ten at night" at 21:13, a lunch rush at 8:00, breakfast at noon. The small model can't
 * turn a clock into words reliably, so such lines are dropped.
 */
function offClock(text: string, prompt: string): boolean {
  const clock = /^(\d{1,2}):(\d\d)/.exec(prompt);
  if (!clock) {
    return false;
  }
  const h = Number(clock[1]) + Number(clock[2]) / 60;
  const t = text.toLowerCase();
  for (const m of t.matchAll(CLOCK_WORD)) {
    const said = m[1] ?? m[2];
    const n = NUMBERS.includes(said) ? NUMBERS.indexOf(said) : Number(said) % 12;
    const gap = Math.abs((((h % 12) - n + 18) % 12) - 6);
    if (Math.min(gap, 12 - gap) > 1) {
      return true;
    }
  }
  return (/\bat night\b|\btonight\b/.test(t) && h >= 6 && h < 17) || (/\bin the morning\b|\bbreakfast\b/.test(t) && h >= 11.5) ||
    (/\blunch rush\b|\bearly lunch\b/.test(t) && (h < 10.5 || h > 14)) || (/\bdinner\b/.test(t) && h < 15);
}

/**
 * A spoken line, or '' when it isn't one: fewer than 2 words, instruction words, a time of day the clock contradicts,
 * mostly an echo of what was just heard (`echoes`), or made almost entirely of the prompt's own words (`prompt`). A
 * dropped line means silence.
 */
function line(s: unknown, n: number, echoes: string[] = [], prompt = ''): string {
  const text = words(typeof s === 'string' ? s.replace(/^\s*[A-Z][a-z]+:\s*/, '').replace(/^["']|["']$/g, '') : s, n);
  const mine = bag(text);
  if (mine.length < 2 || ORDERS.test(text) || offClock(text, prompt)) {
    return '';
  }
  const overlap = (other: string) => {
    const theirs = new Set(bag(other));
    return theirs.size ? mine.filter((w) => theirs.has(w)).length / mine.length : 0;
  };
  const key = mine.join(' ');
  if (echoes.some((e) => overlap(e) >= 0.75) || (mine.length >= 4 && overlap(prompt) >= 0.8) || spoken.includes(key)) {
    return '';
  }
  spoken.push(key);
  spoken.splice(0, Math.max(0, spoken.length - 40));
  return text;
}

// ---------------------------------------------------------------- decisions

interface Plan {
  options: Choice[];
  /** undefined while the model is thinking, null when it gave no usable answer */
  answer?: { index: number; say: string } | null;
  asked: number;
  /** when the agent started waiting for the answer (0: it wasn't needed yet) */
  waitFrom: number;
  ms: number;
}

const plans = new WeakMap<Agent, Plan>();
/** the task during which the next decision was last asked for (once per task) */
const tried = new WeakMap<Agent, Task>();
/** decisions taken by a mind, how many had to wait for the model, total wait (s), gave up waiting, no usable answer */
export const decisionStats = { taken: 0, waited: 0, waitSeconds: 0, timeouts: 0, unusable: 0 };
const MAX_WAIT = 6;

/** Asks the agent's mind ahead of time which of the shortlisted options it takes next. */
export function prefetch(a: Agent, options: Choice[]): void {
  const m = mind(a);
  if (a.task) {
    tried.set(a, a.task);
  }
  if (!m || plans.has(a) || options.length < 2) {
    return;
  }
  const plan: Plan = { options, asked: performance.now(), waitFrom: 0, ms: 0 };
  plans.set(a, plan);
  const menu = options.map((o, i) => `${i + 1} ${o.label}`).join(', ');
  // a plan decides the action when an option fulfils it: the model only writes what they say as they go
  const intent = planOf(m);
  const planned = intent ? options.findIndex((o) => fulfils(o.label, intent)) : -1;
  const allowed = planned >= 0 ? [String(planned + 1)] : options.map((_, i) => String(i + 1));
  const schema = { type: 'object', properties: { choice: { type: 'string', enum: allowed }, say: { type: 'string', maxLength: 120 } }, required: ['choice', 'say'] };
  const user = `${context(a)}\nOptions: ${menu}.\nWhich number do you pick, and what do you say?`;
  void ask(a, m, ROUTINE, 'decision', user, schema, 60, () => a.gone || a.leaving || a.info.busy, 0.8).then((r) => {
    plan.ms = performance.now() - plan.asked;
    const index = Number(r?.choice) - 1;
    plan.answer = r && index >= 0 && index < options.length ? { index, say: line(r.say, 14, options.map((o) => o.label), user) } : null;
  });
}

/**
 * The agent's next free-time task from its mind: the prefetched answer when it's there, otherwise a short wait in
 * place ('wait') while it arrives. Null means: decide the usual way (AI staff off, fewer than 2 options, no answer).
 */
export function takeDecision(a: Agent, build: () => Choice[]): Task | 'wait' | null {
  const m = mind(a);
  if (!m) {
    return null;
  }
  let plan = plans.get(a);
  const now = performance.now();
  if (!plan) {
    prefetch(a, build());
    plan = plans.get(a);
    if (!plan) {
      return null;
    }
  }
  if (plan.answer === undefined) {
    if (!plan.waitFrom) {
      plan.waitFrom = now;
      decisionStats.waited++;
    }
    if (now - plan.waitFrom < MAX_WAIT * 1000) {
      return 'wait';
    }
    plans.delete(a);
    decisionStats.timeouts++;
    return null;
  }
  plans.delete(a);
  if (plan.waitFrom) {
    decisionStats.waitSeconds += (now - plan.waitFrom) / 1000;
  }
  if (!plan.answer || now - plan.asked > 40000) {
    decisionStats.unusable++;
    return null;
  }
  const { index, say } = plan.answer;
  const ordered = [plan.options[index], ...plan.options.filter((_, i) => i !== index).sort((p, q) => q.u - p.u)];
  for (const o of ordered) {
    const task = o.make();
    if (task) {
      decisionStats.taken++;
      const chosen = o === ordered[0] ? o.label : `${o.label} (${ordered[0].label} wasn't possible)`;
      m.last = { options: plan.options.map((x) => x.label), chosen, say, at: now, ms: plan.ms };
      console.info(`[mind] ${a.name} {${m.last.options.join(' | ')}} -> ${chosen} "${say}" ${Math.round(plan.ms)} ms${plan.waitFrom ? `, waited ${((now - plan.waitFrom) / 1000).toFixed(1)} s` : ''}`);
      const intent = planOf(m);
      if (intent && fulfils(o.label, intent)) {
        m.plan = null;
      }
      remember(a, `You chose: ${o.label}.`);
      if (say && listeners(a).length) {
        speak(a, m, say, plan.ms);
      }
      return task;
    }
  }
  return null;
}

/** Whether the agent's current free-time task is nearly over (time to ask for the next decision). */
export function wantsPrefetch(a: Agent): boolean {
  return engine.ready && !a.isSub && !plans.has(a) && !!a.task && tried.get(a) !== a.task && a.task.steps.length <= 1 && !!a.task.steps[0]?.begun;
}

// ---------------------------------------------------------------- reactions and openers

const reactedAt = new WeakMap<Agent, number>();
const quietRoom = new Map<string, number>();
/** to whom a mind last spoke, so that person is the one who answers */
const addressed = new WeakMap<Agent, Agent>();

function roomKey(a: Agent): string {
  return `${a.floor.level}|${a.floor.nav.roomOf(a.tx, a.ty)}`;
}

/**
 * A fast reaction to something that just happened to `a`: its mind answers `question` with a line (or silence), and
 * `apply` says it. At most one reaction per person every few seconds.
 */
function react(a: Agent, event: string, question: string, apply: (say: string, ms: number) => void, focus?: Agent, echo: string[] = []): boolean {
  const m = mind(a);
  const now = performance.now();
  if (!m || now - (reactedAt.get(a) ?? -1e9) < 4000) {
    return false;
  }
  reactedAt.set(a, now);
  remember(a, event);
  const plans = planLabels(a);
  const schema = { type: 'object', properties: { say: { type: 'string', maxLength: 140 }, ...planProp(plans) }, required: ['say', ...planKey(plans)] };
  const user = `${context(a, focus)}\n${event}\n${question}`;
  void ask(a, m, REACTION, 'reaction', user, schema, 72, () => a.gone || a.leaving, 0.6).then((r) => {
    if (!r || a.gone || a.hidden) {
      return;
    }
    setPlan(a, m, r.plan);
    const say = line(r.say, 18, echo, user);
    const ms = performance.now() - now;
    console.info(`[mind] ${a.name} reacts to "${event}" -> "${say || `(silent; model wrote ${JSON.stringify(r.say)})`}" ${Math.round(ms)} ms`);
    if (say) {
      apply(say, ms);
    }
  });
  return true;
}

/**
 * Meeting someone: the greeter's mind opens with something about what the other is doing or just said. A busy person
 * gets a nod instead, and nobody speaks to an empty room. True when the mind took over (no canned greeting).
 */
export function opener(g: Agent, o: Agent): boolean {
  const m = mind(g);
  if (!m || !earshot(g, o)) {
    return !!m;
  }
  if (o.info.waiting) {
    g.face(o.x, o.y);
    g.waveT = 0.6;
    return true;
  }
  const heard = justSaid(o);
  const event = heard ? `${o.name} just said: "${heard}"` : `You bump into ${o.name}, who is ${o.statusText.replace(/ · .*/, '').toLowerCase()}.`;
  return react(g, event, `What do you say to ${o.name}?`, (say, ms) => {
    if (!earshot(g, o) || g.conv) {
      return;
    }
    if (!g.seated) {
      g.face(o.x, o.y);
    }
    addressed.set(g, o);
    speak(g, m, say, ms);
  }, o, heard ? [heard] : []);
}

/** The chef hands a lunch tray to the person at the counter and says something to them; that person answers. */
export function serve(chef: Agent, eater: Agent): boolean {
  return react(chef, `${eater.name} is at the counter. You hand over a lunch tray.`, `What do you say to ${eater.name}?`, (say, ms) => {
    const m = minds.get(chef);
    if (!m || chef.tilesTo(eater) > 3) {
      return;
    }
    speak(chef, m, say, ms);
    react(eater, `${chef.name} hands you a lunch tray and says: "${say}"`, `What do you say back to ${chef.name}?`, (reply, ms2) => {
      const e = minds.get(eater);
      if (e && chef.tilesTo(eater) <= 4) {
        speak(eater, e, reply, ms2);
      }
    }, chef, [say]);
  }, eater);
}

/** A line for an event the game already handles (meeting call, Claude finished or failed), only if someone hears it. */
export function remark(a: Agent, event: string): boolean {
  soon(a);
  if (mind(a) && !listeners(a).length) {
    return true;
  }
  return react(a, event, 'What do you say?', (say, ms) => {
    const m = minds.get(a);
    if (m && listeners(a).length) {
      speak(a, m, say, ms);
    }
  });
}

/**
 * Hearing: a line said outside a conversation reaches the free people within earshot; one of them (the one it was
 * said to, else the nearest) answers what was said, and the two start talking. Rooms cool down between exchanges.
 */
Agent.onSay = (s, text, icon) => {
  if (!engine.ready || !s.floor || s.conv || icon !== AI_MARK) {
    return;
  }
  const near = listeners(s);
  for (const o of near) {
    remember(o, `${s.name} said "${text}".`);
    hear(o, s, text);
  }
  const room = roomKey(s);
  const now = performance.now();
  const target = addressed.get(s);
  if (target && !near.includes(target)) {
    addressed.delete(s);
    return;
  }
  const who = (target ? [target] : near.filter(canAnswer).sort((p, q) => s.tilesTo(p) - s.tilesTo(q)))[0];
  if (!who || !canAnswer(who) || now < (quietRoom.get(room) ?? 0)) {
    return;
  }
  quietRoom.set(room, now + 8000);
  addressed.delete(s);
  soon(who);
  react(who, `${s.name} tells you: "${text}"`, `What do you say back to ${s.name}?`, (say, ms) => {
    const m = minds.get(who);
    if (!m || !earshot(s, who) || !canAnswer(who)) {
      return;
    }
    if (!who.seated) {
      who.face(s.x, s.y);
    }
    const chat = free(who) && s.arrived && !s.leaving && !s.info.busy && !s.info.waiting && !s.conv && !s.locked && (!s.task || ['idle', 'fun', 'chat', 'outside'].includes(s.task.kind));
    if (chat) {
      s.floor.talk([s, who], [{ who: s, text }, { who, text: say }]);
    }
    speak(who, m, say, ms);
  }, s, [text]);
};

// ---------------------------------------------------------------- conversations

/** Told to a speaker whose real work calls it out of a conversation: its line excuses it. */
const CALLED_AWAY = 'Your work needs you right now: excuse yourself and go.';

/** Each speaker's own mind writes its turn: it sees the conversation so far and replies to the last line. */
Conversation.writer = (conv, speaker, excuse) => {
  if (!engine.ready) {
    return null;
  }
  const m = mind(speaker);
  if (!m) {
    return null;
  }
  const other = conv.members.find((x) => x !== speaker);
  const recent = conv.log.slice(-4);
  const started = conv.startedAt;
  const secs = Math.round((performance.now() - started) / 1000);
  const kind = conv.kind === 'meeting' ? 'a meeting' : conv.kind === 'lunch' ? 'lunch' : 'a chat';
  const so = recent.length
    ? `Talking for ${secs} s:\n${recent.map((l) => `${l.who.name}: "${l.text}"`).join('\n')}${excuse ? `\n${CALLED_AWAY}` : conv.winding ? '\nYou have talked a while, time to wrap up and get back to work.' : ''}\nWhat do you say to ${recent[recent.length - 1].who === speaker ? other?.name ?? 'them' : recent[recent.length - 1].who.name}?`
    : `You start ${kind} with ${other?.name ?? 'your coworker'} about ${other ? topicOf(other) : 'the day'}. What do you say?`;
  const plans = planLabels(speaker);
  const schema = { type: 'object', properties: { say: { type: 'string', maxLength: 150 }, end: { type: 'boolean' }, ...planProp(plans) }, required: ['say', 'end', ...planKey(plans)] };
  const user = `${context(speaker, other)}\n${so}`;
  const t = performance.now();
  return ask(speaker, m, REPLY, 'reply', user, schema, 80, () => conv.done, 0.6).then((r) => {
    const say = line(r?.say, 20, recent.map((l) => l.text), user);
    if (!r || !say) {
      return null;
    }
    const ms = performance.now() - t;
    m.lastLine = { text: say, at: performance.now(), ms };
    setPlan(speaker, m, r.plan);
    conv.members.filter((x) => x !== speaker).forEach((x) => hear(x, speaker, say));
    console.info(`[mind] ${speaker.name} in ${kind}: "${say}"${r.end ? ' (ends)' : ''}${excuse ? ' (called away)' : ''} ${Math.round(ms)} ms`);
    queueMicrotask(() => noteTalk(conv));
    return { say, end: r.end === true, icon: AI_MARK };
  });
};

Conversation.voiced = (a) => !!mind(a);

/** Finished conversations with their lines, for checking coherence (dev). */
const transcripts: string[] = [];
if (import.meta.env.DEV) {
  Object.assign(window, { tinyMind: { decisionStats: () => decisionStats, mindStats: () => mindStats, engine, transcripts } });
}
Conversation.onEnd = (conv) => {
  noteTalk(conv);
  conv.members.forEach(soon);
  if (conv.log.length >= 2 && engine.ready) {
    transcripts.push(conv.log.map((l) => `${l.who.name}: ${l.text}`).join('\n'));
  }
};
