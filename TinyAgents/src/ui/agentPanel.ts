import { Dir } from '../config';
import { Agent } from '../agents/agent';
import {
  ACCENT_COLORS, ACCESSORIES, Appearance, BUILDS, CLOTH_COLORS, FACIAL, HAIR_COLORS, HAIR_STYLES, PANTS_COLORS, SHOE_COLORS, SKIN_TONES,
  TOP_STYLES, randomAppearance,
} from '../agents/appearance';
import { demoIdentity } from '../agents/demo';
import { friendsOf } from '../agents/relationships';
import { app } from '../app';
import { NEED_IDS, NEED_LABELS } from '../agents/needs';
import { forgetPerson, generatedPerson, savePerson } from '../agents/people';
import { POSES, POSE_FRAMES, Pose, characterFrame } from '../render/characters';
import { careerFor, statsState } from '../stats/stats';
import { CloudError, decideApproval, visitToken } from '../cloud/api';
import { ChatView } from './chat';
import { claudeBadge } from './roster';
import type { AgentInfo } from '../agents/agent';
import { npcShift } from '../agents/buildingStaff';
import { teamKey, teamName } from '../agents/labels';
import { renameInline } from '../features/plaques';

const DIRS: Dir[] = ['down', 'left', 'up', 'right'];
const POSE_FPS: Partial<Record<Pose, number>> = { walk: 10, carry: 10, type: 7, wave: 6, talk: 5, sitTalk: 5, stand: 1.6, phone: 3, read: 1.5 };

type Row =
  | { kind: 'swatch'; key: keyof Appearance; label: string; colors: readonly string[] }
  | { kind: 'cycle'; key: keyof Appearance; label: string; options: readonly string[] };

const ROWS: Row[] = [
  { kind: 'swatch', key: 'skin', label: 'Skin', colors: SKIN_TONES },
  { kind: 'cycle', key: 'build', label: 'Build', options: BUILDS },
  { kind: 'cycle', key: 'hair', label: 'Hair', options: HAIR_STYLES },
  { kind: 'swatch', key: 'hairColor', label: 'Hair color', colors: HAIR_COLORS },
  { kind: 'cycle', key: 'facial', label: 'Facial hair', options: FACIAL },
  { kind: 'cycle', key: 'top', label: 'Top', options: TOP_STYLES },
  { kind: 'swatch', key: 'topColor', label: 'Top color', colors: CLOTH_COLORS },
  { kind: 'swatch', key: 'pants', label: 'Pants', colors: PANTS_COLORS },
  { kind: 'swatch', key: 'shoes', label: 'Shoes', colors: SHOE_COLORS },
  { kind: 'cycle', key: 'accessory', label: 'Accessory', options: ACCESSORIES },
  { kind: 'swatch', key: 'accent', label: 'Accent', colors: ACCENT_COLORS },
];

function needColor(v: number): string {
  return v > 0.55 ? '#7cae5b' : v > 0.25 ? '#e8a23a' : '#c2544c';
}

export class AgentPanel {
  agent: Agent | null = null;
  follow = false;
  private root: HTMLElement;
  private preview!: HTMLCanvasElement;
  private previewDir = 0;
  private previewPose: Pose = 'walk';
  private t = 0;
  private chat: ChatView | null = null;

  constructor(private onClose: () => void) {
    this.root = document.getElementById('agentPanel')!;
  }

  open(agent: Agent): void {
    this.agent = agent;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.chat?.stop();
    this.chat = null;
    this.agent = null;
    this.follow = false;
    this.root.hidden = true;
    this.onClose();
  }

  private save(): void {
    const a = this.agent!;
    savePerson(a.slot, a.person);
    a.setPerson({ ...a.person });
  }

