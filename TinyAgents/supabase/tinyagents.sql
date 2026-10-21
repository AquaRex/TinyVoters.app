-- Tiny Agents: the whole backend, living beside the wiki in the same Supabase project.
-- Run the whole file in the SQL Editor. Re-runnable: it only creates or replaces Tiny Agents' own objects.
--
-- WHAT THIS TOUCHES
--   * schema  tinyagents   (new): homes, devices, pairings, sessions, messages
--   * public functions named tiny_*  (new): the only way in or out
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

alter table tinyagents.homes    enable row level security;
alter table tinyagents.devices  enable row level security;
alter table tinyagents.pairings enable row level security;
alter table tinyagents.sessions enable row level security;
alter table tinyagents.messages enable row level security;
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

  case v_name
    when 'SessionStart' then
      if v_agent is null then
        update tinyagents.sessions
           set agent_type = coalesce(evt ->> 'agent_type', 'main'),
               title = coalesce(left(evt ->> 'session_title', 120), title),
               tool = null, detail = null
         where home_id = v_home and id = v_sid;
        perform tinyagents.put_state(v_home, v_sid, case when evt ->> 'source' = 'compact' then 'thinking' else 'starting' end);
        -- housekeeping: sessions that went silent without a SessionEnd
        delete from tinyagents.sessions where home_id = v_home and last_at < now() - interval '6 hours';
      end if;

    when 'UserPromptSubmit' then
      update tinyagents.sessions set prompts = prompts + 1, error = null, tool = null, detail = null
       where home_id = v_home and id = v_sid;
      perform tinyagents.put_state(v_home, v_sid, 'thinking');
      perform tinyagents.note(v_home, v_sid, 'user', evt ->> 'prompt');

    when 'PreToolUse' then
      v_detail := tinyagents.tool_detail(v_tool, evt -> 'tool_input');
      update tinyagents.sessions set tool = v_label, detail = v_detail, tool_calls = tool_calls + 1
       where home_id = v_home and id = v_id;
      perform tinyagents.put_state(v_home, v_id,
        case when v_tool in ('AskUserQuestion', 'ExitPlanMode') then 'permission' else 'tool' end);
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
        update tinyagents.sessions
           set tool = null, detail = null,
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
      end if;

    when 'StopFailure' then
      update tinyagents.sessions
         set errors = errors + 1, error = left(coalesce(evt ->> 'error', 'unknown'), 60), tool = null, detail = null
       where home_id = v_home and id = v_sid;
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
end;
$$;

/* ------------------------------------------------------------------------------------------------ */
/* Viewing: the office roster and one agent's chat                                                   */
/* ------------------------------------------------------------------------------------------------ */

create or replace function public.tiny_snapshot(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_home uuid := tinyagents.home_for(p_token);
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

-- Let the API see the new functions right away.
notify pgrst, 'reload schema';
