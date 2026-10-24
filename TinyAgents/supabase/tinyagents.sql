-- Tiny Agents: the whole backend, living beside the wiki in the same Supabase project.
-- Run the whole file in the SQL Editor. Re-runnable: it only creates or replaces Tiny Agents' own objects.
--
-- WHAT THIS TOUCHES
--   * schema  tinyagents   (new): homes, devices, pairings, sessions, messages, stat_hours, stat_files,
--                                  careers, history, push_subs, approvals, config, people, labels
--   * public functions named tiny_*  (new): the only way in or out
--   * optional: web push calls the pg_net extension (net.http_post), only once you configure it (see
--     docs/CLAUDE_INTEGRATION.md → Phone alerts). Without that configuration nothing calls pg_net.
-- It never drops, alters or deletes anything that isn't its own. The wiki's tables, policies and
-- functions are not referenced anywhere in this file.
--
-- ACCESS MODEL
--   A "home" is one person's office. Its computers post Claude Code hook events with the home's
--   ingest key (header x-tiny-key); each viewing device holds its own device token (stored here only
--   as a SHA-256 hash). The tinyagents tables have RLS on and NO policies and no grants, so the anon key
--   cannot read or write them directly. Everything goes through the SECURITY DEFINER tiny_* functions
--   below, each of which checks a key or token first.
--
-- PRIVACY
--   Hook events are trimmed on arrival: the office keeps state, tool name, a short detail (file name,
--   search term, host, command name or Claude's own description), your prompts and Claude's final reply
--   per turn (for the chat history). File contents, full commands and tool output are never stored.
--   Ended sessions are deleted with their messages; anything silent for 6 hours is swept.
--   Stats keep counters only (per hour and per computer + project folder), plus a hash of each edited
--   file's path for the daily "files touched" count; hourly rows last 16 days. The replay log keeps
--   state/tool changes for 2 days (at most 8000 rows per office).

create schema if not exists tinyagents;
revoke all on schema tinyagents from public, anon, authenticated;

create table if not exists tinyagents.homes (
  id          uuid primary key default gen_random_uuid(),
  ingest_key  text not null unique,
  created_at  timestamptz not null default now(),
  last_event  timestamptz,
  last_view   timestamptz not null default now()
);

create table if not exists tinyagents.devices (
  token_hash  text primary key,
  home_id     uuid not null references tinyagents.homes(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists tinyagents.pairings (
  code        text primary key,
  home_id     uuid not null references tinyagents.homes(id) on delete cascade,
  expires_at  timestamptz not null
);

create table if not exists tinyagents.sessions (
  home_id      uuid not null references tinyagents.homes(id) on delete cascade,
  id           text not null,          -- session_id, or session_id:agent_id for a subagent
  session_id   text not null,
  kind         text not null default 'main' check (kind in ('main','sub')),
  agent_type   text not null default 'main',
  parent       text,
  machine      text not null default '',
  cwd          text not null default '',
  title        text,
  description  text,
  model        text,
  mode         text,
  state        text not null default 'starting'
               check (state in ('starting','thinking','tool','permission','idle','compacting','error')),
  since        timestamptz not null default now(),
  started_at   timestamptz not null default now(),
  last_at      timestamptz not null default now(),
  tool         text,
  detail       text,
  prompts      int not null default 0,
  tool_calls   int not null default 0,
  errors       int not null default 0,
  error        text,
  background   int not null default 0,
  pending_task text,
  primary key (home_id, id)
);
create index if not exists sessions_session_idx on tinyagents.sessions (home_id, session_id);

create table if not exists tinyagents.messages (
  id        bigserial primary key,
  home_id   uuid not null,
  agent_id  text not null,
  at        timestamptz not null default now(),
  role      text not null check (role in ('user','assistant','tool','note')),
  text      text not null,
  foreign key (home_id, agent_id) references tinyagents.sessions(home_id, id) on delete cascade
);
create index if not exists messages_agent_idx on tinyagents.messages (home_id, agent_id, id);

-- later additions to the first tables
alter table tinyagents.homes add column if not exists visitor_token text unique;
alter table tinyagents.homes add column if not exists public_on boolean not null default false;
alter table tinyagents.homes add column if not exists public_name text;
alter table tinyagents.homes add column if not exists away boolean not null default false;
alter table tinyagents.sessions add column if not exists turn_at timestamptz;

-- Counters per UTC hour and staff member (computer + project folder), so a viewer's local day can be summed.
create table if not exists tinyagents.stat_hours (
  home_id      uuid not null references tinyagents.homes(id) on delete cascade,
  hour         timestamptz not null,
  machine      text not null,
  project      text not null,
  sessions     int not null default 0,
  prompts      int not null default 0,
  tool_calls   int not null default 0,
  errors       int not null default 0,
  turns        int not null default 0,
  longest_min  int not null default 0,
  tools        jsonb not null default '{}'::jsonb,
  primary key (home_id, hour, machine, project)
);

-- A hash of each edited file's path per hour, for counting distinct files a day. Never the path itself.
create table if not exists tinyagents.stat_files (
  home_id    uuid not null references tinyagents.homes(id) on delete cascade,
  hour       timestamptz not null,
  file_hash  text not null,
  primary key (home_id, hour, file_hash)
);

-- Lifetime counters of one recurring staff member; they outlive the sessions.
create table if not exists tinyagents.careers (
  home_id      uuid not null references tinyagents.homes(id) on delete cascade,
  machine      text not null,
  project      text not null,
  sessions     int not null default 0,
  prompts      int not null default 0,
  tool_calls   int not null default 0,
  turns        int not null default 0,
  tools        jsonb not null default '{}'::jsonb,
  days_worked  int not null default 1,
  last_day     date not null default (now() at time zone 'utc')::date,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  primary key (home_id, machine, project)
);

-- The replay log: one row per state or tool change of an agent ('ended' when it leaves).
create table if not exists tinyagents.history (
  id          bigserial primary key,
  home_id     uuid not null references tinyagents.homes(id) on delete cascade,
  at          timestamptz not null default now(),
  agent_id    text not null,
  kind        text not null,
  agent_type  text not null,
  parent      text,
  machine     text,
  project     text,
  state       text not null,
  tool        text,
  detail      text
);
create index if not exists history_home_idx on tinyagents.history (home_id, id);
create index if not exists history_agent_idx on tinyagents.history (home_id, agent_id, id);

-- Web push subscriptions, one per viewing device and browser.
create table if not exists tinyagents.push_subs (
  endpoint    text primary key,
  home_id     uuid not null references tinyagents.homes(id) on delete cascade,
  token_hash  text not null references tinyagents.devices(token_hash) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_subs_home_idx on tinyagents.push_subs (home_id);

-- Away mode: permission requests waiting for a decision from a paired device.
create table if not exists tinyagents.approvals (
  id          uuid primary key default gen_random_uuid(),
  home_id     uuid not null references tinyagents.homes(id) on delete cascade,
  agent_id    text not null,
  tool        text not null,
  detail      text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '10 minutes',
  decision    text check (decision in ('allow', 'deny')),
  decided_at  timestamptz
);
create index if not exists approvals_home_idx on tinyagents.approvals (home_id, agent_id);

-- Customized people (name and look edited in the agent panel), shared by every device of the office.
create table if not exists tinyagents.people (
  home_id     uuid not null references tinyagents.homes(id) on delete cascade,
  slot        text not null check (length(slot) between 1 and 120),
  person      jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (home_id, slot)
);

-- Custom names for teams and rooms (renamed signs and Team list headers), shared by every device of the office.
create table if not exists tinyagents.labels (
  home_id     uuid not null references tinyagents.homes(id) on delete cascade,
  key         text not null check (length(key) between 1 and 120),
  name        text not null check (length(name) between 1 and 40),
  updated_at  timestamptz not null default now(),
  primary key (home_id, key)
);

-- Server-side settings you set by hand in the SQL Editor (push_url, push_secret). Never readable over the API.
create table if not exists tinyagents.config (
  key    text primary key,
  value  text not null
);

alter table tinyagents.homes    enable row level security;
alter table tinyagents.devices  enable row level security;
alter table tinyagents.pairings enable row level security;
alter table tinyagents.sessions enable row level security;
alter table tinyagents.messages enable row level security;
alter table tinyagents.stat_hours enable row level security;
alter table tinyagents.stat_files enable row level security;
alter table tinyagents.careers    enable row level security;
alter table tinyagents.history    enable row level security;
alter table tinyagents.push_subs  enable row level security;
alter table tinyagents.approvals  enable row level security;
alter table tinyagents.config     enable row level security;
alter table tinyagents.people     enable row level security;
alter table tinyagents.labels     enable row level security;
revoke all on all tables in schema tinyagents from public, anon, authenticated;
revoke all on all sequences in schema tinyagents from public, anon, authenticated;

/* ------------------------------------------------------------------------------------------------ */
/* Internal helpers (schema tinyagents: not reachable over the API)                                  */
/* ------------------------------------------------------------------------------------------------ */

-- 64 hex chars of randomness, no extension needed.
create or replace function tinyagents.secret() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function tinyagents.hash(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex');
$$;

-- The home a device token belongs to, or null.
create or replace function tinyagents.home_for(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select d.home_id from tinyagents.devices d where d.token_hash = tinyagents.hash(p_token);
$$;

-- The same, but an unknown token is an error.
create or replace function tinyagents.must_home(p_token text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.home_for(p_token);
begin
  if v_home is null then
    raise exception 'not paired' using errcode = '28000';
  end if;
  return v_home;
end;
$$;

-- An office name others may see: printable, single-spaced, at most 24 characters.
create or replace function tinyagents.clean_name(p text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[^[:alnum:] .,''&!?-]', '', 'g'), '\s+', ' ', 'g')), 24);
$$;

-- A short, privacy-light summary of what a tool call is about.
create or replace function tinyagents.tool_detail(p_tool text, p_in jsonb) returns text
language sql immutable set search_path = '' as $$
  select left(nullif(btrim(case
    when p_tool in ('Read', 'Edit', 'MultiEdit', 'Write') then regexp_replace(coalesce(p_in ->> 'file_path', ''), '^.*[\\/]', '')
    when p_tool = 'NotebookEdit' then regexp_replace(coalesce(p_in ->> 'notebook_path', ''), '^.*[\\/]', '')
    when p_tool in ('Bash', 'PowerShell') then coalesce(nullif(p_in ->> 'description', ''), split_part(btrim(coalesce(p_in ->> 'command', '')), ' ', 1))
    when p_tool in ('Grep', 'Glob') then p_in ->> 'pattern'
    when p_tool = 'WebSearch' then p_in ->> 'query'
    when p_tool = 'WebFetch' then substring(coalesce(p_in ->> 'url', '') from '^[a-zA-Z]+://([^/:?#]+)')
    when p_tool in ('Agent', 'Task') then coalesce(nullif(p_in ->> 'description', ''), p_in ->> 'subagent_type')
    when p_tool = 'Skill' then coalesce(p_in ->> 'skill', p_in ->> 'name')
    when p_tool like 'mcp\_\_%' then split_part(p_tool, '__', 2)
  end), ''), 60);
$$;

create or replace function tinyagents.tool_label(p_tool text) returns text
language sql immutable set search_path = '' as $$
  select case when p_tool like 'mcp\_\_%' then 'MCP · ' || split_part(p_tool, '__', 2) else p_tool end;
$$;

-- Moves an agent to a state; `since` only resets when the state actually changes.
create or replace function tinyagents.put_state(p_home uuid, p_id text, p_state text) returns void
language sql volatile security definer set search_path = '' as $$
  update tinyagents.sessions
     set since = case when state = p_state then since else now() end,
         state = p_state
   where home_id = p_home and id = p_id;
$$;

create or replace function tinyagents.note(p_home uuid, p_id text, p_role text, p_text text) returns void
language sql volatile security definer set search_path = '' as $$
  insert into tinyagents.messages (home_id, agent_id, role, text)
  select p_home, p_id, p_role, left(p_text, 8000)
   where coalesce(p_text, '') <> ''
     and exists (select 1 from tinyagents.sessions s where s.home_id = p_home and s.id = p_id);
$$;

create or replace function tinyagents.folder(p_cwd text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(p_cwd, ''), '^.*[\\/]', '');
$$;

create or replace function tinyagents.utc_hour() returns timestamptz
language sql stable set search_path = '' as $$
  select date_trunc('hour', now() at time zone 'utc') at time zone 'utc';
$$;

-- Adds to today's counters and the career of the staff member behind main session p_sid.
create or replace function tinyagents.tally(
  p_home uuid, p_sid text,
  p_sessions int default 0, p_prompts int default 0, p_tool text default null, p_errors int default 0,
  p_turns int default 0, p_longest int default 0, p_file text default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_machine text;
  v_project text;
  v_hour    timestamptz := tinyagents.utc_hour();
  v_tools   jsonb := case when p_tool is null then '{}'::jsonb else jsonb_build_object(p_tool, 1) end;
  v_today   date := (now() at time zone 'utc')::date;
begin
  select s.machine, tinyagents.folder(s.cwd) into v_machine, v_project
    from tinyagents.sessions s where s.home_id = p_home and s.id = p_sid;
  if v_machine is null then
    return;
  end if;
  insert into tinyagents.stat_hours as h (home_id, hour, machine, project, sessions, prompts, tool_calls, errors, turns, longest_min, tools)
  values (p_home, v_hour, v_machine, v_project, p_sessions, p_prompts, (p_tool is not null)::int, p_errors, p_turns, p_longest, v_tools)
  on conflict (home_id, hour, machine, project) do update
     set sessions    = h.sessions + excluded.sessions,
         prompts     = h.prompts + excluded.prompts,
         tool_calls  = h.tool_calls + excluded.tool_calls,
         errors      = h.errors + excluded.errors,
         turns       = h.turns + excluded.turns,
         longest_min = greatest(h.longest_min, excluded.longest_min),
         tools       = case when p_tool is null then h.tools
                            else h.tools || jsonb_build_object(p_tool, coalesce((h.tools ->> p_tool)::int, 0) + 1) end;
  insert into tinyagents.careers as c (home_id, machine, project, sessions, prompts, tool_calls, turns, tools)
  values (p_home, v_machine, v_project, p_sessions, p_prompts, (p_tool is not null)::int, p_turns, v_tools)
  on conflict (home_id, machine, project) do update
     set sessions    = c.sessions + excluded.sessions,
         prompts     = c.prompts + excluded.prompts,
         tool_calls  = c.tool_calls + excluded.tool_calls,
         turns       = c.turns + excluded.turns,
         tools       = case when p_tool is null then c.tools
                            else c.tools || jsonb_build_object(p_tool, coalesce((c.tools ->> p_tool)::int, 0) + 1) end,
         days_worked = c.days_worked + (c.last_day < v_today)::int,
         last_day    = v_today,
         last_seen   = now();
  if p_file is not null then
    insert into tinyagents.stat_files (home_id, hour, file_hash)
    values (p_home, v_hour, left(tinyagents.hash(p_file), 32))
    on conflict do nothing;
  end if;
end;
$$;

-- The replay log, kept by a trigger on sessions so every state change is caught wherever it happens.
create or replace function tinyagents.log_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r tinyagents.sessions := case when tg_op = 'DELETE' then old else new end;
begin
  -- when a whole office is deleted, its sessions go with it: nothing left to log for
  if tg_op = 'DELETE' and not exists (select 1 from tinyagents.homes h where h.id = old.home_id) then
    return null;
  end if;
  insert into tinyagents.history (home_id, agent_id, kind, agent_type, parent, machine, project, state, tool, detail)
  values (r.home_id, r.id, r.kind, r.agent_type, r.parent, nullif(r.machine, ''), nullif(tinyagents.folder(r.cwd), ''),
          case when tg_op = 'DELETE' then 'ended' else r.state end,
          case when tg_op <> 'DELETE' and r.state = 'tool' then r.tool end,
          case when tg_op <> 'DELETE' and r.state = 'tool' then r.detail end);
  return null;
end;
$$;

drop trigger if exists sessions_history_ins on tinyagents.sessions;
drop trigger if exists sessions_history_upd on tinyagents.sessions;
drop trigger if exists sessions_history_del on tinyagents.sessions;
create trigger sessions_history_ins after insert on tinyagents.sessions
  for each row execute function tinyagents.log_history();
create trigger sessions_history_upd after update on tinyagents.sessions
  for each row when (old.state is distinct from new.state
                     or (new.state = 'tool' and (old.tool is distinct from new.tool or old.detail is distinct from new.detail)))
  execute function tinyagents.log_history();
create trigger sessions_history_del after delete on tinyagents.sessions
  for each row execute function tinyagents.log_history();

-- Phone alerts: hands the office's push subscriptions to the tiny-push Edge Function (via pg_net, which
-- queues the request and returns at once). Does nothing until push_url is set in tinyagents.config.
create or replace function tinyagents.push(p_home uuid, p_sid text, p_kind text, p_text text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_url     text := (select c.value from tinyagents.config c where c.key = 'push_url');
  v_secret  text := (select c.value from tinyagents.config c where c.key = 'push_secret');
  v_subs    jsonb;
  v_project text;
begin
  if v_url is null then
    return;
  end if;
  select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
    into v_subs from tinyagents.push_subs p where p.home_id = p_home;
  if v_subs is null then
    return;
  end if;
  select nullif(tinyagents.folder(s.cwd), '') into v_project from tinyagents.sessions s where s.home_id = p_home and s.id = p_sid;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('title', coalesce(v_project, 'Claude Code'), 'body', p_text, 'tag', p_kind || ':' || p_sid, 'subs', v_subs),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tiny-secret', coalesce(v_secret, ''))
  );
exception when others then
  -- a push problem (pg_net off, bad URL) must never cost the office its event
  raise warning 'tiny push failed: %', sqlerrm;
end;
$$;

revoke all on all functions in schema tinyagents from public, anon, authenticated;

/* ------------------------------------------------------------------------------------------------ */
/* tiny_ingest: one Claude Code hook event (request body), authenticated by header x-tiny-key        */
/* ------------------------------------------------------------------------------------------------ */

create or replace function public.tiny_ingest(jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  evt       jsonb := $1;
  hdrs      jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_home    uuid;
  v_sid     text := left(evt ->> 'session_id', 100);
  v_name    text := evt ->> 'hook_event_name';
  v_agent   text := left(evt ->> 'agent_id', 100);
  v_id      text;
  v_tool    text := evt ->> 'tool_name';
  v_label   text := tinyagents.tool_label(evt ->> 'tool_name');
  v_detail  text;
  v_type    text;
  v_model   text;
  v_prev    text;
  v_turn    interval;
begin
  select h.id into v_home from tinyagents.homes h where h.ingest_key = coalesce(hdrs ->> 'x-tiny-key', '');
  if v_home is null then
    raise exception 'unknown key' using errcode = '28000';
  end if;
  if v_sid is null or v_name is null then
    return;
  end if;
  update tinyagents.homes set last_event = now() where id = v_home;

  if v_name = 'SessionEnd' then
    perform tinyagents.tally(v_home, v_sid, p_longest => (
      select floor(extract(epoch from now() - s.started_at) / 60)::int from tinyagents.sessions s where s.home_id = v_home and s.id = v_sid));
    delete from tinyagents.sessions where home_id = v_home and session_id = v_sid;
    return;
  end if;

  v_model := case jsonb_typeof(evt -> 'model')
    when 'string' then evt ->> 'model'
    when 'object' then coalesce(evt -> 'model' ->> 'display_name', evt -> 'model' ->> 'id')
  end;

  -- the main session row always exists
  insert into tinyagents.sessions (home_id, id, session_id, machine)
  values (v_home, v_sid, v_sid, left(coalesce(hdrs ->> 'x-tiny-machine', ''), 40))
  on conflict (home_id, id) do nothing;
  update tinyagents.sessions
     set last_at = now(),
         cwd     = coalesce(evt ->> 'cwd', cwd),
         mode    = coalesce(evt ->> 'permission_mode', mode),
         model   = coalesce(v_model, model),
         machine = coalesce(nullif(left(hdrs ->> 'x-tiny-machine', 40), ''), machine)
   where home_id = v_home and id = v_sid;

  -- events from inside a subagent carry agent_id: they act on the subagent's own row
  v_id := v_sid;
  if v_agent is not null then
    v_id := v_sid || ':' || v_agent;
    if not exists (select 1 from tinyagents.sessions where home_id = v_home and id = v_id) then
      insert into tinyagents.sessions (home_id, id, session_id, kind, agent_type, parent, machine, cwd, state, description)
      select v_home, v_id, v_sid, 'sub', coalesce(evt ->> 'agent_type', 'general-purpose'), v_sid, m.machine, m.cwd, 'thinking', m.pending_task
        from tinyagents.sessions m where m.home_id = v_home and m.id = v_sid;
      update tinyagents.sessions set pending_task = null where home_id = v_home and id = v_sid;
    end if;
    update tinyagents.sessions set last_at = now() where home_id = v_home and id = v_id;
  end if;
  select s.state into v_prev from tinyagents.sessions s where s.home_id = v_home and s.id = v_id;

  case v_name
    when 'SessionStart' then
      if v_agent is null then
        update tinyagents.sessions
           set agent_type = coalesce(evt ->> 'agent_type', 'main'),
               title = coalesce(left(evt ->> 'session_title', 120), title),
               tool = null, detail = null
         where home_id = v_home and id = v_sid;
        perform tinyagents.put_state(v_home, v_sid, case when evt ->> 'source' = 'compact' then 'thinking' else 'starting' end);
        if coalesce(evt ->> 'source', '') <> 'compact' then
          perform tinyagents.tally(v_home, v_sid, p_sessions => 1);
        end if;
        -- housekeeping: sessions that went silent without a SessionEnd, old stats, replay log and requests
        delete from tinyagents.sessions where home_id = v_home and last_at < now() - interval '6 hours';
        delete from tinyagents.stat_hours where home_id = v_home and hour < now() - interval '16 days';
        delete from tinyagents.stat_files where home_id = v_home and hour < now() - interval '16 days';
        delete from tinyagents.history where home_id = v_home and at < now() - interval '2 days';
        delete from tinyagents.approvals where home_id = v_home and expires_at < now();
      end if;

    when 'UserPromptSubmit' then
      update tinyagents.sessions set prompts = prompts + 1, error = null, tool = null, detail = null, turn_at = now()
       where home_id = v_home and id = v_sid;
      perform tinyagents.put_state(v_home, v_sid, 'thinking');
      perform tinyagents.tally(v_home, v_sid, p_prompts => 1);
      perform tinyagents.note(v_home, v_sid, 'user', evt ->> 'prompt');

    when 'PreToolUse' then
      v_detail := tinyagents.tool_detail(v_tool, evt -> 'tool_input');
      v_type := case when v_tool in ('AskUserQuestion', 'ExitPlanMode') then 'permission' else 'tool' end;
      -- one update, so the replay log sees the new tool and state together
      update tinyagents.sessions
         set tool = v_label, detail = v_detail, tool_calls = tool_calls + 1,
             since = case when state = v_type then since else now() end, state = v_type
       where home_id = v_home and id = v_id;
      perform tinyagents.tally(v_home, v_sid, p_tool => v_label,
        p_file => case when v_tool in ('Edit', 'Write', 'MultiEdit') then evt -> 'tool_input' ->> 'file_path'
                       when v_tool = 'NotebookEdit' then evt -> 'tool_input' ->> 'notebook_path' end);
      perform tinyagents.note(v_home, v_id, 'tool', v_label || coalesce(' · ' || v_detail, ''));
      if v_agent is null and v_tool in ('Agent', 'Task') then
        update tinyagents.sessions set pending_task = v_detail where home_id = v_home and id = v_sid;
      end if;

    when 'PermissionRequest' then
      perform tinyagents.put_state(v_home, v_id, 'permission');
      perform tinyagents.note(v_home, v_id, 'note', 'Asking to use ' || coalesce(v_label, 'a tool'));

    when 'PostToolUse' then
      perform tinyagents.put_state(v_home, v_id, 'thinking');

    when 'PermissionDenied' then
      perform tinyagents.put_state(v_home, v_id, 'thinking');
      perform tinyagents.note(v_home, v_id, 'note', coalesce(v_label, 'Tool') || ' was denied');

    when 'PostToolUseFailure' then
      update tinyagents.sessions set errors = errors + 1 where home_id = v_home and id = v_id;
      perform tinyagents.put_state(v_home, v_id, 'thinking');
      perform tinyagents.tally(v_home, v_sid, p_errors => 1);
      perform tinyagents.note(v_home, v_id, 'note', coalesce(v_label, 'Tool') || ' failed');

    when 'Notification' then
      v_type := coalesce(evt ->> 'notification_type',
        case when coalesce(evt ->> 'message', '') ilike '%permission%' then 'permission_prompt' end);
      if v_type in ('permission_prompt', 'elicitation_dialog') then
        perform tinyagents.put_state(v_home, v_id, 'permission');
      elsif v_type = 'idle_prompt' and v_agent is null then
        perform tinyagents.put_state(v_home, v_sid, 'idle');
      end if;

    when 'PreCompact' then
      perform tinyagents.put_state(v_home, v_sid, 'compacting');
      perform tinyagents.note(v_home, v_sid, 'note', 'Compacting its context');

    when 'PostCompact' then
      perform tinyagents.put_state(v_home, v_sid, 'thinking');

    when 'Stop' then
      if v_agent is null then
        select now() - s.turn_at into v_turn from tinyagents.sessions s where s.home_id = v_home and s.id = v_sid;
        perform tinyagents.tally(v_home, v_sid, p_turns => 1, p_longest => (
          select floor(extract(epoch from now() - s.started_at) / 60)::int from tinyagents.sessions s where s.home_id = v_home and s.id = v_sid));
        update tinyagents.sessions
           set tool = null, detail = null, turn_at = null,
               background = coalesce(jsonb_array_length(case when jsonb_typeof(evt -> 'background_tasks') = 'array' then evt -> 'background_tasks' end), 0)
                          + coalesce(jsonb_array_length(case when jsonb_typeof(evt -> 'session_crons') = 'array' then evt -> 'session_crons' end), 0)
         where home_id = v_home and id = v_sid;
        perform tinyagents.put_state(v_home, v_sid, 'idle');
        perform tinyagents.note(v_home, v_sid, 'assistant', evt ->> 'last_assistant_message');
        -- keep the chat history bounded: the newest 300 entries per agent
        delete from tinyagents.messages m
         where m.home_id = v_home and m.agent_id = v_sid
           and m.id < (select x.id from tinyagents.messages x
                        where x.home_id = v_home and x.agent_id = v_sid
                        order by x.id desc offset 299 limit 1);
        -- and the replay log: the newest 8000 rows per office
        delete from tinyagents.history h
         where h.home_id = v_home
           and h.id < (select x.id from tinyagents.history x where x.home_id = v_home order by x.id desc offset 7999 limit 1);
        if v_turn > interval '3 minutes' then
          perform tinyagents.push(v_home, v_sid, 'done', 'Finished after ' || floor(extract(epoch from v_turn) / 60)::int || ' min of work');
        end if;
      end if;

    when 'StopFailure' then
      update tinyagents.sessions
         set errors = errors + 1, error = left(coalesce(evt ->> 'error', 'unknown'), 60), tool = null, detail = null, turn_at = null
       where home_id = v_home and id = v_sid;
      perform tinyagents.tally(v_home, v_sid, p_errors => 1);
      perform tinyagents.put_state(v_home, v_sid, 'error');
      perform tinyagents.note(v_home, v_sid, 'note', 'Stopped: ' || replace(coalesce(evt ->> 'error', 'unknown error'), '_', ' '));

    when 'SubagentStart' then
      if v_agent is not null then
        perform tinyagents.put_state(v_home, v_id, 'thinking');
      end if;

    when 'SubagentStop' then
      if v_agent is not null then
        perform tinyagents.note(v_home, v_sid, 'note',
          'Helper finished: ' || coalesce(evt ->> 'agent_type', 'subagent'));
        delete from tinyagents.sessions where home_id = v_home and id = v_id;
      end if;

    when 'CwdChanged' then
      update tinyagents.sessions set cwd = coalesce(evt ->> 'new_cwd', cwd)
       where home_id = v_home and session_id = v_sid;

    else
      null;
  end case;

  -- a phone alert when someone starts waiting on you
  if v_prev is distinct from 'permission'
     and exists (select 1 from tinyagents.sessions s where s.home_id = v_home and s.id = v_id and s.state = 'permission') then
    perform tinyagents.push(v_home, v_sid, 'permission', case
      when v_tool = 'AskUserQuestion' then 'Has a question for you'
      when v_tool = 'ExitPlanMode' then 'Has a plan ready for you'
      when v_label is not null then 'Asks to use ' || v_label
      else 'Needs your permission' end);
  end if;
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Viewing: the office roster and one agent's chat                                                   */
/* ------------------------------------------------------------------------------------------------ */

create or replace function public.tiny_snapshot(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.home_for(p_token);
  v_away boolean := coalesce((select h.away from tinyagents.homes h where h.id = v_home), false);
begin
  if v_home is null then
    raise exception 'not paired' using errcode = '28000';
  end if;
  update tinyagents.homes set last_view = now() where id = v_home and last_view < now() - interval '10 minutes';
  return coalesce((
    select jsonb_agg(a order by a ->> 'kind', a ->> 'id')
      from (
        select jsonb_strip_nulls(jsonb_build_object(
          'id', s.id,
          'kind', s.kind,
          'type', s.agent_type,
          'parent', s.parent,
          'machine', nullif(s.machine, ''),
          'project', nullif(regexp_replace(s.cwd, '^.*[\\/]', ''), ''),
          'title', s.title,
          'description', s.description,
          'model', s.model,
          'mode', s.mode,
          'state', e.state,
          'busy', e.state in ('thinking', 'tool', 'compacting'),
          'waiting', e.state = 'permission',
          'tool', case when e.state = 'tool' then s.tool end,
          'detail', case when e.state = 'tool' then s.detail end,
          'stateFor', floor(extract(epoch from now() - s.since))::int,
          'age', floor(extract(epoch from now() - s.started_at))::int,
          'prompts', s.prompts,
          'toolCalls', s.tool_calls,
          'errors', s.errors,
          'error', s.error,
          'background', s.background,
          'subagents', (select count(*) from tinyagents.sessions c where c.home_id = s.home_id and c.parent = s.id),
          'approval', case when v_away then (
            select jsonb_strip_nulls(jsonb_build_object('id', ap.id, 'tool', ap.tool, 'detail', ap.detail))
              from tinyagents.approvals ap
             where ap.home_id = s.home_id and ap.agent_id = s.id and ap.decision is null and ap.expires_at > now()
             order by ap.created_at desc limit 1) end,
          'recent', (
            select coalesce(jsonb_agg(jsonb_build_object('ago', floor(extract(epoch from now() - r.at))::int, 'text', left(r.text, 80)) order by r.id desc), '[]'::jsonb)
              from (select m.id, m.at, m.text from tinyagents.messages m
                     where m.home_id = s.home_id and m.agent_id = s.id and m.role in ('tool', 'note')
                     order by m.id desc limit 6) r
          )
        )) as a
          from tinyagents.sessions s
          -- a tool that never reported back counts as thinking after 10 minutes
          cross join lateral (select case when s.state = 'tool' and s.since < now() - interval '10 minutes'
                                          then 'thinking' else s.state end as state) e
         where s.home_id = v_home and s.last_at > now() - interval '6 hours'
      ) x
  ), '[]'::jsonb);
end;
$$;

-- Chat history for one agent: entries after `p_after` (0 = the latest 120).
create or replace function public.tiny_messages(p_token text, p_agent text, p_after bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.home_for(p_token);
begin
  if v_home is null then
    raise exception 'not paired' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'role', m.role, 'text', m.text) order by m.id)
      from (select * from tinyagents.messages x
             where x.home_id = v_home and x.agent_id = p_agent and x.id > coalesce(p_after, 0)
             order by x.id desc limit 120) m
  ), '[]'::jsonb);
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Homes and devices                                                                                 */
/* ------------------------------------------------------------------------------------------------ */

-- Creates a new office. Returns the computers' ingest key and this device's token (shown once).
create or replace function public.tiny_create_home() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home  uuid;
  v_key   text := tinyagents.secret();
  v_token text := tinyagents.secret();
begin
  -- abandoned offices go away on their own
  delete from tinyagents.homes where last_view < now() - interval '60 days';
  -- this is a free shared database: keep strangers from filling it
  if (select count(*) from tinyagents.homes where created_at > now() - interval '1 hour') >= 10
     or (select count(*) from tinyagents.homes) >= 100 then
    raise exception 'too many offices right now, try again later' using errcode = '53400';
  end if;
  insert into tinyagents.homes (ingest_key) values (v_key) returning id into v_home;
  insert into tinyagents.devices (token_hash, home_id) values (tinyagents.hash(v_token), v_home);
  return jsonb_build_object('ingestKey', v_key, 'token', v_token);
end;
$$;

-- The computers' key again, for setting up another computer from a paired device.
create or replace function public.tiny_install_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.home_for(p_token);
begin
  if v_home is null then
    raise exception 'not paired' using errcode = '28000';
  end if;
  return (select jsonb_build_object('ingestKey', h.ingest_key) from tinyagents.homes h where h.id = v_home);
end;
$$;

-- A short code (10 minutes) that lets another device join this office.
create or replace function public.tiny_pair_start(p_token text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.home_for(p_token);
  v_code text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_home is null then
    raise exception 'not paired' using errcode = '28000';
  end if;
  delete from tinyagents.pairings where expires_at < now();
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from tinyagents.pairings where code = v_code);
  end loop;
  insert into tinyagents.pairings (code, home_id, expires_at) values (v_code, v_home, now() + interval '10 minutes');
  return v_code;
end;
$$;

-- Redeems a pairing code: returns a new device token for this device.
create or replace function public.tiny_pair_claim(p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home  uuid;
  v_token text := tinyagents.secret();
begin
  delete from tinyagents.pairings
   where code = upper(btrim(coalesce(p_code, ''))) and expires_at > now()
  returning home_id into v_home;
  if v_home is null then
    raise exception 'unknown or expired code' using errcode = '28000';
  end if;
  insert into tinyagents.devices (token_hash, home_id) values (tinyagents.hash(v_token), v_home);
  return v_token;
end;
$$;

-- Forgets this device (its token stops working).
create or replace function public.tiny_forget_device(p_token text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from tinyagents.devices where token_hash = tinyagents.hash(p_token);
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Stats and careers                                                                                 */
/* ------------------------------------------------------------------------------------------------ */

-- Today and up to 14 earlier days (in the viewer's time zone, p_tz_offset minutes east of UTC), plus careers.
create or replace function public.tiny_stats(p_token text, p_tz_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home  uuid := tinyagents.must_home(p_token);
  v_off   interval := make_interval(mins => greatest(-840, least(840, coalesce(p_tz_offset, 0))));
  v_today date := ((now() at time zone 'utc') + v_off)::date;
  v_days  jsonb;
begin
  with b as (
    select ((h.hour at time zone 'utc') + v_off)::date as day, h.machine, h.project, h.sessions, h.prompts,
           h.tool_calls, h.errors, h.turns, h.longest_min, h.tools
      from tinyagents.stat_hours h
     where h.home_id = v_home and h.hour > now() - interval '16 days'
  ), d as (
    select b.day, sum(b.sessions)::int as sessions, sum(b.prompts)::int as prompts, sum(b.tool_calls)::int as tool_calls,
           sum(b.errors)::int as errors, sum(b.turns)::int as turns, max(b.longest_min)::int as longest_min
      from b where b.day between v_today - 14 and v_today
     group by b.day
  ), t as (
    select x.day, jsonb_object_agg(x.tool, x.n) as tools
      from (select b.day, e.key as tool, sum(e.value::int) as n
              from b cross join lateral jsonb_each_text(b.tools) e group by b.day, e.key) x
     group by x.day
  ), bz as (
    select distinct on (y.day) y.day, y.machine, y.project, y.n
      from (select b.day, b.machine, b.project, sum(b.tool_calls)::int as n from b group by b.day, b.machine, b.project) y
     where y.n > 0
     order by y.day, y.n desc
  ), f as (
    select ((sf.hour at time zone 'utc') + v_off)::date as day, count(distinct sf.file_hash)::int as files
      from tinyagents.stat_files sf
     where sf.home_id = v_home and sf.hour > now() - interval '16 days'
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'day', d.day, 'sessions', d.sessions, 'prompts', d.prompts, 'toolCalls', d.tool_calls,
           'files', coalesce(f.files, 0), 'errors', d.errors, 'turns', d.turns, 'longestMin', d.longest_min,
           'tools', coalesce(t.tools, '{}'::jsonb),
           'busiest', case when bz.day is not null then jsonb_build_object('machine', bz.machine, 'project', bz.project, 'toolCalls', bz.n) end
         )) order by d.day desc), '[]'::jsonb)
    into v_days
    from d
    left join t on t.day = d.day
    left join bz on bz.day = d.day
    left join f on f.day = d.day;

  return jsonb_build_object(
    'today', coalesce(
      (select e from jsonb_array_elements(v_days) e where e ->> 'day' = v_today::text),
      jsonb_build_object('day', v_today, 'sessions', 0, 'prompts', 0, 'toolCalls', 0, 'files', 0, 'errors', 0,
                         'turns', 0, 'longestMin', 0, 'tools', '{}'::jsonb)),
    'history', coalesce((select jsonb_agg(e order by e ->> 'day' desc) from jsonb_array_elements(v_days) e
                          where e ->> 'day' < v_today::text), '[]'::jsonb),
    'lifetimeTurns', coalesce((select sum(c.turns) from tinyagents.careers c where c.home_id = v_home), 0),
    'careers', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'machine', c.machine, 'project', c.project, 'daysWorked', c.days_worked, 'sessions', c.sessions,
               'prompts', c.prompts, 'toolCalls', c.tool_calls, 'turns', c.turns,
               'topTool', (select e.key from jsonb_each_text(c.tools) e order by e.value::int desc limit 1),
               'firstSeen', c.first_seen, 'lastSeen', c.last_seen)) order by c.last_seen desc)
        from (select * from tinyagents.careers x where x.home_id = v_home order by x.last_seen desc limit 50) c
    ), '[]'::jsonb)
  );
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Day replay                                                                                        */
/* ------------------------------------------------------------------------------------------------ */

-- State changes since p_since (at most 2 days back), oldest first. Each agent still around at p_since also
-- gets its last earlier change first, so a replay starts from the right state.
create or replace function public.tiny_history(p_token text, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home  uuid := tinyagents.must_home(p_token);
  v_since timestamptz := greatest(coalesce(p_since, now()), now() - interval '2 days');
begin
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'at', h.at, 'id', h.agent_id, 'kind', h.kind, 'type', h.agent_type, 'parent', h.parent,
             'machine', h.machine, 'project', h.project, 'state', h.state, 'tool', h.tool, 'detail', h.detail)) order by h.id)
      from (
        select base.* from (
          select distinct on (x.agent_id) x.* from tinyagents.history x
           where x.home_id = v_home and x.at < v_since and x.at > now() - interval '2 days'
           order by x.agent_id, x.id desc
        ) base
         where base.state <> 'ended'
        union all
        (select y.* from tinyagents.history y where y.home_id = v_home and y.at >= v_since order by y.id limit 8000)
      ) h
  ), '[]'::jsonb);
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Visitor links: a read-only view of who is busy, nothing else                                     */
/* ------------------------------------------------------------------------------------------------ */