  /** Building staff: who they are and their shift, nothing to customize. */
  private renderNpc(a: Agent): void {
    this.root.innerHTML = `
      <div class="ap-head">
        <div class="ap-preview"><canvas class="pix" width="32" height="48"></canvas>
          <div class="ap-turn"><button data-turn="-1" aria-label="Turn left">&#9664;</button><button data-pose aria-label="Change pose">pose</button><button data-turn="1" aria-label="Turn right">&#9654;</button></div>
        </div>
        <div class="ap-id">
          <div class="ap-name" style="border:0">${escapeHtml(a.name)}</div>
          <div class="ap-role"><i style="background:${a.role.badge}"></i>${escapeHtml(a.role.title)}</div>
          <div class="ap-status"></div>
          <div class="ap-meta">Building staff · works ${escapeHtml(npcShift(a.id))}</div>
        </div>
        <button class="ap-close" aria-label="Close">&times;</button>
      </div>
      <p class="ap-note">${escapeHtml(a.name)} works for the building, not on a team: keeps office hours and comes and goes by the front door.</p>`;
    this.preview = this.root.querySelector('.ap-preview canvas')!;
    this.root.querySelector('.ap-close')!.addEventListener('click', () => this.close());
    this.root.querySelectorAll<HTMLButtonElement>('[data-turn]').forEach((b) =>
      b.addEventListener('click', () => {
        this.previewDir = (this.previewDir + Number(b.dataset.turn) + 4) % 4;
      }),
    );
    this.root.querySelector('[data-pose]')!.addEventListener('click', () => {
      this.previewPose = POSES[(POSES.indexOf(this.previewPose) + 1) % POSES.length];
      this.t = 0;
    });
    this.tick(0);
  }

