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
  - your prompts and Claude's final reply per turn, for the chat.
- **What's never stored:**
  - file contents (the hook sends the full event, but the function discards it on arrival);
  - full commands;
  - tool output;
  - Claude's intermediate messages.
- **Retention:** chat keeps the newest 300 entries per agent. Ended sessions are deleted with their chat,
  silent sessions after 6 hours, and offices nobody has viewed for 60 days.
- **The computer key** sits in the hook command in `~/.claude/settings.json` on your computers. Anyone with it
  could post fake events to your office, but couldn't read it. The device token is what reads.
- **Shared free database limits:** at most 10 new offices per hour and 100 in total, so strangers can't fill
  the database.

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