-- The office's visitor token, created on first use. Anyone with the link sees states only.
create or replace function public.tiny_visitor_link(p_token text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home  uuid := tinyagents.must_home(p_token);
  v_token text;
begin
  update tinyagents.homes set visitor_token = coalesce(visitor_token, tinyagents.secret())
   where id = v_home returning visitor_token into v_token;
  return v_token;
end;
$$;

create or replace function public.tiny_visitor_revoke(p_token text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  update tinyagents.homes set visitor_token = null where id = v_home;
end;
$$;

-- Ids are hashed; no tool, detail, title, description, project, machine, model, counters or chat.
create or replace function public.tiny_visitor_snapshot(p_visitor text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home uuid := (select h.id from tinyagents.homes h where h.visitor_token = p_visitor);
begin
  if v_home is null then
    raise exception 'unknown visitor link' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', left(tinyagents.hash('v:' || s.id), 16),
             'kind', s.kind,
             'type', s.agent_type,
             'parent', case when s.parent is not null then left(tinyagents.hash('v:' || s.parent), 16) end,
             'project', '',
             'state', e.state,
             'busy', e.state in ('thinking', 'tool', 'compacting'),
             'waiting', e.state = 'permission'
           )) order by s.kind, s.id)
      from tinyagents.sessions s
      cross join lateral (select case when s.state = 'tool' and s.since < now() - interval '10 minutes'
                                      then 'thinking' else s.state end as state) e
     where s.home_id = v_home and s.last_at > now() - interval '6 hours'
  ), '[]'::jsonb);
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Business park neighbours: removed (the homes.public_on / public_name columns stay, unused)        */
/* ------------------------------------------------------------------------------------------------ */

