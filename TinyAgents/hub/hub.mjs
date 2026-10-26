// The Tiny Agents hub: one background app on the computer that runs Claude Code. It receives this and other
// computers' Claude Code hook events, keeps the office (hub/office.mjs, saved in ~/.tinyagents/office.json),
// pushes live updates to every open office page, and runs the NPC minds (hub/mind.mjs). It listens on this computer
// only; devices elsewhere reach it through hub/link.mjs with the office code, with nothing opened on the router.
//   npm run hub            (see hub/README.md)
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Link } from './link.mjs';
import { Mind } from './mind.mjs';
import { HubError, Office } from './office.mjs';

const PORT = Number(process.env.TINY_HUB_PORT ?? 7777);
const office = new Office(path.join(os.homedir(), '.tinyagents', 'office.json'));
const mind = new Mind();
/** How often open pages get the office again even without changes, so "for N seconds" counters move. */
const RESEND_MS = 5000;
/** Devices elsewhere get the office again this often even without changes (each send passes the relay when used). */
const REMOTE_RESEND_MS = 15000;

const RPC = {
  tiny_join: () => office.join(),
  tiny_office_code: (a) => (office.mustHome(a.p_token), office.remote().code),
  tiny_new_code: (a) => (office.mustHome(a.p_token), link.setCode(office.newCode()), office.data.officeCode),
  tiny_install_info: (a) => office.installInfo(a.p_token),
  tiny_forget_device: (a) => office.forgetDevice(a.p_token),
  tiny_snapshot: (a) => office.snapshot(a.p_token),
  tiny_messages: (a) => office.messages(a.p_token, a.p_agent, a.p_after),
  tiny_stats: (a) => office.stats(a.p_token, a.p_tz_offset),
  tiny_history: (a) => office.history(a.p_token, a.p_since),
  tiny_visitor_link: (a) => office.visitorLink(a.p_token),
  tiny_visitor_revoke: (a) => office.visitorRevoke(a.p_token),
  tiny_visitor_snapshot: (a) => office.visitorSnapshot(a.p_visitor),
  tiny_away_info: (a) => office.awayInfo(a.p_token),
  tiny_set_away: (a) => office.setAway(a.p_token, a.p_on),
  tiny_pending_approvals: (a) => office.pendingApprovals(a.p_token),
  tiny_decide: (a) => office.decide(a.p_token, a.p_request, a.p_allow),
  tiny_approval_wait: (a, req) => office.approvalWait(req.headers['x-tiny-key'], a.p_request, a.p_event),
  tiny_people: (a) => office.people(a.p_token),
  tiny_save_person: (a) => office.savePerson(a.p_token, a.p_slot, a.p_person),
  tiny_forget_person: (a) => office.forgetPerson(a.p_token, a.p_slot),
  tiny_labels: (a) => office.labels(a.p_token),
  tiny_save_label: (a) => office.saveLabel(a.p_token, a.p_key, a.p_name),
  tiny_forget_label: (a) => office.forgetLabel(a.p_token, a.p_key),
};

/** A request from a device elsewhere (hub/link.mjs): it runs as the office code's device. */
async function serveRemote(kind, name, args) {
  const token = office.remote().token;
  if (kind === 'status') {
    return mind.status();
  }
  if (kind === 'mind') {
    const raw = await mind.ask(args);
    if (raw === null) {
      throw new HubError(mind.note || 'The minds are not ready', 503);
    }
    return { raw };
  }
  if (kind !== 'rpc' || !RPC[name] || name === 'tiny_join' || name === 'tiny_approval_wait') {
    throw new HubError('not found', 404);
  }
  return RPC[name]({ ...args, p_token: token });
}

const link = new Link(office.remote().code, serveRemote, (line) => console.log(line));
const pushRemote = () => link.watched && link.push('agents', office.snapshot(office.remote().token));

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-tiny-key, x-tiny-machine',
  // Chrome asks before a public site may reach this computer's loopback address; this header answers yes
  'access-control-allow-private-network': 'true',
};

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(204, CORS).end();
    return;
  }
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2e6) {
      throw new HubError('request too large', 413);
    }
  }
  return raw ? JSON.parse(raw) : {};
}

/** Open office pages (Server-Sent Events), each with what it may see. */
const streams = new Set();

function push(stream, event, data) {
  stream.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function pushAgents(stream) {
  try {
    push(stream, 'agents', stream.visit ? office.visitorSnapshot(stream.visit) : office.snapshot(stream.token));
  } catch {
    stream.res.end();
    streams.delete(stream);
  }
}

let pending = null;
office.onChange(() => {
  pending ??= setTimeout(() => {
    pending = null;
    streams.forEach(pushAgents);
    pushRemote();
  }, 80);
});
mind.onChange(() => {
  streams.forEach((s) => !s.visit && push(s, 'mind', mind.status()));
  link.push('mind', mind.status());
});
setInterval(() => streams.forEach(pushAgents), RESEND_MS);
setInterval(pushRemote, REMOTE_RESEND_MS);

function openStream(req, res, url) {
  const stream = { res, token: url.searchParams.get('token'), visit: url.searchParams.get('visit') };
  if (stream.visit) {
    office.visitorSnapshot(stream.visit);
  } else {
    office.mustHome(stream.token);
  }
  res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  streams.add(stream);
  req.on('close', () => streams.delete(stream));
  pushAgents(stream);
  if (!stream.visit) {
    push(stream, 'mind', mind.status());
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://hub');
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
    } else if (req.method === 'GET' && url.pathname === '/events') {
      openStream(req, res, url);
    } else if (req.method === 'GET' && url.pathname === '/mind/status') {
      send(res, 200, mind.status());
    } else if (req.method === 'POST' && url.pathname === '/ingest') {
      office.ingest(req.headers['x-tiny-key'], req.headers['x-tiny-machine'], await readJson(req));
      send(res, 204);
    } else if (req.method === 'POST' && url.pathname === '/mind') {
      const body = await readJson(req);
      office.mustHome(body.token);
      const raw = await mind.ask(body);
      if (raw === null) {
        send(res, 503, { message: mind.note || 'The minds are not ready' });
      } else {
        send(res, 200, { raw });
      }
    } else if (req.method === 'POST' && url.pathname.startsWith('/rpc/') && RPC[url.pathname.slice(5)]) {
      send(res, 200, await RPC[url.pathname.slice(5)](await readJson(req), req));
    } else {
      send(res, 404, { message: 'not found' });
    }
  } catch (e) {
    if (!res.headersSent) {
      send(res, e instanceof HubError ? e.status : 500, { message: e instanceof HubError ? e.message : String(e?.message ?? e) });
    }
    if (!(e instanceof HubError)) {
      console.error(new Date().toISOString(), req.method, url.pathname, e);
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Tiny Agents hub on http://127.0.0.1:${PORT}`);
  void mind.start().then(() => console.log(`Minds: ${mind.state}${mind.note ? ` (${mind.note})` : ''}`));
  link.start();
  console.log(`Office code for devices elsewhere: ${office.remote().code}`);
});
mind.onChange(() => console.log(`Minds: ${mind.state}${mind.note ? ` (${mind.note})` : ''}`));

setInterval(() => office.save(), 2000);
setInterval(() => office.sweep(), 10 * 60e3);
const shutdown = () => {
  office.save();
  mind.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
