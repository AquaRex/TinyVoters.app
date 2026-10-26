import { CLOTH_COLORS, LookBias } from './appearance';
import { isTestRun } from './toolPlaces';

const C = (...i: number[]) => i.map((n) => CLOTH_COLORS[n]);

/** Character traits, each 0..1. A person's traits are their profession's, nudged per person. */
export interface Personality {
  /** greets people, starts conversations */
  sociability: number;
  /** how much they talk once in a conversation */
  chattiness: number;
  /** 0 = always the elevator, 1 = always the stairs */
  stairs: number;
  /** coffee addiction */
  coffee: number;
  /** likes a walk outside */
  outdoorsy: number;
  /** comes by car (otherwise on foot) */
  drives: number;
  /** sits at their desk on breaks, takes fewer breaks */
  diligence: number;
  /** foosball, fun */
  playful: number;
  /** reads at bookshelves */
  bookish: number;
}

export interface Profession {
  id: string;
  title: string;
  badge: string;
  traits: Personality;
  /** extra liking for some break activities (1 = neutral) */
  likes: Partial<Record<'whiteboard' | 'read' | 'play' | 'relax' | 'print' | 'park', number>>;
  look: LookBias;
  phrases: string[];
  keywords: string[];
}

const BASE: Personality = {
  sociability: 0.5,
  chattiness: 0.5,
  stairs: 0.3,
  coffee: 0.5,
  outdoorsy: 0.4,
  drives: 0.8,
  diligence: 0.5,
  playful: 0.4,
  bookish: 0.3,
};

const t = (p: Partial<Personality>): Personality => ({ ...BASE, ...p });