drop function if exists public.tiny_set_public(text, boolean, text);
drop function if exists public.tiny_public_info(text);
drop function if exists public.tiny_neighbours(text);

/* ------------------------------------------------------------------------------------------------ */
/* Web push                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

-- Stores this device's push subscription (PushSubscription.toJSON()).
create or replace function public.tiny_push_subscribe(p_token text, p_sub jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home     uuid := tinyagents.must_home(p_token);
  v_endpoint text := p_sub ->> 'endpoint';
  v_p256dh   text := p_sub -> 'keys' ->> 'p256dh';
  v_auth     text := p_sub -> 'keys' ->> 'auth';
begin
  if coalesce(v_endpoint, '') !~ '^https://' or length(v_endpoint) > 1000
     or coalesce(v_p256dh, '') = '' or length(v_p256dh) > 200 or coalesce(v_auth, '') = '' or length(v_auth) > 100 then
    raise exception 'not a push subscription' using errcode = '22023';
  end if;
  if (select count(*) from tinyagents.push_subs p where p.home_id = v_home and p.endpoint <> v_endpoint) >= 20 then
    raise exception 'too many devices with alerts on' using errcode = '53400';
  end if;
  insert into tinyagents.push_subs (endpoint, home_id, token_hash, p256dh, auth)
  values (v_endpoint, v_home, tinyagents.hash(p_token), v_p256dh, v_auth)
  on conflict (endpoint) do update
     set home_id = excluded.home_id, token_hash = excluded.token_hash, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create or replace function public.tiny_push_unsubscribe(p_token text, p_endpoint text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  delete from tinyagents.push_subs where home_id = v_home and endpoint = p_endpoint;
end;
$$;

-- Called by the tiny-push Edge Function with the shared secret: forgets subscriptions the push service rejected.
create or replace function public.tiny_push_gone(p_secret text, p_endpoints text[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(p_secret, '') = '' or p_secret is distinct from (select c.value from tinyagents.config c where c.key = 'push_secret') then
    raise exception 'bad secret' using errcode = '28000';
  end if;
  delete from tinyagents.push_subs where endpoint = any(p_endpoints);
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Away mode: approve permission requests from a paired device (opt-in, off by default)             */
/* ------------------------------------------------------------------------------------------------ */

