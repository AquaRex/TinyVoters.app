# Claude integration

How Tiny Agents shows your real Claude Code sessions, from any of your computers, on any device.

## Why it works this way

Anthropic offers no "Sign in with Claude" for third-party apps, and no API that lists your Claude Code
sessions. Their policy rules out using claude.ai login in other products; see
[legal and compliance](https://code.claude.com/docs/en/legal-and-compliance). Local sessions in VS Code or
the terminal never reach Anthropic's servers unless you enable Remote Control.

What Claude Code does offer is **hooks**: commands it runs by itself at each step of a session. Tiny Agents
uses one hook per event to send a small status update to your office in the cloud.

```
PC / MacBook — Claude Code (VS Code, terminal)
   │  async hook: curl POST, never blocks Claude
   ▼
Supabase (the wiki's project, schema `tinyagents`)
   tiny_ingest() turns events into per-session state and chat history
   ▲
   │  tiny_snapshot() / tiny_messages() every few seconds, with this device's token
tinyvoters.app/tinyagents — phone, Mac, PC (static site on GitHub Pages)
```

Nothing runs on your computers besides Claude Code itself, so there's no server, app or extension to keep
running. A computer away from home still reports, as long as it has internet.

## Setup

1. **Database, once:** run [supabase/tinyagents.sql](../supabase/tinyagents.sql) in the Supabase SQL Editor.
   - It's additive: it only creates the `tinyagents` schema and `tiny_*` functions.
   - It's re-runnable after updates.
2. **Your office, once:** open the site, tap the status pill, then **Create my office**. This device is now
   paired.
3. **Each computer, once:** in **Connect → Add a computer**, pick Windows or Mac and copy the setup prompt.
   Paste it into Claude Code on that computer, and Claude adds the hooks itself. The hooks apply to new
   sessions; in an open one, run `/hooks`.
   - With this repo checked out, `npm run install-hooks -- <computer key>` does the same thing.
   - To undo: `npm run install-hooks -- --remove`, or ask Claude to remove the hooks whose command contains
     `tiny_ingest`.
4. **Each viewing device, once:** in **Connect → Add a device**, get a 6-letter code (valid 10 minutes).
   Enter it on the phone, or open the link it shows. The device stays paired until you disconnect it.

## Security and privacy

- **The anon key is public by design.** It's embedded in the site. The `tinyagents` tables have RLS on with
  no policies and no grants, so the key can't read or write them directly. Every call goes through a
  `tiny_*` function that first checks either:
  - the **computer key**, sent in the `x-tiny-key` header, for writing events; or
  - a **device token**, stored only as a SHA-256 hash, for viewing.
- **Your wiki is untouched.** Nothing in the script references the wiki's tables or functions.
- **What's kept:**
  - session state;
  - the tool name with a short detail (file name, search term, host, command name or Claude's own
    description);
  - your prompts and Claude's final reply per turn, for the chat;
  - **stats:** counters only (sessions, prompts, tool calls per tool, errors, finished turns, longest
    session) per UTC hour and per staff member (computer name + project folder name), plus a SHA-256 hash
    of each edited file's path to count distinct files a day;
  - **careers:** lifetime counters per computer + project folder;
  - **replay log:** each state or tool change of each agent (state, tool name, short detail, computer,
    project folder name);
  - **customized people:** the name and look you give a person in the agent panel, per seat, so every
    device of the office shows the same people (at most 4 KB each, 500 per office);
  - **custom names:** team names and the names on room signs you rename (at most 40 characters, 300 per
    office);
  - **phone alert subscriptions:** the push endpoint your browser hands out, with its keys;
  - **away-mode requests** while one waits: the tool name and detail. For Bash/PowerShell the detail is the
    command itself (up to 300 characters), so you know what you approve. Deleted once answered or after
    10 minutes.
- **What's never stored:**
  - file contents (the hook sends the full event, but the function discards it on arrival);
  - full commands;
  - tool output;
  - Claude's intermediate messages.
- **Retention:** chat keeps the newest 300 entries per agent. Ended sessions are deleted with their chat,
  silent sessions after 6 hours, and offices nobody has viewed for 60 days (with everything they hold).
  - Hourly stats and file hashes: 16 days. Careers, customized people and custom names: as long as the office.
  - Replay log: 2 days, at most 8000 rows per office.
  - Away-mode requests: until answered, or 10 minutes.
- **The computer key** sits in the hook command in `~/.claude/settings.json` on your computers. Anyone with it
  could post fake events to your office, but couldn't read it. The device token is what reads.
- **Shared free database limits:** at most 10 new offices per hour and 100 in total, so strangers can't fill
  the database.

## Stats and careers

Every event also bumps a few counters (see *What's kept*), so the numbers survive the sessions being
deleted. `tiny_stats(token, tz offset)` sums them into the viewer's local days:
- today, and up to 14 earlier days;
- lifetime finished turns;
- up to 50 careers.

Time zones that aren't a whole number of hours from UTC round to the hour. A career's "days worked" counts
UTC days.

## Customized people

A name or look you change in the agent panel is saved to the office (`tiny_save_person`), so every paired
device shows the same people (`tiny_people`). **Reset look** removes it (`tiny_forget_person`). Names are
trimmed to 24 characters.

## Custom names

Click a team office's or meeting room's sign above its door (or **rename** next to the team in the agent
panel) to rename it. Names are saved to the office (`tiny_save_label`, keys `team:<computer>|<project>` and
`room:<floor id>:<room id>`) and every paired device shows them (`tiny_labels`, polled every 30 s). Clearing a
name goes back to the default (`tiny_forget_label`). Unpaired, they stay in this browser. Re-run
`supabase/tinyagents.sql` once to add the `labels` table and functions.

## Day replay

A trigger on the sessions table logs each state or tool change, and `ended` when an agent leaves.
`tiny_history(token, since)` returns the changes since then, oldest first, at most 2 days back. Each agent
still around at `since` first gets its last earlier change, so a replay starts in the right state.

## Visitor links (read-only)

**Connect → Visitor link → Copy visitor link** makes a link ending in `?visit=<token>`. Whoever opens it
sees your office's people come and go, and whether they're busy or waiting. Nothing else is shared: no
tools, details, titles, projects, computers, models, counters or chat, and agent ids are hashed.

The visitor can't edit the office, open Connect or read chats. **Revoke link** stops the link at once, and
the next link you make is a new one. The visitor token is stored as-is (like the computer key), so the
same link can be copied again.

## Phone alerts (web push)

Your phone (or any browser) gets a notification in two cases:
- an agent starts waiting for you;
- a main session finishes a turn that took over 3 minutes.

It works with the app closed, including the iPhone home-screen app (iOS 16.4+).

How an alert travels:
`tiny_ingest` → `tinyagents.push()` → `pg_net` (queued, never blocks the hook) → the `tiny-push` Edge
Function → each device's push service → `public/sw.js` shows it.

Setup, once (the Connect dialog says when it's missing):

1. **VAPID keys:** run `npx web-push generate-vapid-keys`. Put the public key in `src/cloud/config.ts`
   (`VAPID_PUBLIC_KEY`) and deploy the site. The private key goes only into the function's secrets.
2. **A shared secret** between the database and the function:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. **pg_net:** Supabase dashboard → Database → Extensions → enable `pg_net`.
4. **The function**, from this folder. It needs the Supabase CLI and `npx supabase login`.
   ```sh
   npx supabase functions deploy tiny-push --project-ref hchyekrxubzuqrnlckpm --no-verify-jwt
   npx supabase secrets set --project-ref hchyekrxubzuqrnlckpm TINY_PUSH_SECRET=<secret> VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:<your email>
   ```
   `--no-verify-jwt` is there because the function checks its own secret (header `x-tiny-secret`) instead
   of a Supabase JWT.
5. **Tell the database where to send**, in the SQL Editor:
   ```sql
   insert into tinyagents.config (key, value) values
     ('push_url', 'https://hchyekrxubzuqrnlckpm.supabase.co/functions/v1/tiny-push'),
     ('push_secret', '<secret>')
   on conflict (key) do update set value = excluded.value;
   ```
   Until `push_url` is set, nothing calls `pg_net`. Deleting that row switches alerts off for everyone.
6. **Each device:** Connect → Phone alerts → On, then allow notifications. On iPhone, first tap Share → Add
   to Home Screen and open Tiny Agents from there.

Where the secret lives: in the function's secrets, and in `tinyagents.config`. That table has RLS on and no
grants, so the API can't read it, and the secret is never in the site.

- The function uses the secret to call `tiny_push_gone`, which forgets subscriptions the push service
  reports as gone (404/410).
- A failed push only logs a warning in the database. The office never loses the event.
- The service worker also runs on `localhost`, where it caches nothing, so alerts can be tried with
  `npm run dev`.

## Away mode: approve from the office (opt-in)

Away mode is off by default. When it's on, a permission request on a computer with the approvals hook waits
for a paired device to answer **Approve** or **Deny** in the agent panel. Meanwhile the person stands waving
with "need you!". With away mode off, the hook makes one quick call, sees it's off and exits with no
output, so Claude Code asks as usual.

**Setup, once per computer** (needs Node 18+): **Connect → Away mode → Copy approvals setup prompt**, then
paste it into Claude Code on that computer. Or run `npm run install-hooks -- <computer key> --approvals`.
Either way:
- `~/.claude/tinyagents-approve.mjs` is written (its source is `server/tinyagents-approve.mjs`);
- a synchronous `PermissionRequest` hook is added: `node "<path>" <computer key>`, with a 660-second
  timeout.

Hook commands run in `sh` on macOS, and in Git Bash (or PowerShell) on Windows. That command line works in
all of them.

How a request flows:

1. Claude Code runs the hook with the [`PermissionRequest` input](https://code.claude.com/docs/en/hooks)
   (`session_id`, `tool_name`, `tool_input`, …).
2. The script calls `tiny_approval_wait` with the computer key.
   - Away mode off: the script exits silently.
   - Away mode on: the request is stored and the script polls every 2 seconds.
3. A paired device sees the request and answers with `tiny_decide`. Devices find requests in the
   `approval` field of that agent's snapshot entry, or through `tiny_pending_approvals`.
4. The script prints the decision and Claude Code carries on. An approval looks like
   `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`; a denial
   uses `deny` with a message.

Security model:

- **Only a device token can decide.** The computer key sits in every computer's settings. It can register
  and poll requests, but never approve them.
- **Any paired device can approve** while away mode is on. That's the warning shown when you turn it on,
  so turn it off when you're back.
- **Turning it off drops waiting requests.** Their computers show the normal prompt within 2 seconds.
- **Decisions are single-use.** The computer gets a decision once, then it's deleted.
- **Requests expire.** After 10 minutes unanswered, the computer asks as usual.
- **Your deny rules still apply.** Claude Code checks them even after a hook allows.
- While a request waits, Claude Code holds its own prompt until the hook finishes (up to 10 minutes).
- An office can have at most 50 waiting requests.
- Offline, or on any error, the script prints nothing. That means "no decision", and the normal prompt
  appears.

To remove it, do one of these:
- run `npm run install-hooks -- <computer key>` (without `--approvals`);
- run `npm run install-hooks -- --remove`;
- ask Claude to remove the hook whose command contains `tinyagents-approve`.

## Information and states

Events used: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure,
PermissionRequest, PermissionDenied, Notification, Stop, StopFailure, SubagentStart, SubagentStop,
PreCompact, PostCompact, CwdChanged.

Each session and subagent is in one state:

| State | From | In the office |
| --- | --- | --- |
| `starting` | SessionStart | arrives, then free time |
| `thinking` | prompt, tool finished, compact done | at the desk, mostly still with bursts of typing |
| `tool` | PreToolUse | typing; status shows e.g. "Edit · login.ts"; delegating shows as talking |
| `permission` | PermissionRequest, permission prompt, AskUserQuestion | stands by the desk waving, "need you!" |
| `idle` | Stop | "done!", then coffee, chats, lunch, the park… |
| `compacting` | PreCompact | "tidying my notes" |
| `error` | StopFailure | reacts; on a rate limit or overload, goes for coffee |

A `tool` state with no follow-up for 10 minutes reads as `thinking`.

When the page opens, people whose sessions were already running are placed in the office straight away (at
their desk if Claude is busy). Only new sessions make the trip in.

## Chat

Click a Claude agent to see their conversation:
- your prompts;
- each tool step;
- Claude's reply at the end of each turn.

It updates every few seconds while the panel is open. To reply, use VS Code, or the Claude app with Remote
Control (`/remote-control` in the session). Anthropic offers no way for other apps to send messages into a
session.

## Limits

- Chats on claude.ai, the Claude app and Claude Code on the web don't run your local hooks, so they don't
  appear.
- Claude's intermediate text between tool calls isn't available to hooks; the chat shows the final reply of
  each turn.
- A sleeping or offline computer can't report. Its people show their last state until the session is swept.
