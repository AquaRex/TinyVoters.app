import { AppConfig, CreateWebWorkerMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';

/**
 * Dev page (mindcheck.html): loads a mind model in the browser engine and answers a few game-shaped prompts.
 * ?model=<id> picks a prebuilt id or MIND_MODEL-style custom entry; ?url=<self-hosted folder> loads custom weights
 * with the official Qwen3.5-0.8B library.
 */
const out = document.getElementById('out')!;
const log = (s: string) => {
  out.textContent += `\n${s}`;
  console.info(`MINDCHECK ${s}`);
};

const params = new URLSearchParams(location.search);
const url = params.get('url');
const id = url ? 'custom-mind' : params.get('model') ?? 'Qwen3.5-0.8B-q4f16_1-MLC';
const official = prebuiltAppConfig.model_list.find((m) => m.model_id === 'Qwen3.5-0.8B-q4f16_1-MLC')!;
const appConfig: AppConfig = url
  ? { ...prebuiltAppConfig, model_list: [...prebuiltAppConfig.model_list, { ...official, model: new URL(url, location.href).href, model_id: id }] }
  : prebuiltAppConfig;

const persona = (name: string, role: string, traits: string) =>
  `You are ${name}, a ${role} at a small cozy office. You are ${traits}. Talk short, cheeky and friendly about what's going on and your work, in your own words, never quoting it. Answer only with JSON.`;

const CASES: { system: string; user: string; schema: object }[] = [
  {
    system: persona('Maya', 'Frontend Dev', 'sociable, loves coffee'),
    user: '12:14, Floor 2, Team office 1. At work 230 min. Doing: At the desk. Mood: hungry.\nYour work: Design blue sci-fi frontend for smart-home app (paused); asked "design a frontend UI with a blue theme, scifi vibes, for a smart home system"; answered "Built a neon-blue dashboard with room tiles and a glowing nav".\nAlso here: Theo (Backend Dev, getting coffee).\nOptions: 1 coffee, 2 lunch in the canteen, 3 chat with Theo about fix the login redirect loop.\nWhich number do you pick, and what do you say?',
    schema: { type: 'object', properties: { choice: { type: 'string', enum: ['1', '2', '3'] }, say: { type: 'string' } }, required: ['choice', 'say'] },
  },
  {
    system: persona('Maya', 'Frontend Dev', 'sociable, loves coffee'),
    user: '15:02, Floor 2, Reception. At work 400 min. Doing: Chatting. Mood: fine.\nYour work: Design blue sci-fi frontend for smart-home app (paused); asked "design a frontend UI with a blue theme, scifi vibes, for a smart home system"; answered "Built a neon-blue dashboard with room tiles and a glowing nav".\nWith: Theo (Backend Dev, teammate, talked once today, last just now about "What are you building today?"; on a break: chatting).\nTalking for 6 s:\nTheo: "What are you building today?"\nMaya: "Some blue sci-fi frontend. Very glowy."\nTheo: "Oh nice, what\'s it for?"\nWhat do you say to Theo?',
    schema: { type: 'object', properties: { say: { type: 'string' }, end: { type: 'boolean' } }, required: ['say', 'end'] },
  },
  {
    system: persona('Bruno', 'Security Guard', 'shy, hard-working'),
    user: '18:58, Floor 1, Security. At work 610 min. Doing: Watching the cameras. Mood: tired.\nYour work: keep the building safe.\nWith: Nadia (Security Guard, colleague, not talked today; on a break: taking over the desk).\nNadia tells you: "night shift is all yours"\nWhat do you say back to Nadia?',
    schema: { type: 'object', properties: { say: { type: 'string' } }, required: ['say'] },
  },
];

async function main(): Promise<void> {
  const t0 = performance.now();
  const engine = await CreateWebWorkerMLCEngine(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), id, {
    appConfig,
    initProgressCallback: (p) => console.info(`MINDCHECK progress ${Math.round(p.progress * 100)}% ${p.text.slice(0, 60)}`),
  }, { context_window_size: 1024 });
  log(`loaded ${id} in ${Math.round(performance.now() - t0)} ms`);
  for (const c of CASES) {
    for (let k = 0; k < 2; k++) {
      const t = performance.now();
      const r = await engine.chat.completions.create({
        messages: [{ role: 'system', content: c.system }, { role: 'user', content: c.user }],
        temperature: 0.7,
        max_tokens: 40,
        response_format: { type: 'json_object', schema: JSON.stringify(c.schema) },
      });
      log(`${Math.round(performance.now() - t)} ms  ${r.choices[0].message.content}`);
    }
  }
  log('DONE');
}

main().catch((e) => log(`ERROR ${e instanceof Error ? e.message : String(e)}`));