export const PROFESSIONS: Profession[] = [
  {
    id: 'lead',
    title: 'Lead Engineer',
    badge: '#f2b134',
    traits: t({ sociability: 0.65, chattiness: 0.6, coffee: 0.75, diligence: 0.6, stairs: 0.2 }),
    likes: { whiteboard: 1.6 },
    look: { topColors: C(2, 11, 7, 10), tops: ['shirt', 'blazer', 'sweater', 'jacket'], accessories: ['glasses', 'badge', 'none'] },
    phrases: ['ship it!', 'on it', 'lgtm', 'sync later?', 'good stuff', 'roadmap time', 'nice work!'],
    keywords: ['main', 'lead'],
  },
  {
    id: 'mobile',
    title: 'Mobile Dev',
    badge: '#5bb8a6',
    traits: t({ sociability: 0.6, chattiness: 0.55, coffee: 0.6, outdoorsy: 0.5, playful: 0.5 }),
    likes: { play: 1.3, park: 1.2 },
    look: { topColors: C(3, 6, 12, 14), tops: ['hoodie', 'tee', 'jacket'], accessories: ['headphones', 'cap', 'none'] },
    phrases: ['works on my phone', 'notch again?', 'swipe it', 'app store pls', 'tap target!', 'offline first'],
    keywords: ['mobile', 'ios', 'android', 'app', 'swift', 'kotlin', 'flutter', 'native'],
  },
  {
    id: 'gamedev',
    title: 'Game Dev',
    badge: '#9b6fd1',
    traits: t({ sociability: 0.6, chattiness: 0.6, playful: 0.9, coffee: 0.65, bookish: 0.35 }),
    likes: { play: 1.8, relax: 1.2 },
    look: { topColors: C(1, 5, 9, 13), tops: ['hoodie', 'tee', 'sweater'], accessories: ['headphones', 'glasses', 'beanie'] },
    phrases: ['one more playtest', 'feels juicy', 'hitbox!', 'gg', 'more screenshake', 'frame perfect'],
    keywords: ['game', 'gameplay', 'unity', 'godot', 'unreal', 'level', 'sprite', 'shader', 'physics'],
  },
  {
    id: 'perf',
    title: 'Performance Engineer',
    badge: '#e0913a',
    traits: t({ sociability: 0.35, chattiness: 0.4, diligence: 0.85, coffee: 0.8, bookish: 0.5 }),
    likes: { read: 1.3, whiteboard: 1.2 },
    look: { topColors: C(2, 4, 8, 11), tops: ['shirt', 'sweater', 'turtleneck'], accessories: ['glasses', 'none'] },
    phrases: ['flame graph time', '16 ms budget', 'cache it', 'too many allocs', 'profile first', 'faster!'],
    keywords: ['perf', 'performance', 'optimi', 'profil', 'speed', 'benchmark', 'latency', 'memory', 'freeze'],
  },
  {
    id: 'designer',
    title: 'Designer',
    badge: '#e07a9f',
    traits: t({ sociability: 0.9, chattiness: 0.85, coffee: 0.6, outdoorsy: 0.6, playful: 0.6, drives: 0.55 }),
    likes: { relax: 1.4, whiteboard: 1.3 },
    look: { topColors: C(0, 1, 6, 7, 10), tops: ['tee', 'sweater', 'cardigan', 'dress', 'turtleneck'], accessories: ['bow', 'beanie', 'roundGlasses', 'headphones', 'scarf'] },
    phrases: ['love it!', 'more padding', 'so cute', 'kerning!', 'vibes', 'pastel?', 'pixel perfect'],
    keywords: ['design', 'ui', 'ux', 'figma', 'style', 'art', 'brand'],
  },
  {
    id: 'frontend',
    title: 'Frontend Dev',
    badge: '#4fa3d9',
    traits: t({ sociability: 0.6, chattiness: 0.6, coffee: 0.6, playful: 0.75 }),
    likes: { play: 1.5 },
    look: { topColors: C(2, 10, 6, 4), tops: ['hoodie', 'tee', 'vest'], accessories: ['headphones', 'glasses', 'cap'] },
    phrases: ['css lol', 'it renders!', 'flexbox', 'hot reload', 'a11y!', 'one more div'],
    keywords: ['frontend', 'front', 'react', 'web', 'css', 'client'],
  },
  {
    id: 'backend',
    title: 'Backend Dev',
    badge: '#4a7a5a',
    traits: t({ sociability: 0.25, chattiness: 0.3, coffee: 0.9, diligence: 0.75, stairs: 0.5, outdoorsy: 0.25 }),
    likes: { read: 1.2 },
    look: { topColors: C(8, 11, 2, 4), tops: ['hoodie', 'tee', 'turtleneck'], accessories: ['headphones', 'glasses'] },
    phrases: ['latency...', 'n+1', 'cache it', 'hm.', 'migrations', 'p99 looks ok'],
    keywords: ['backend', 'back', 'api', 'server', 'database', 'db', 'sql'],
  },
  {
    id: 'researcher',
    title: 'Researcher',
    badge: '#7cae5b',
    traits: t({ sociability: 0.4, chattiness: 0.55, bookish: 0.95, outdoorsy: 0.7, drives: 0.45, stairs: 0.6 }),
    likes: { read: 2, park: 1.3 },
    look: { topColors: C(4, 15, 14, 10), tops: ['sweater', 'shirt', 'cardigan'], accessories: ['glasses', 'roundGlasses', 'scarf'] },
    phrases: ['found it', 'interesting', 'grep grep', 'reading...', 'aha!', 'citation needed'],
    keywords: ['explore', 'research', 'search', 'investigat', 'find'],
  },
  {
    id: 'architect',
    title: 'Architect',
    badge: '#5b6fa8',
    traits: t({ sociability: 0.55, chattiness: 0.7, coffee: 0.55, diligence: 0.6 }),
    likes: { whiteboard: 2.2 },
    look: { topColors: C(2, 11, 15, 12), tops: ['shirt', 'blazer', 'turtleneck'], accessories: ['glasses', 'roundGlasses', 'none'] },
    phrases: ['trade-offs', 'diagram it', 'step 1...', 'boxes+arrows', 'plan!', 'it depends'],
    keywords: ['plan', 'architect', 'spec'],
  },
  {
    id: 'qa',
    title: 'QA Tester',
    badge: '#e8a23a',
    traits: t({ sociability: 0.6, chattiness: 0.6, playful: 0.7, coffee: 0.4 }),
    likes: { play: 1.4 },
    look: { topColors: C(6, 1, 14, 4), tops: ['tee', 'hoodie', 'vest'], accessories: ['cap', 'headphones', 'badge', 'none'] },
    phrases: ['found a bug', 'flaky...', 'all green', 'repro?', 'edge case!', 'works on mine'],
    keywords: ['test', 'qa', 'verif', 'e2e'],
  },
  {
    id: 'reviewer',
    title: 'Code Reviewer',
    badge: '#8a6bb0',
    traits: t({ sociability: 0.35, chattiness: 0.4, coffee: 0.7, bookish: 0.6, diligence: 0.7 }),
    likes: { read: 1.4 },
    look: { topColors: C(7, 5, 2, 8), tops: ['sweater', 'shirt', 'cardigan'], accessories: ['glasses', 'roundGlasses'] },
    phrases: ['nit:', 'lgtm', 'hmm', 'why tho?', 'approved', 'needs tests'],
    keywords: ['review', 'critic', 'audit', 'lint'],
  },
  {
    id: 'devops',
    title: 'DevOps',
    badge: '#6b7280',
    traits: t({ sociability: 0.3, chattiness: 0.35, coffee: 0.95, stairs: 0.55, playful: 0.5 }),
    likes: {},
    look: { topColors: C(8, 11, 14, 3), tops: ['hoodie', 'tee', 'vest'], accessories: ['headphones', 'beanie', 'cap'] },
    phrases: ['deploying', "it's dns", 'pipeline ok', 'k8s...', 'uptime!', 'rollback?'],
    keywords: ['devops', 'deploy', 'infra', 'ci', 'docker', 'ops', 'release', 'build'],
  },
  {
    id: 'writer',
    title: 'Tech Writer',
    badge: '#c9705a',
    traits: t({ sociability: 0.7, chattiness: 0.8, bookish: 0.8, outdoorsy: 0.55, drives: 0.5 }),
    likes: { read: 1.6, relax: 1.2 },
    look: { topColors: C(14, 0, 15, 1), tops: ['sweater', 'tee', 'cardigan', 'dress'], accessories: ['glasses', 'beanie', 'bow', 'scarf'] },
    phrases: ['typo!', 'tl;dr', 'docs!', 'oxford comma', 'nice prose', 'needs an example'],
    keywords: ['doc', 'writ', 'readme', 'changelog', 'content'],
  },
  {
    id: 'data',
    title: 'Data Scientist',
    badge: '#3aa39a',
    traits: t({ sociability: 0.45, chattiness: 0.55, coffee: 0.65, bookish: 0.5 }),
    likes: { whiteboard: 1.5 },
    look: { topColors: C(10, 2, 4, 7), tops: ['tee', 'sweater', 'hoodie'], accessories: ['glasses', 'headphones'] },
    phrases: ['p < 0.05', 'plot it', 'outliers', 'big if true', 'n=1 lol', 'more data'],
    keywords: ['data', 'ml', 'model', 'analy', 'stat', 'notebook'],
  },
  {
    id: 'security',
    title: 'Security',
    badge: '#2e2e33',
    traits: t({ sociability: 0.15, chattiness: 0.25, coffee: 0.8, stairs: 0.7, diligence: 0.8, outdoorsy: 0.2 }),
    likes: { read: 1.2 },
    look: { topColors: C(11, 8, 3), tops: ['hoodie', 'jacket', 'turtleneck'], accessories: ['headphones', 'glasses', 'beanie'] },
    phrases: ['...', 'sanitize!', 'least priv', 'hm.', 'rotate keys', 'trust no one'],
    keywords: ['secur', 'auth', 'vuln', 'pentest', 'crypto'],
  },
  {
    id: 'debugger',
    title: 'Bug Hunter',
    badge: '#c9564a',
    traits: t({ sociability: 0.45, chattiness: 0.5, diligence: 0.8, coffee: 0.85, bookish: 0.45 }),
    likes: { read: 1.2 },
    look: { topColors: C(4, 8, 11, 12), tops: ['hoodie', 'shirt', 'sweater'], accessories: ['glasses', 'roundGlasses', 'none'] },
    phrases: ['found it!', 'repro please', 'off by one', 'stack trace?', 'not a bug, a feature', 'heisenbug'],
    keywords: ['debug', 'bug', 'fix', 'crash', 'error', 'diagnos', 'regression', 'broken'],
  },
  {
    id: 'product',
    title: 'Product Manager',
    badge: '#4fa3d9',
    traits: t({ sociability: 0.9, chattiness: 0.85, coffee: 0.7, drives: 0.85, diligence: 0.55 }),
    likes: { whiteboard: 1.8, relax: 1.1 },
    look: { topColors: C(2, 7, 10, 11), tops: ['blazer', 'shirt', 'cardigan', 'dress'], accessories: ['badge', 'scarf', 'none'] },
    phrases: ['user story?', 'what is the goal', 'ship small', 'roadmap!', 'quick sync', 'scope creep'],
    keywords: ['product', 'requirement', 'roadmap', 'feature', 'prd', 'story', 'priorit', 'feedback'],
  },
  {
    id: 'generalist',
    title: 'Generalist',
    badge: '#6b8bb5',
    traits: t({ sociability: 0.55, chattiness: 0.55 }),
    likes: {},
    look: { topColors: C(12, 4, 6, 14, 2), tops: ['tee', 'hoodie', 'sweater', 'shirt'], accessories: ['glasses', 'cap', 'headphones', 'beanie'] },
    phrases: ['on it', 'nice', 'doing stuff', 'brb', 'cool', 'easy one'],
    keywords: ['general', 'agent', 'task', 'helper'],
  },
];

