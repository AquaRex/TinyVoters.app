import {
  CloudError, approvalsPrompt, awayInfo, connectWithCode, deviceToken, forgetDevice, ingestKey, joinOffice, linkState, newOfficeCode, officeCode, setAway, visitToken,
} from '../cloud/api';
import { onHubComputer } from '../cloud/config';

const LINK_NOTE: Record<string, string> = {
  direct: 'Connected straight to your PC.',
  relay: "Connected to your PC, through the relay (this network doesn't allow a direct connection).",
  connecting: 'Connecting to your PC…',
  offline: "Your PC isn't answering: is it on, with the Tiny Agents hub running?",
};

/** 6 characters as two groups of three, easier to read and type. */
const grouped = (code: string) => code.replace(/(.{3})(?=.)/g, '$1-');

/**
 * The Connect dialog. On the hub's computer the page connects on its own and shows the office code; on any other
 * device, entering that code connects it (src/cloud/link.ts).
 */
export class ConnectDialog {
  private root: HTMLElement;

  constructor(private notify: (msg: string) => void) {
    this.root = document.getElementById('connect')!;
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) {
        this.close();
      }
    });
    if (!visitToken && !deviceToken() && onHubComputer()) {
      joinOffice().catch(() => undefined);
    }
  }

  open(): void {
    if (visitToken) {
      this.notify("You're visiting someone's office (read-only)");
      return;
    }
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const box = document.createElement('div');
    box.className = 'cn-box';
    box.innerHTML = `<button class="cn-close" aria-label="Close">&times;</button>`;
    box.querySelector('.cn-close')!.addEventListener('click', () => this.close());
    if (deviceToken()) {
      this.renderHome(box);
    } else {
      this.renderStart(box);
    }
    this.root.replaceChildren(box);
  }

  private renderStart(box: HTMLElement): void {
    if (onHubComputer()) {
      box.insertAdjacentHTML('beforeend', `<h2>Your office</h2><p>Connecting to the Tiny Agents hub on this PC… Is it running (<code>npm run hub</code>)?</p>`);
      return;
    }
    box.insertAdjacentHTML(
      'beforeend',
      `<h2>Connect to your PC</h2>
       <p>Enter the office code. It's under <b>Connect</b> on the PC running the Tiny Agents hub.</p>
       <form class="cn-code"><input class="cn-hub" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC-123" aria-label="Office code" /><button class="primary">Connect</button></form>`,
    );
    const input = box.querySelector<HTMLInputElement>('.cn-hub')!;
    const button = box.querySelector<HTMLButtonElement>('form button')!;
    box.querySelector('form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      button.disabled = true;
      button.textContent = 'Connecting…';
      try {
        await connectWithCode(input.value);
        this.notify('Connected to your PC');
        this.render();
      } catch (err) {
        this.notify(err instanceof CloudError ? err.message : 'Could not connect');
        button.disabled = false;
        button.textContent = 'Connect';
      }
    });
    setTimeout(() => input.focus(), 0);
  }

  private renderHome(box: HTMLElement): void {
    box.insertAdjacentHTML(
      'beforeend',
      (onHubComputer()
        ? `<h2>Your office</h2>
       <section>
         <h3>Other devices</h3>
         <p>On your phone or another computer, open Tiny Agents → <b>Connect</b> and enter this code. Anyone with it sees your office, so keep it to yourself.</p>
         <div class="cn-codebig cn-office">…</div>
         <div class="cn-actions"><button data-act="copycode">Copy code</button><button data-act="newcode">New code</button></div>
         <p class="cn-small">A new code disconnects every other device until you enter it there.</p>
       </section>`
        : `<h2>Your office</h2>
       <p class="cn-state"></p>`) +
        `<section>
         <h3>Away mode</h3>
         <p>Approve or deny Claude's permission requests from here. While it's on, <b>any connected device can approve tool use on your computers</b>, and Claude waits up to 10 minutes for that answer before asking at the computer. Off by default.</p>
         <div class="cn-row"><div class="cn-seg" data-toggle="away"><button data-v="off">Off</button><button data-v="on">On</button></div></div>
         <p class="cn-small">Each computer needs the approvals hook once (Node 18+): paste this prompt into Claude Code there, or run <code>npm run install-hooks -- &lt;computer key&gt; --approvals</code>.</p>
         <div class="cn-actions"><button data-act="approvals">Copy approvals setup prompt</button></div>
       </section>
       <button class="cn-link danger" data-act="forget">Disconnect this device</button>`,
    );
    box.querySelector('[data-act="forget"]')!.addEventListener('click', async () => {
      if (confirm('Disconnect this device?')) {
        await forgetDevice();
        this.notify('Disconnected');
        this.render();
      }
    });
    this.renderCode(box);
    this.renderAway(box);
  }

  /** The office code on the hub's computer; how the connection is going elsewhere. */
  private renderCode(box: HTMLElement): void {
    const state = box.querySelector<HTMLElement>('.cn-state');
    if (state) {
      const update = () => (state.textContent = LINK_NOTE[linkState() ?? 'connecting']);
      update();
      const timer = window.setInterval(() => (state.isConnected ? update() : clearInterval(timer)), 1000);
      return;
    }
    const shown = box.querySelector<HTMLElement>('.cn-office')!;
    let code = '';
    const show = (c: string) => {
      code = c;
      shown.textContent = grouped(c);
    };
    officeCode().then(show, (e) => this.notify(e instanceof CloudError ? e.message : 'Could not reach the hub'));
    box.querySelector('[data-act="copycode"]')!.addEventListener('click', () => {
      navigator.clipboard.writeText(grouped(code)).then(() => this.notify('Office code copied'), () => this.notify('Could not copy (clipboard blocked)'));
    });
    box.querySelector('[data-act="newcode"]')!.addEventListener('click', async () => {
      if (confirm('Make a new office code? Every other device is disconnected until you enter the new one there.')) {
        show(await newOfficeCode());
        this.notify('New office code made');
      }
    });
  }

  /** Away mode. */
  private renderAway(box: HTMLElement): void {
    const fail = (e: unknown) => this.notify(e instanceof CloudError ? e.message : 'Could not reach the office');
    box.querySelector('[data-act="approvals"]')!.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(approvalsPrompt(await ingestKey()));
        this.notify('Approvals prompt copied: paste it into Claude Code');
      } catch {
        this.notify('Could not copy (clipboard blocked)');
      }
    });
    const away = this.toggle(box, 'away', async (on) => {
      if (on && !confirm('Turn on away mode? Any connected device can then approve tool use on your computers.')) {
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
}
