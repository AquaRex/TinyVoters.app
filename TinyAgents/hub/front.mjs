// The hub's public door: Caddy (installed separately, see hub/README.md → Reaching the hub from anywhere) answers on
// https://<this home's IP>:4888 with a Let's Encrypt certificate for the IP itself, and passes everything to the hub on
// 127.0.0.1:7777. Browsers only let the (https) office page talk to an https address, hence the certificate. The
// router forwards TCP 4888 to this computer's 4888, and TCP 80 to its 4880 (Let's Encrypt checks on port 80 when it
// issues the certificate, which for an IP lasts days and renews by itself). A changed home IP restarts Caddy for it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PUBLIC_PORT = 4888;
const CHALLENGE_PORT = 4880;
const DIR = path.join(os.homedir(), '.tinyagents');
const IP_CHECK_EVERY = 10 * 60e3;

const caddyfile = (ip) => `{
	admin off
	http_port ${CHALLENGE_PORT}
	https_port ${PUBLIC_PORT}
	auto_https disable_redirects
}

${ip} {
	tls {
		issuer acme {
			profile shortlived
			disable_tlsalpn_challenge
		}
	}
	reverse_proxy 127.0.0.1:7777
}
`;

export class Front {
  /** https://<home IP>:4888, once known */
  address = null;

  constructor(log) {
    this.log = log;
  }

  async start() {
    await this.follow();
    setInterval(() => void this.follow(), IP_CHECK_EVERY);
  }

  stop() {
    this.caddy?.kill();
  }

  /** (Re)starts Caddy for this home's current public IP. */
  async follow() {
    const ip = await fetch('https://api.ipify.org').then((r) => r.text(), () => null);
    if (!ip || this.address === `https://${ip}:${PUBLIC_PORT}`) {
      return;
    }
    this.address = `https://${ip}:${PUBLIC_PORT}`;
    this.caddy?.kill();
    fs.mkdirSync(DIR, { recursive: true });
    const file = path.join(DIR, 'Caddyfile');
    fs.writeFileSync(file, caddyfile(ip));
    const out = fs.openSync(path.join(DIR, 'caddy.log'), 'a');
    const caddy = spawn('caddy', ['run', '--config', file, '--adapter', 'caddyfile'], { stdio: ['ignore', out, out], windowsHide: true });
    caddy.on('error', (e) => this.log(e.code === 'ENOENT' ? 'Public access off: Caddy is not installed (winget install CaddyServer.Caddy), see hub/README.md.' : `Caddy failed to start: ${e.message}`));
    caddy.on('exit', (code) => code !== null && caddy === this.caddy && this.log(`Caddy stopped (exit ${code}), see ~/.tinyagents/caddy.log.`));
    this.caddy = caddy;
    this.log(`Public address: ${this.address} (enter ${ip}:${PUBLIC_PORT} in Connect on other devices)`);
  }
}