  private render(): void {
    const a = this.agent!;
    if (a.npc) {
      this.renderNpc(a);
      return;
    }
    const look = a.person.look;
    const team = teamKey(a);
    const who = a.claude
      ? a.info.kind === 'main'
        ? 'Main session'
        : `Subagent · ${a.info.type}`
      : 'Demo staff';
    this.root.innerHTML = `
      <div class="ap-head">
        <div class="ap-preview"><canvas class="pix" width="32" height="48"></canvas>
          <div class="ap-turn"><button data-turn="-1" aria-label="Turn left">&#9664;</button><button data-pose aria-label="Change pose">pose</button><button data-turn="1" aria-label="Turn right">&#9654;</button></div>
        </div>
        <div class="ap-id">
          <input class="ap-name" maxlength="16" value="${escapeHtml(a.name)}" aria-label="Name" />
          <div class="ap-role"><i style="background:${a.role.badge}"></i>${escapeHtml(a.role.title)}</div>
          <div class="ap-status"></div>
          <div class="ap-meta">${escapeHtml(who)}${team ? ` · <span class="ap-team"><span class="ap-team-name">${escapeHtml(teamName(a))}</span>${visitToken ? '' : '<button class="ap-rename" aria-label="Rename team" title="Rename this team">rename</button>'}</span>` : ''}</div>
          <div class="ap-meta ap-friends"></div>
        </div>
        <button class="ap-close" aria-label="Close">&times;</button>
      </div>
      ${a.claude ? '<div class="ap-claude"></div>' : ''}
      <div class="ap-needs" style="margin-top:12px;display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;font-size:13px"></div>
      ${a.isSub ? '' : `<div class="ap-career">${careerSection(a)}</div>`}
      <div class="ap-rows"></div>
      <div class="ap-foot">
        <button data-act="follow" class="${this.follow ? 'on' : ''}">Follow</button>
        <button data-act="random">Randomize</button>
        <button data-act="reset">Reset look</button>
      </div>
      <p class="ap-note">${
        a.claude
          ? `Looks and desk are saved for ${a.isSub ? `this lead's <b>${escapeHtml(a.info.type)}</b> helper on ` : ''}<b>${escapeHtml(a.info.project)}</b>${a.info.machine ? ` on ${escapeHtml(a.info.machine)}` : ''}, so this person comes back the same next session.`
          : `${escapeHtml(a.name)} is built-in demo staff; their look is saved too.`
      }</p>`;
    this.preview = this.root.querySelector('.ap-preview canvas')!;
    if (a.claude) {
      this.root.querySelector('.ap-role')!.append(claudeBadge());
    }

    if (a.claude && !visitToken) {
      if (this.chat?.agentId !== a.info.id) {
        this.chat?.stop();
        this.chat = new ChatView(a.info.id);
      }
      this.root.querySelector('.ap-claude')!.after(this.chat.el);
    }
    this.root.querySelector('.ap-claude')?.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-approve]');
      if (!b || !a.info.approval) {
        return;
      }
      b.disabled = true;
      const allow = b.dataset.approve === 'allow';
      try {
        await decideApproval(a.info.approval.id, allow);
        app.toast(allow ? 'Approved' : 'Denied');
      } catch (err) {
        app.toast(err instanceof CloudError ? err.message : 'Could not reach the office');
      }
    });

    const needs = this.root.querySelector('.ap-needs')!;
    for (const id of NEED_IDS) {
      const label = document.createElement('span');
      label.textContent = NEED_LABELS[id];
      label.style.color = 'var(--muted)';
      const bar = document.createElement('div');
      bar.style.cssText = 'height:8px;background:var(--panel-2);border:1px solid var(--frame);border-radius:2px;overflow:hidden';
      const fill = document.createElement('div');
      fill.dataset.need = id;
      fill.style.cssText = 'height:100%;width:0';
      bar.append(fill);
      needs.append(label, bar);
    }

    const rows = this.root.querySelector('.ap-rows')!;
    for (const row of ROWS) {
      const el = document.createElement('div');
      el.className = 'ap-row';
      const label = document.createElement('label');
      label.textContent = row.label;
      el.append(label);
      if (row.kind === 'swatch') {
        const sw = document.createElement('div');
        sw.className = 'swatches';
        for (const c of row.colors) {
          const b = document.createElement('button');
          b.style.background = c;
          b.className = look[row.key] === c ? 'on' : '';
          b.setAttribute('aria-label', `${row.label} ${c}`);
          b.addEventListener('click', () => {
            (look as unknown as Record<string, string>)[row.key] = c;
            this.save();
            this.render();
          });
          sw.append(b);
        }
        el.append(sw);
      } else {
        const cyc = document.createElement('div');
        cyc.className = 'cycle';
        const value = String(look[row.key] ?? row.options[0]);
        const step = (d: number) => {
          const opts = row.options;
          (look as unknown as Record<string, string>)[row.key] = opts[(opts.indexOf(value) + d + opts.length) % opts.length];
          this.save();
          this.render();
        };
        const prev = document.createElement('button');
        prev.innerHTML = '&#9664;';
        prev.setAttribute('aria-label', `Previous ${row.label}`);
        prev.addEventListener('click', () => step(-1));
        const span = document.createElement('span');
        span.textContent = value.replace(/([A-Z])/g, ' $1').toLowerCase();
        const next = document.createElement('button');
        next.innerHTML = '&#9654;';
        next.setAttribute('aria-label', `Next ${row.label}`);
        next.addEventListener('click', () => step(1));
        cyc.append(prev, span, next);
        el.append(cyc);
      }
      rows.append(el);
    }

    this.root.querySelector('.ap-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.ap-rename')?.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).getBoundingClientRect();
      const lead = a.info.parent ? app.agents.find((o) => o.id === a.info.parent) ?? a : a;
      renameInline(team!, teamName(a), lead.info.project, r.left + 60, r.bottom + 14, () => this.agent === a && this.render());
    });
    this.root.querySelector<HTMLInputElement>('.ap-name')!.addEventListener('change', (e) => {
      a.person.name = (e.target as HTMLInputElement).value.trim() || a.person.name;
      this.save();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-turn]').forEach((b) =>
      b.addEventListener('click', () => {
        this.previewDir = (this.previewDir + Number(b.dataset.turn) + 4) % 4;
      }),
    );
    this.root.querySelector('[data-pose]')!.addEventListener('click', () => {
      this.previewPose = POSES[(POSES.indexOf(this.previewPose) + 1) % POSES.length];
      this.t = 0;
    });
    this.root.querySelector('[data-act="follow"]')!.addEventListener('click', () => {
      this.follow = !this.follow;
      this.render();
    });
    this.root.querySelector('[data-act="random"]')!.addEventListener('click', () => {
      a.person.look = randomAppearance(Math.floor(Math.random() * 1e9), a.role.look);
      this.save();
      this.render();
    });
    this.root.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
      forgetPerson(a.slot);
      a.setPerson(generatedPerson(a.slot, a.role, demoIdentity(a.id)?.name));
      this.render();
    });
    this.tick(0);
  }

  tick(dt: number): void {
    const a = this.agent;
    if (!a) {
      return;
    }
    if (a.gone) {
      this.close();
      return;
    }
    this.t += dt;
    const pose = this.previewPose;
    const n = POSE_FRAMES[pose];
    let frame = Math.floor(this.t * (POSE_FPS[pose] ?? 3)) % n;
    if (pose === 'stand') {
      frame = this.t % 3 < 0.15 ? 3 : [0, 1, 2, 1][Math.floor(this.t * 1.6) % 4];
    } else if (pose === 'sit') {
      frame = this.t % 3 < 0.15 ? 1 : 0;
    }
    const img = characterFrame(a.person.look, DIRS[this.previewDir], pose, frame, { smiling: a.smiling });
    const ctx = this.preview.getContext('2d')!;
    ctx.clearRect(0, 0, 32, 48);
    ctx.drawImage(img, 0, 0);
    const friends = this.root.querySelector('.ap-friends');
    if (friends) {
      const names = friendsOf(a, app.agents).slice(0, 4).map((f) => f.name);
      friends.textContent = names.length ? `Friends: ${names.join(', ')}` : 'Still making friends';
    }
    const status = this.root.querySelector('.ap-status');
    if (status) {
      status.textContent = a.statusText;
    }
    const claude = this.root.querySelector<HTMLElement>('.ap-claude');
    if (claude) {
      const html = claudeSection(a.info);
      if (claude.dataset.html !== html) {
        claude.dataset.html = html;
        claude.innerHTML = html;
      }
    }
    this.root.querySelectorAll<HTMLElement>('[data-need]').forEach((el) => {
      const v = a.needs[el.dataset.need as keyof typeof a.needs];
      el.style.width = `${Math.round(v * 100)}%`;
      el.style.background = needColor(v);
    });
  }
}