create or replace function public.tiny_away_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  return (select jsonb_build_object('away', h.away) from tinyagents.homes h where h.id = v_home);
end;
$$;

-- Turning it off drops the waiting requests: their computers show the normal prompt within seconds.
create or replace function public.tiny_set_away(p_token text, p_on boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  update tinyagents.homes set away = coalesce(p_on, false) where id = v_home;
  if not coalesce(p_on, false) then
    delete from tinyagents.approvals where home_id = v_home;
  end if;
end;
$$;

create or replace function public.tiny_pending_approvals(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', a.id, 'agentId', a.agent_id, 'tool', a.tool, 'detail', a.detail, 'at', a.created_at)) order by a.created_at)
      from tinyagents.approvals a
      join tinyagents.homes h on h.id = a.home_id and h.away
     where a.home_id = v_home and a.decision is null and a.expires_at > now()
  ), '[]'::jsonb);
end;
$$;

-- A device's answer. Device token only: the computer key can never approve.
create or replace function public.tiny_decide(p_token text, p_request uuid, p_allow boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  update tinyagents.approvals a
     set decision = case when coalesce(p_allow, false) then 'allow' else 'deny' end, decided_at = now()
   where a.id = p_request and a.home_id = v_home and a.decision is null and a.expires_at > now()
     and exists (select 1 from tinyagents.homes h where h.id = v_home and h.away);
  if not found then
    raise exception 'this request expired or was already answered' using errcode = '22023';
  end if;
end;
$$;

-- The approvals hook on a computer (header x-tiny-key). With p_request null it registers p_event (the
-- PermissionRequest hook input); then it polls with the returned id. States: off (away mode is off: show
-- the normal prompt), pending, allow, deny, expired. A decision is handed out once, then deleted.
create or replace function public.tiny_approval_wait(p_request uuid, p_event jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  hdrs   jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_home uuid;
  v_away boolean;
  v_tool text := p_event ->> 'tool_name';
  v_id   uuid;
  v_dec  text;
begin
  select h.id, h.away into v_home, v_away from tinyagents.homes h where h.ingest_key = coalesce(hdrs ->> 'x-tiny-key', '');
  if v_home is null then
    raise exception 'unknown key' using errcode = '28000';
  end if;
  if not v_away then
    return jsonb_build_object('state', 'off');
  end if;
  if p_request is null then
    if p_event ->> 'session_id' is null then
      raise exception 'missing event' using errcode = '22023';
    end if;
    if (select count(*) from tinyagents.approvals a where a.home_id = v_home and a.expires_at > now()) >= 50 then
      raise exception 'too many waiting requests' using errcode = '53400';
    end if;
    insert into tinyagents.approvals (home_id, agent_id, tool, detail)
    values (v_home,
            left(p_event ->> 'session_id', 100) || coalesce(':' || left(p_event ->> 'agent_id', 100), ''),
            coalesce(tinyagents.tool_label(v_tool), 'a tool'),
            -- the approver should see what they approve: the command itself, kept only until answered
            case when v_tool in ('Bash', 'PowerShell') then left(nullif(btrim(p_event -> 'tool_input' ->> 'command'), ''), 300)
                 else tinyagents.tool_detail(v_tool, p_event -> 'tool_input') end)
    returning id into v_id;
    return jsonb_build_object('state', 'pending', 'id', v_id);
  end if;
  delete from tinyagents.approvals a
   where a.id = p_request and a.home_id = v_home and (a.decision is not null or a.expires_at <= now())
  returning coalesce(a.decision, 'expired') into v_dec;
  if v_dec is not null then
    return jsonb_build_object('state', v_dec);
  end if;
  if exists (select 1 from tinyagents.approvals a where a.id = p_request and a.home_id = v_home) then
    return jsonb_build_object('state', 'pending', 'id', p_request);
  end if;
  return jsonb_build_object('state', 'expired');
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Customized people: the same names and looks on every device of the office                       */
/* ------------------------------------------------------------------------------------------------ */

-- Every saved person of the office, as { slot: person }.
create or replace function public.tiny_people(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  return coalesce((select jsonb_object_agg(p.slot, p.person) from tinyagents.people p where p.home_id = v_home), '{}'::jsonb);
end;
$$;

-- Saves one person (at most 4 KB, name trimmed to 24 characters, 500 people per office).
create or replace function public.tiny_save_person(p_token text, p_slot text, p_person jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home   uuid := tinyagents.must_home(p_token);
  v_person jsonb := p_person;
begin
  if coalesce(length(p_slot), 0) not between 1 and 120 or jsonb_typeof(v_person) is distinct from 'object'
     or octet_length(v_person::text) > 4096 then
    raise exception 'not a person' using errcode = '22023';
  end if;
  if jsonb_typeof(v_person -> 'name') = 'string' then
    v_person := jsonb_set(v_person, '{name}', to_jsonb(left(btrim(v_person ->> 'name'), 24)));
  end if;
  if not exists (select 1 from tinyagents.people p where p.home_id = v_home and p.slot = p_slot)
     and (select count(*) from tinyagents.people p where p.home_id = v_home) >= 500 then
    raise exception 'too many people saved in this office' using errcode = '53400';
  end if;
  insert into tinyagents.people (home_id, slot, person) values (v_home, p_slot, v_person)
  on conflict (home_id, slot) do update set person = excluded.person, updated_at = now();
end;
$$;

create or replace function public.tiny_forget_person(p_token text, p_slot text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  delete from tinyagents.people where home_id = v_home and slot = p_slot;
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Custom names: team and room names, the same on every device of the office                         */
/* ------------------------------------------------------------------------------------------------ */

-- Every custom name of the office, as { key: name }.
create or replace function public.tiny_labels(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  return coalesce((select jsonb_object_agg(l.key, l.name) from tinyagents.labels l where l.home_id = v_home), '{}'::jsonb);
end;
$$;

-- Saves one name (key up to 120 characters, name trimmed to 40, 300 names per office).
create or replace function public.tiny_save_label(p_token text, p_key text, p_name text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
  v_name text := left(btrim(coalesce(p_name, '')), 40);
begin
  if coalesce(length(p_key), 0) not between 1 and 120 or length(v_name) = 0 then
    raise exception 'not a name' using errcode = '22023';
  end if;
  if not exists (select 1 from tinyagents.labels l where l.home_id = v_home and l.key = p_key)
     and (select count(*) from tinyagents.labels l where l.home_id = v_home) >= 300 then
    raise exception 'too many names saved in this office' using errcode = '53400';
  end if;
  insert into tinyagents.labels (home_id, key, name) values (v_home, p_key, v_name)
  on conflict (home_id, key) do update set name = excluded.name, updated_at = now();
end;
$$;

create or replace function public.tiny_forget_label(p_token text, p_key text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.must_home(p_token);
begin
  delete from tinyagents.labels where home_id = v_home and key = p_key;
end;
$$;

-- Only these are callable over the API.
revoke all on function public.tiny_ingest(jsonb) from public;
revoke all on function public.tiny_snapshot(text) from public;
revoke all on function public.tiny_messages(text, text, bigint) from public;
revoke all on function public.tiny_create_home() from public;
revoke all on function public.tiny_install_info(text) from public;
revoke all on function public.tiny_pair_start(text) from public;
revoke all on function public.tiny_pair_claim(text) from public;
revoke all on function public.tiny_forget_device(text) from public;
grant execute on function public.tiny_ingest(jsonb) to anon, authenticated;
grant execute on function public.tiny_snapshot(text) to anon, authenticated;
grant execute on function public.tiny_messages(text, text, bigint) to anon, authenticated;
grant execute on function public.tiny_create_home() to anon, authenticated;
grant execute on function public.tiny_install_info(text) to anon, authenticated;
grant execute on function public.tiny_pair_start(text) to anon, authenticated;
grant execute on function public.tiny_pair_claim(text) to anon, authenticated;
grant execute on function public.tiny_forget_device(text) to anon, authenticated;
revoke all on function public.tiny_stats(text, int) from public;
revoke all on function public.tiny_history(text, timestamptz) from public;
revoke all on function public.tiny_visitor_link(text) from public;
revoke all on function public.tiny_visitor_revoke(text) from public;
revoke all on function public.tiny_visitor_snapshot(text) from public;
revoke all on function public.tiny_push_subscribe(text, jsonb) from public;
revoke all on function public.tiny_push_unsubscribe(text, text) from public;
revoke all on function public.tiny_push_gone(text, text[]) from public;
revoke all on function public.tiny_away_info(text) from public;
revoke all on function public.tiny_set_away(text, boolean) from public;
revoke all on function public.tiny_pending_approvals(text) from public;
revoke all on function public.tiny_decide(text, uuid, boolean) from public;
revoke all on function public.tiny_approval_wait(uuid, jsonb) from public;
grant execute on function public.tiny_stats(text, int) to anon, authenticated;
grant execute on function public.tiny_history(text, timestamptz) to anon, authenticated;
grant execute on function public.tiny_visitor_link(text) to anon, authenticated;
grant execute on function public.tiny_visitor_revoke(text) to anon, authenticated;
grant execute on function public.tiny_visitor_snapshot(text) to anon, authenticated;
grant execute on function public.tiny_push_subscribe(text, jsonb) to anon, authenticated;
grant execute on function public.tiny_push_unsubscribe(text, text) to anon, authenticated;
grant execute on function public.tiny_push_gone(text, text[]) to anon, authenticated;
grant execute on function public.tiny_away_info(text) to anon, authenticated;
grant execute on function public.tiny_set_away(text, boolean) to anon, authenticated;
grant execute on function public.tiny_pending_approvals(text) to anon, authenticated;
grant execute on function public.tiny_decide(text, uuid, boolean) to anon, authenticated;
grant execute on function public.tiny_approval_wait(uuid, jsonb) to anon, authenticated;
revoke all on function public.tiny_people(text) from public;
revoke all on function public.tiny_save_person(text, text, jsonb) from public;
revoke all on function public.tiny_forget_person(text, text) from public;
grant execute on function public.tiny_people(text) to anon, authenticated;
grant execute on function public.tiny_save_person(text, text, jsonb) to anon, authenticated;
grant execute on function public.tiny_forget_person(text, text) to anon, authenticated;
revoke all on function public.tiny_labels(text) from public;
revoke all on function public.tiny_save_label(text, text, text) from public;
revoke all on function public.tiny_forget_label(text, text) from public;
grant execute on function public.tiny_labels(text) to anon, authenticated;
grant execute on function public.tiny_save_label(text, text, text) to anon, authenticated;
grant execute on function public.tiny_forget_label(text, text) to anon, authenticated;
-- internal helpers added above stay unreachable
revoke all on all functions in schema tinyagents from public, anon, authenticated;

-- Let the API see the new functions right away.
notify pgrst, 'reload schema';
