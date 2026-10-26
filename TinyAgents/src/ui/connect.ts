import {
  CloudError, approvalsPrompt, awayInfo, claimCode, createHome, deviceToken, forgetDevice, hooksJson, ingestKey, installPrompt, pairCode,
  hubAddress, revokeVisitorLink, setAway, visitToken, visitorLink,
} from '../cloud/api';
import { hubUrl, setHubUrl } from '../cloud/config';

type View = 'start' | 'code' | 'home';

/**
 * The Connect dialog: create an office, join one with a pairing code, add a computer (Claude Code hooks)
 * or another device. Opening the site with ?pair=CODE joins straight away.
 */
export class ConnectDialog {
  private root: HTMLElement;
  private view: View = 'start';
  private os: 'windows' | 'mac' = /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'mac' : 'windows';
  private machine = /Mac/.test(navigator.userAgent) ? 'MacBook' : 'PC';
  private code: { value: string; address: string; until: number } | null = null;

  constructor(private notify: (msg: string) => void) {
    this.root = document.getElementById('connect')!;
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) {
        this.close();
      }
    });
    const params = new URLSearchParams(location.search);
    const pair = params.get('pair');
    if (params.get('hub')) {
      setHubUrl(params.get('hub')!);
    }
    if (pair) {
      history.replaceState(null, '', location.pathname + location.hash);
      this.join(pair);
    }
  }

  open(): void {
    if (visitToken) {
      this.notify("You're visiting someone's office (read-only)");
      return;
    }
    this.view = deviceToken() ? 'home' : 'start';
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  private async join(code: string): Promise<void> {
    try {
      await claimCode(code);
      this.notify('Connected to your office');
      this.close();
    } catch (e) {
      this.notify(e instanceof CloudError ? e.message : 'Could not reach the office');
    }
  }

  private render(): void {
    const box = document.createElement('div');
    box.className = 'cn-box';
    box.innerHTML = `<button class="cn-close" aria-label="Close">&times;</button>`;
    box.querySelector('.cn-close')!.addEventListener('click', () => this.close());
    if (this.view === 'start') {
      this.renderStart(box);
    } else if (this.view === 'code') {
      this.renderCode(box);
    } else {
      this.renderHome(box);
    }
    this.root.replaceChildren(box);
  }

  private renderStart(box: HTMLElement): void {
    box.insertAdjacentHTML(
      'beforeend',
      `<h2>Connect Claude Code</h2>
       <p>See your own Claude Code sessions work in this office, from any computer, on any device. Only devices you pair can see them.</p>
       <div class="cn-actions">
         <button data-act="create" class="primary">Create my office</button>
         <button data-act="code">I have a code</button>
       </div>
       <p class="cn-small">Already set up on another device? Open <b>Connect → Add a device</b> there to get a code.</p>`,
    );
    box.querySelector('[data-act="create"]')!.addEventListener('click', async (e) => {
      (e.target as HTMLButtonElement).disabled = true;
      try {
        await createHome();
        this.view = 'home';
        this.render();
      } catch (err) {
        this.notify(err instanceof CloudError ? err.message : 'Could not reach the office');
        (e.target as HTMLButtonElement).disabled = false;
      }
    });
    box.querySelector('[data-act="code"]')!.addEventListener('click', () => {
      this.view = 'code';
      this.render();
    });
  }

  private renderCode(box: HTMLElement): void {
    box.insertAdjacentHTML(
      'beforeend',
      `<h2>Join your office</h2>
       <p>Enter your PC's address and the 6-letter code, both shown under <b>Add a device</b> on a device that's already connected.</p>
       <form class="cn-code"><input class="cn-hub" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="89.11.166.148:4888" aria-label="Your PC's address" /><input class="cn-pin" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="Pairing code" /><button class="primary">Join</button></form>
       <button class="cn-link" data-act="back">Back</button>`,
    );
    const input = box.querySelector<HTMLInputElement>('.cn-pin')!;
    const hub = box.querySelector<HTMLInputElement>('.cn-hub')!;
    hub.value = hubUrl().replace(/^https:\/\//, '');
    box.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      setHubUrl(hub.value);
      this.join(input.value);
    });
    box.querySelector('[data-act="back"]')!.addEventListener('click', () => {
      this.view = 'start';
      this.render();
    });
    setTimeout(() => input.focus(), 0);
  }

  private renderHome(box: HTMLElement): void {
    box.insertAdjacentHTML(
      'beforeend',
      `<h2>Your office</h2>
       <section>
         <h3>Add a computer</h3>
         <p>Every Claude Code session on that computer (VS Code or terminal) will show up here, wherever it is. Do this once per computer.</p>
         <div class="cn-row">
           <div class="cn-seg"><button data-os="windows">Windows</button><button data-os="mac">Mac</button></div>
           <input class="cn-machine" maxlength="40" aria-label="Computer name" />
         </div>
         <ol>
           <li>Copy the setup prompt and paste it into Claude Code <b>on that computer</b>. Claude adds the hooks for you.</li>
           <li>Start a new Claude Code session (or run <code>/hooks</code>). That's it.</li>
         </ol>
         <div class="cn-actions">
           <button data-act="prompt" class="primary">Copy setup prompt</button>
           <button data-act="json">Copy settings JSON</button>
         </div>
         <p class="cn-small">The prompt holds your office's private computer key; only paste it into your own Claude Code.</p>
       </section>
       <section>
         <h3>Add a device</h3>
         <p>Your phone, your Mac's browser… Each device joins once and stays connected.</p>
         <div class="cn-pair"></div>
       </section>
       <section>
         <h3>Visitor link</h3>
         <p>A read-only view for friends: they see who's busy or waiting, never what Claude is doing, your projects or your chats.</p>
         <div class="cn-actions"><button data-act="visit">Copy visitor link</button><button data-act="unvisit">Revoke link</button></div>
       </section>
       <section>
         <h3>Away mode</h3>
         <p>Approve or deny Claude's permission requests from here. While it's on, <b>any paired device can approve tool use on your computers</b>, and Claude waits up to 10 minutes for that answer before asking at the computer. Off by default.</p>
         <div class="cn-row"><div class="cn-seg" data-toggle="away"><button data-v="off">Off</button><button data-v="on">On</button></div></div>
         <p class="cn-small">Each computer needs the approvals hook once (Node 18+): paste this prompt into Claude Code there, or run <code>npm run install-hooks -- &lt;computer key&gt; --approvals</code>.</p>
         <div class="cn-actions"><button data-act="approvals">Copy approvals setup prompt</button></div>
       </section>
       <button class="cn-link danger" data-act="forget">Disconnect this device</button>`,
    );
    box.querySelectorAll<HTMLButtonElement>('[data-os]').forEach((b) => {
      b.classList.toggle('on', b.dataset.os === this.os);
      b.addEventListener('click', () => {
        this.os = b.dataset.os as 'windows' | 'mac';
        if (this.machine === 'PC' || this.machine === 'MacBook') {
          this.machine = this.os === 'mac' ? 'MacBook' : 'PC';
        }
        this.render();
      });
    });
    const machine = box.querySelector<HTMLInputElement>('.cn-machine')!;
    machine.value = this.machine;
    machine.addEventListener('input', () => (this.machine = machine.value));
    const copy = async (text: () => Promise<string>, done: string) => {
      try {
        await navigator.clipboard.writeText(await text());
        this.notify(done);
      } catch {
        this.notify('Could not copy (clipboard blocked)');
      }
    };
    box.querySelector('[data-act="prompt"]')!.addEventListener('click', () =>
      copy(async () => installPrompt(await ingestKey(), this.machine, this.os), 'Setup prompt copied: paste it into Claude Code'),
    );
    box.querySelector('[data-act="json"]')!.addEventListener('click', () =>
      copy(async () => hooksJson(await ingestKey(), this.machine, this.os), 'Settings JSON copied'),
    );
    box.querySelector('[data-act="forget"]')!.addEventListener('click', async () => {
      if (confirm('Disconnect this device? You can join again with a code from another device.')) {
        await forgetDevice();
        this.notify('Disconnected');
        this.view = 'start';
        this.render();
      }
    });
    this.renderPair(box.querySelector('.cn-pair')!);
    this.renderExtras(box, copy);
  }

  /** Phone alerts, visitor link and away mode. */
  private renderExtras(box: HTMLElement, copy: (text: () => Promise<string>, done: string) => Promise<void>): void {
    const fail = (e: unknown) => this.notify(e instanceof CloudError ? e.message : 'Could not reach the office');
    box.querySelector('[data-act="approvals"]')!.addEventListener('click', () =>
      copy(async () => approvalsPrompt(await ingestKey()), 'Approvals prompt copied: paste it into Claude Code'),
    );
    box.querySelector('[data-act="visit"]')!.addEventListener('click', () =>
      copy(async () => `${location.origin}${location.pathname}?visit=${await visitorLink()}`, 'Visitor link copied'),
    );
    box.querySelector('[data-act="unvisit"]')!.addEventListener('click', async () => {
      if (confirm('Revoke the visitor link? Anyone using it loses access. A new link can be made any time.')) {
        await revokeVisitorLink().then(() => this.notify('Visitor link revoked'), fail);
      }
    });

    const away = this.toggle(box, 'away', async (on) => {
      if (on && !confirm('Turn on away mode? Any paired device can then approve tool use on your computers.')) {
        return false;
      }
      await setAway(on);
      this.notify(on ? 'Away mode on' : 'Away mode off');
    });
    awayInfo().then((i) => away.set(i.away), fail);
  }

  /** An Off/On segment; `change` returns false to cancel. Disabled until its current value is known. */
  private toggle(root: HTMLElement, name: string, change: (on: boolean) => Promise<boolean | void>): { on: () => boolean; set: (on: boolean) => void } {
    const buttons = root.querySelectorAll<HTMLButtonElement>(`[data-toggle="${name}"] button`);
    let value = false;
    const set = (on: boolean) => {
      value = on;
      buttons.forEach((b) => {
        b.disabled = false;
        b.classList.toggle('on', (b.dataset.v === 'on') === on);
      });
    };
    buttons.forEach((b) => {
      b.disabled = true;
      b.addEventListener('click', async () => {
        const on = b.dataset.v === 'on';
        if (on === value) {
          return;
        }
        try {
          if ((await change(on)) !== false) {
            set(on);
          }
        } catch (e) {
          this.notify(e instanceof CloudError ? e.message : e instanceof Error ? e.message : 'Could not reach the office');
        }
      });
    });
    return { on: () => value, set };
  }

  private renderPair(el: HTMLElement): void {
    const c = this.code;
    if (c && c.until > Date.now()) {
      const link = `${location.origin}${location.pathname}?pair=${c.value}&hub=${encodeURIComponent(c.address)}`;
      el.innerHTML = `<div class="cn-codebig">${c.value}</div>
        <p class="cn-small">On the other device: <b>Connect → I have a code</b>, address <b>${c.address.replace(/^https:\/\//, '')}</b> and this code. Or open this link there (valid 10 minutes):</p>
        <div class="cn-row"><input class="cn-linkbox" readonly /><button data-act="copylink">Copy link</button></div>`;
      const box = el.querySelector<HTMLInputElement>('.cn-linkbox')!;
      box.value = link;
      el.querySelector('[data-act="copylink"]')!.addEventListener('click', () => {
        navigator.clipboard.writeText(link).then(() => this.notify('Link copied'), () => box.select());
      });
      return;
    }
    el.innerHTML = `<button data-act="pair">Get a pairing code</button>`;
    el.querySelector('[data-act="pair"]')!.addEventListener('click', async () => {
      try {
        this.code = { value: await pairCode(), address: await hubAddress(), until: Date.now() + 10 * 60 * 1000 };
        this.renderPair(el);
      } catch (e) {
        this.notify(e instanceof CloudError ? e.message : 'Could not reach the office');
      }
    });
  }
}