export const PROFESSION_BY_ID = new Map(PROFESSIONS.map((p) => [p.id, p]));

export function professionFor(agentType: string): Profession {
  const tokens = agentType.toLowerCase().split(/[^a-z0-9]+/);
  for (const p of PROFESSIONS) {
    if (p.keywords.some((k) => tokens.some((tok) => tok.startsWith(k)))) {
      return p;
    }
  }
  return PROFESSION_BY_ID.get('generalist')!;
}

/** A Claude agent's role: from its agent type, or, for general-purpose helpers, from the task it was given. */
export function professionForAgent(agentType: string, task?: string): Profession {
  const byType = professionFor(agentType);
  return byType.id === 'generalist' && task ? professionFor(task) : byType;
}

/** The profession's traits nudged by up to ±0.15 per trait, stable for a seed. */
export function personalityFor(p: Profession, rand: () => number): Personality {
  const out = { ...p.traits };
  for (const k of Object.keys(out) as (keyof Personality)[]) {
    out[k] = Math.max(0, Math.min(1, out[k] + (rand() - 0.5) * 0.3));
  }
  return out;
}

const pick = <T>(arr: readonly T[], rand: () => number): T => arr[Math.floor(rand() * arr.length)];

const HELLOS = ['hi!', 'hey!', 'hello!', 'o/', 'yo!', 'hiya'];