const STATE_LABEL: Record<string, string> = {
  starting: 'Just started',
  thinking: 'Thinking',
  tool: 'Using a tool',
  permission: 'Needs your permission',
  idle: 'Waiting for your next prompt',
  compacting: 'Compacting context',
  error: 'Stopped with an error',
};

function ago(sec: number): string {
  return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

/** Live Claude details: state, current action, model and counters, and the last few actions. */
function claudeSection(i: AgentInfo): string {
  const state = i.state ?? (i.waiting ? 'permission' : i.busy ? 'tool' : 'idle');
  const doing = i.tool ? `${i.tool}${i.detail ? ` · ${i.detail}` : ''}` : '';
  const facts = [
    i.model,
    i.mode && i.mode !== 'default' ? `${i.mode} mode` : '',
    i.age !== undefined ? `up ${ago(i.age)}` : '',
    i.prompts ? `${i.prompts} prompt${i.prompts === 1 ? '' : 's'}` : '',
    i.toolCalls ? `${i.toolCalls} tool call${i.toolCalls === 1 ? '' : 's'}` : '',
    i.subagents ? `${i.subagents} helper${i.subagents === 1 ? '' : 's'}` : '',
    i.background ? `${i.background} background task${i.background === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const recent = (i.recent ?? [])
    .slice(0, 5)
    .map((r) => `<li><span>${escapeHtml(r.text)}</span><small>${ago(r.ago)}</small></li>`)
    .join('');
  return `
    <div class="ap-cl-state" data-state="${state}"><i></i>${escapeHtml(STATE_LABEL[state] ?? state)}${i.stateFor !== undefined ? ` <small>${ago(i.stateFor)}</small>` : ''}</div>
    ${doing ? `<div class="ap-cl-doing">${escapeHtml(doing)}</div>` : ''}
    ${i.approval ? approvalSection(i.approval) : ''}
    ${i.title || i.description ? `<div class="ap-cl-task">${escapeHtml(i.title ?? i.description ?? '')}</div>` : ''}
    ${state === 'error' && i.error ? `<div class="ap-cl-error">${escapeHtml(i.error.replace(/_/g, ' '))}</div>` : ''}
    ${facts.length ? `<div class="ap-cl-facts">${escapeHtml(facts.join(' · '))}</div>` : ''}
    ${recent ? `<ul class="ap-cl-recent">${recent}</ul>` : ''}`;
}

/** Away mode: answer this permission request from here. */
function approvalSection(r: NonNullable<AgentInfo['approval']>): string {
  return `<div class="ap-cl-doing">Asks to use ${escapeHtml(r.tool)}${r.detail ? `: <code>${escapeHtml(r.detail)}</code>` : ''}</div>
    <div class="ap-foot"><button data-approve="allow" class="on">Approve</button><button data-approve="deny">Deny</button></div>`;
}

function sinceDate(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Lifetime numbers for this computer + project (demo staff: the local tracker). */
function careerSection(a: Agent): string {
  const c = careerFor(a);
  if (!c) {
    const err = a.demo ? null : statsState().error;
    return `<h3>Career</h3><p class="ap-note" style="margin:0">${err ? `Career unavailable: ${escapeHtml(err)}` : 'First day on the job.'}</p>`;
  }
  const rows: [string, string][] = [
    ['Days worked', String(c.daysWorked)],
    ['Sessions', String(c.sessions)],
    ['Turns', String(c.turns)],
    ['Tool calls', String(c.toolCalls)],
    ['Top tool', c.topTool ?? '–'],
  ];
  return `<h3>Career <small style="color:var(--muted);font-weight:normal">since ${escapeHtml(sinceDate(c.firstSeen))}</small></h3>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
