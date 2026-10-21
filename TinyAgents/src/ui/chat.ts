import { ChatEntry, messages } from '../cloud/api';

/**
 * One agent's conversation: your prompts, the tools it used and Claude's reply at the end of each turn.
 * Polls for new entries while it's on screen. Replies happen in Claude Code itself (or Remote Control).
 */
export class ChatView {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private last = 0;
  private timer = 0;
  private stopped = false;

  constructor(readonly agentId: string) {
    this.el = document.createElement('section');
    this.el.className = 'chat';
    this.el.innerHTML = `<h3>Conversation</h3><div class="chat-list" aria-live="polite"><p class="chat-empty">Loading…</p></div>
      <p class="chat-foot">Reply in VS Code, or from your phone with Remote Control in the Claude app.</p>`;
    this.list = this.el.querySelector('.chat-list')!;
    this.poll();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.stopped) {
      return;
    }
    try {
      const fresh = await messages(this.agentId, this.last);
      if (this.last === 0) {
        this.list.replaceChildren();
        if (!fresh.length) {
          this.list.innerHTML = `<p class="chat-empty">Nothing yet: the conversation appears from the next prompt on.</p>`;
        }
      }
      if (fresh.length) {
        this.list.querySelector('.chat-empty')?.remove();
        const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 40;
        for (const m of fresh) {
          this.list.append(entry(m));
        }
        this.last = fresh[fresh.length - 1].id;
        if (atBottom || this.list.childElementCount === fresh.length) {
          this.list.scrollTop = this.list.scrollHeight;
        }
      }
    } catch {
      // offline for a moment: try again on the next tick
    }
    this.timer = window.setTimeout(() => this.poll(), document.visibilityState === 'visible' ? 3000 : 15000);
  }
}

function entry(m: ChatEntry): HTMLElement {
  const el = document.createElement('div');
  el.className = `chat-${m.role}`;
  const time = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.title = time;
  if (m.role === 'user' || m.role === 'assistant') {
    const who = document.createElement('small');
    who.textContent = `${m.role === 'user' ? 'You' : 'Claude'} · ${time}`;
    const text = document.createElement('div');
    text.className = 'chat-text';
    text.textContent = m.text;
    el.append(who, text);
    if (m.text.length > 600) {
      el.classList.add('chat-long');
      const more = document.createElement('button');
      more.className = 'chat-more';
      more.textContent = 'Show all';
      more.addEventListener('click', () => {
        el.classList.toggle('chat-long');
        more.textContent = el.classList.contains('chat-long') ? 'Show all' : 'Show less';
      });
      el.append(more);
    }
  } else {
    el.textContent = m.text;
  }
  return el;
}