/** Greetings that fit the hour: "morning!" only in the morning, "evening!" late in the day. */
export function greetings(hour: number): string[] {
  if (hour >= 5 && hour < 11) {
    return [...HELLOS, 'morning!', 'morning!'];
  }
  if (hour >= 17 || hour < 5) {
    return [...HELLOS, 'evening!'];
  }
  return HELLOS;
}
export const SHY_GREETINGS = ['hi', '...', 'oh, hi', '*nod*', 'hey'];
export const REPLIES = ['haha', 'true', 'yeah!', 'mhm', 'right?', 'lol', 'same', 'oh nice', 'totally', 'really?', 'for sure', 'ha!', 'oh no'];

/** Small talk as question / answer pairs. */
export const SMALL_TALK: [string, string][] = [
  ['weekend plans?', 'hiking!'],
  ['how was lunch?', 'so good'],
  ['coffee ok today?', 'strong!'],
  ['did you see that?', 'wild, right?'],
  ['busy day?', 'kinda!'],
  ['new plant?', "it's Fern"],
  ['standup at 10?', 'yep'],
  ['tea or coffee?', 'coffee. always'],
  ['nice weather', 'park later?'],
  ['how is the sprint?', 'on track'],
  ['seen the new mugs?', 'so cute'],
  ['pizza friday?', 'yes please'],
  ['any good books?', 'try Dune'],
  ['ready for demo?', 'almost!'],
  ['cat pics?', 'always'],
];

export const MEETING_LINES = ['agenda?', 'next steps', '+1', 'blockers?', 'action items', "let's sync", 'ship friday?', 'good point', 'any risks?', 'scope it down', 'sounds good', 'who owns it?'];
export const LUNCH_LINES = ['yum', 'so good', 'want some?', 'lunch!', 'mmm', 'tasty', 'hungry...', 'nice salad'];

export function smallTalkLine(p: Profession, rand: () => number): string {
  const r = rand();
  if (r < 0.45) {
    return pick(p.phrases, rand);
  }
  return pick(SMALL_TALK, rand)[0];
}

export function pickFrom<T>(arr: readonly T[], rand: () => number): T {
  return pick(arr, rand);
}

/** A short bubble about the Claude tool an agent is running. */
export function toolPhrase(tool?: string, detail?: string): string {
  if ((tool === 'Bash' || tool === 'PowerShell') && isTestRun(detail)) {
    return 'running tests...';
  }
  if (detail && detail.length <= 18) {
    switch (tool) {
      case 'Edit':
      case 'Write':
      case 'MultiEdit':
        return `editing ${detail}`;
      case 'Read':
        return `reading ${detail}`;
      case 'Grep':
      case 'Glob':
        return `looking for ${detail}`;
      case 'WebFetch':
        return `on ${detail}`;
      case 'WebSearch':
        return `googling ${detail}`;
      case 'Bash':
      case 'PowerShell':
        return `$ ${detail}`;
    }
  }
  switch (tool) {
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'editing...';
    case 'Bash':
    case 'PowerShell':
      return 'running cmds';
    case 'Read':
    case 'Grep':
    case 'Glob':
      return 'reading code';
    case 'WebSearch':
    case 'WebFetch':
      return 'googling';
    case 'Agent':
    case 'Task':
      return 'delegating';
    default:
      return 'thinking...';
  }
}
