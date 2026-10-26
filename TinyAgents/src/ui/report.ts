import { TILE } from '../config';
import { app } from '../app';
import { DayStats, OfficeStats } from '../cloud/api';
import { BOARD_ID } from '../features/stats';
import { StatsState, careerName, careerPlace, dayKey, monthLeaders, onStats, refreshStats } from '../stats/stats';
import { today } from '../world/calendar';

/**
 * "The Tiny Times": the office report opened from the lobby board. Today's numbers, top tools, the busiest
 * person, the last 14 days and the Employee of the month leaderboard.
 */

let root: HTMLElement;
let unsubscribe: (() => void) | null = null;

export function initReport(): void {
  root = document.createElement('div');
  root.id = 'report';
  root.hidden = true;
  root.addEventListener('click', (e) => {
    if (e.target === root) {
      closeReport();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden) {
      closeReport();
    }
  });
  document.body.append(root);
}

export function openReport(): void {
  root.hidden = false;
  unsubscribe?.();
  unsubscribe = onStats(render);
  refreshStats();
}

export function closeReport(): void {
  root.hidden = true;
  unsubscribe?.();
  unsubscribe = null;
}

/** Opens the report when world point (wx, wy) is on a Tiny Times board of the visible floor. */
export function openBoardAt(wx: number, wy: number): boolean {
  const floor = app.shown;
  const hit = floor.office.layout.items.some(
    (i) => i.type === BOARD_ID && wx >= i.x * TILE + 3 && wx < i.x * TILE + 29 && wy >= i.y * TILE - 26 && wy < i.y * TILE + 30,
  );
  if (hit) {
    openReport();
  }
  return hit;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function who(c: { machine: string; project: string }): string {
  return `<b>${esc(careerName(c))}</b> <span class="tt-muted">· ${esc(careerPlace(c))}</span>`;
}

function fmtDay(key: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

function last14(s: OfficeStats): DayStats[] {
  const byDay = new Map([s.today, ...s.history].map((d) => [d.day, d]));
  const now = today();
  return Array.from({ length: 14 }, (_, i) => {
    const key = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + i));
    return byDay.get(key) ?? { day: key, sessions: 0, prompts: 0, toolCalls: 0, files: 0, errors: 0, turns: 0, longestMin: 0, tools: {} };
  });
}

function body(s: OfficeStats): string {
  const t = s.today;
  const tiles: [string, number][] = [
    ['Sessions', t.sessions],
    ['Prompts', t.prompts],
    ['Tool calls', t.toolCalls],
    ['Files', t.files],
    ['Errors', t.errors],
    ['Turns', t.turns],
  ];
  const tools = Object.entries(t.tools).sort((p, q) => q[1] - p[1]).slice(0, 6);
  const maxTool = Math.max(1, ...tools.map(([, n]) => n));
  const days = last14(s);
  const maxDay = Math.max(1, ...days.map((d) => d.turns));
  const leaders = monthLeaders(s);
  return `
    <div class="tt-tiles">${tiles.map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('')}</div>
    <section>
      <h3>Top tools today</h3>
      ${
        tools.length
          ? `<ul class="tt-bars">${tools
              .map(([name, n]) => `<li><span>${esc(name)}</span><i><em style="width:${Math.round((n / maxTool) * 100)}%"></em></i><small>${n}</small></li>`)
              .join('')}</ul>`
          : '<p class="tt-muted">No tool calls yet today.</p>'
      }
    </section>
    <section class="tt-pair">
      <div><h3>Busiest today</h3>${
        t.busiest
          ? `<p>${who(t.busiest)}<br><small>${t.busiest.toolCalls} tool calls</small></p>`
          : '<p class="tt-muted">Nobody yet.</p>'
      }</div>
      <div><h3>Longest session</h3><p><b>${t.longestMin} min</b></p></div>
    </section>
    <section>
      <h3>Last 14 days <small class="tt-muted">turns</small></h3>
      <div class="tt-days">${days
        .map(
          (d) =>
            `<div title="${esc(fmtDay(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}: ${d.turns} turns"><i style="height:${Math.round((d.turns / maxDay) * 100)}%"></i><small>${fmtDay(d.day, { day: 'numeric' })}</small></div>`,
        )
        .join('')}</div>
    </section>
    <section>
      <h3>Employee of the month</h3>
      ${
        leaders.length
          ? `<ol class="tt-leaders">${leaders
              .map(
                (c, i) =>
                  `<li>${i === 0 ? '<span class="tt-star">&#9733;</span>' : ''}${who(c)}<small>${c.turns} turns · ${c.daysWorked} day${c.daysWorked === 1 ? '' : 's'}</small></li>`,
              )
              .join('')}</ol>`
          : '<p class="tt-muted">Nobody has finished a turn this month yet.</p>'
      }
    </section>`;
}

function render(st: StatsState): void {
  const date = today().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const source = st.source === 'cloud' ? 'Live from your office' : 'Demo office · local numbers';
  let content: string;
  if (st.error) {
    content = `<p class="tt-error">Couldn't load the office stats: ${esc(st.error)}</p>
      <p class="tt-muted">If this says the function doesn't exist, update the Tiny Agents hub on your computer.</p>`;
  } else if (!st.stats) {
    content = '<p class="tt-muted">Fetching the latest edition…</p>';
  } else {
    content = body(st.stats);
  }
  const html = `
    <div class="cn-box tt-box">
      <button class="cn-close" aria-label="Close">&times;</button>
      <header class="tt-mast"><h2>The Tiny Times</h2><small>${esc(date)} · ${source}</small></header>
      ${content}
    </div>`;
  if (root.dataset.html === html) {
    return;
  }
  root.dataset.html = html;
  root.innerHTML = html;
  root.querySelector('.cn-close')!.addEventListener('click', closeReport);
}
