# Claude integration

How Tiny Agents shows your real Claude Code sessions, and runs its staff's minds, from one background app on the
computer that runs Claude Code: the **hub** (`hub/`, setup in [hub/README.md](../hub/README.md)).

## Why it works this way

Anthropic offers no "Sign in with Claude" for third-party apps, and no API that lists your Claude Code
sessions. Their policy rules out using claude.ai login in other products; see
[legal and compliance](https://code.claude.com/docs/en/legal-and-compliance).

What Claude Code does offer is **hooks**: commands it runs by itself at each step of a session. Tiny Agents uses
one hook per event to send a small status update to the hub.

```
PC / Mac: Claude Code (VS Code, terminal)
   │  async hook: curl POST http://127.0.0.1:7777/ingest, never blocks Claude
   ▼
Tiny Agents hub (node hub/hub.mjs, on the computer that runs Claude Code)
   office.mjs: events → per-session state, chat, stats, replay log  (~/.tinyagents/office.json)
   mind.mjs:   the staff's minds, the fine-tuned model in the hub's own Ollama
   ▲
   │  live updates (Server-Sent Events) and requests, with this device's token
tinyvoters.app/tinyagents or localhost:5173 (static site)
```

Nothing goes through a cloud service: the hub and its data stay on your computer. When the hub isn't running, the
office shows nothing live and the staff fall back to their built-in lines; Claude Code itself is unaffected.

## Setup

1. **The hub, once:** see [hub/README.md](../hub/README.md) (Ollama, the model, `npm run hub` or
   `npm run hub:autostart`).
2. **Your office, once:** open the site, tap the status pill, then **Create my office**. This device is now
   paired. The first device creates the office; later ones join with a code.
3. **Each computer, once:** in **Connect → Add a computer**, pick Windows or Mac and copy the setup prompt.
   Paste it into Claude Code on that computer, and Claude adds the hooks itself. The hooks apply to new
   sessions; in an open one, run `/hooks`.
   - With this repo checked out, `npm run install-hooks -- <computer key>` does the same thing
     (`--hub <url>` for a hub elsewhere, `--approvals` adds the away-mode hook).
   - To undo: `npm run install-hooks -- --remove`.
4. **Each viewing device, once:** in **Connect → Add a device**, get a 6-letter code (valid 10 minutes), and enter
   it on the other device.

The site talks to the hub at `http://127.0.0.1:7777`. Other devices reach it at `https://<home IP>:4888`, entered with the pairing code under
Connect → I have a code (see hub/README.md → Reaching the hub from anywhere).

## Security and privacy

- **The hub listens on this computer only** (127.0.0.1). Every request checks either:
  - the **computer key**, sent in the `x-tiny-key` header, for writing events and away-mode requests; or
  - a **device token**, stored only as a SHA-256 hash, for viewing and for the minds.
- **What's kept** (in `~/.tinyagents/office.json`):
  - session state;
  - the tool name with a short detail (file name, search term, host, command name or Claude's own
    description);
  - your prompts and Claude's final reply per turn, for the chat;
  - **stats:** counters only per UTC hour and per staff member (computer name + project folder name), plus a
    hash of each edited file's path to count distinct files a day;
  - **careers:** lifetime counters per computer + project folder;
  - **replay log:** each state or tool change of each agent;
  - **customized people** (name and look, at most 4 KB each) and **custom names** for teams and rooms.
- **Kept in memory only:** pairing codes, and away-mode requests while one waits (for Bash/PowerShell the
  detail is the command itself, up to 300 characters, so you know what you approve).
- **Never stored:** file contents, full commands, tool output, Claude's intermediate messages.
- **Retention:** chat keeps the newest 300 entries per agent. Ended sessions are deleted with their chat, silent
  sessions after 6 hours. Hourly stats and file hashes: 16 days. Replay log: 2 days, at most 8000 rows.
- **The computer key** sits in the hook command in `~/.claude/settings.json`. Anyone with it could post fake
  events, but couldn't read the office.

## The staff's minds

Every office worker has one mind with three outputs, all served by the hub's model (about 0.15 s each):
**thinking** (private thoughts, shown in the character window), **speaking** (bubbles and conversations) and
**acting** (picking what to do next). They share one state: the latest thought stays on the worker's mind and is
in every request, as is their **plan** (what they intend to do when free, like "coffee" or "chat with Theo"),
which a thought or a conversation can set and which the behaviour system then favours. Workers think on their own
every minute or so and soon after something happens to them. A worker whose real Claude session needs them in the
middle of a conversation finishes the turn, excuses themselves, then goes.

On NVIDIA cards the hub pauses the minds while a game keeps the GPU busy (see hub/README.md → Game mode).

## Away mode: approve from the office (opt-in)

Away mode is off by default. When it's on, a permission request on a computer with the approvals hook waits for
a paired device to answer **Approve** or **Deny** in the agent panel. With away mode off, the hook makes one quick
call, sees it's off and exits with no output, so Claude Code asks as usual.

**Setup, once per computer** (needs Node 18+): **Connect → Away mode → Copy approvals setup prompt**, then paste
it into Claude Code on that computer, or run `npm run install-hooks -- <computer key> --approvals`. Either way
`~/.claude/tinyagents-approve.mjs` is written (source: `server/tinyagents-approve.mjs`) and a synchronous
`PermissionRequest` hook runs `node "<path>" <computer key> <hub url>` with a 660-second timeout.

- **Only a device token can decide.** The computer key can register and poll requests, never approve them.
- **Turning it off drops waiting requests**; their computers show the normal prompt within 2 seconds.
- **Decisions are single-use**, and requests expire after 10 minutes.
- **Your deny rules still apply**: Claude Code checks them even after a hook allows.
- Offline, or on any error, the script prints nothing, so the normal prompt appears.

## Visitor links (read-only)

**Connect → Visitor link** makes a `?visit=<token>` link that shows only who's busy or waiting: no tools,
details, titles, projects, computers or chat, and hashed agent ids. **Revoke link** stops it at once.

## Information and states

Events used: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure,
PermissionRequest, PermissionDenied, Notification, Stop, StopFailure, SubagentStart, SubagentStop,
PreCompact, PostCompact, CwdChanged.

| State | From | In the office |
| --- | --- | --- |
| `starting` | SessionStart | arrives, then free time |
| `thinking` | prompt, tool finished, compact done | at the desk, mostly still with bursts of typing |
| `tool` | PreToolUse | typing; status shows e.g. "Edit · login.ts"; delegating shows as talking |
| `permission` | PermissionRequest, permission prompt, AskUserQuestion | stands by the desk waving, "need you!" |
| `idle` | Stop | "done!", then coffee, chats, lunch, the park… |
| `compacting` | PreCompact | "tidying my notes" |
| `error` | StopFailure | reacts; on a rate limit or overload, goes for coffee |

A `tool` state with no follow-up for 10 minutes reads as `thinking`. Subagents get their role from their agent
type, or for general-purpose helpers from the task they were given.

## Chat

Click a Claude agent to see your prompts, each tool step and Claude's reply at the end of each turn. To reply,
use VS Code, or the Claude app with Remote Control (`/remote-control` in the session).

## Limits

- Chats on claude.ai, the Claude app and Claude Code on the web don't run your local hooks, so they don't appear.
- Claude's intermediate text between tool calls isn't available to hooks; the chat shows the final reply.
- While the hub is off, events from that time are lost (Claude Code doesn't retry its hooks).
