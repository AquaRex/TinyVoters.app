-- Removes Tiny Agents from the Supabase project it used to share with the wiki. Tiny Agents now runs on its own hub
-- (hub/README.md), so none of this is used any more. Run the whole file once in the SQL Editor.
-- It only drops Tiny Agents' own objects: the tinyagents schema (all its tables and helpers) and the public tiny_*
-- functions. The wiki's tables, policies and functions are not touched.
-- If the tiny-push Edge Function was ever deployed, delete it too: Edge Functions → tiny-push → Delete.

drop function if exists public.tiny_ingest(jsonb);
drop function if exists public.tiny_snapshot(text);
drop function if exists public.tiny_messages(text, text, bigint);
drop function if exists public.tiny_create_home();
drop function if exists public.tiny_install_info(text);
drop function if exists public.tiny_pair_start(text);
drop function if exists public.tiny_pair_claim(text);
drop function if exists public.tiny_forget_device(text);
drop function if exists public.tiny_stats(text, int);
drop function if exists public.tiny_history(text, timestamptz);
drop function if exists public.tiny_visitor_link(text);
drop function if exists public.tiny_visitor_revoke(text);
drop function if exists public.tiny_visitor_snapshot(text);
drop function if exists public.tiny_push_subscribe(text, jsonb);
drop function if exists public.tiny_push_unsubscribe(text, text);
drop function if exists public.tiny_push_gone(text, text[]);
drop function if exists public.tiny_away_info(text);
drop function if exists public.tiny_set_away(text, boolean);
drop function if exists public.tiny_pending_approvals(text);
drop function if exists public.tiny_decide(text, uuid, boolean);
drop function if exists public.tiny_approval_wait(uuid, jsonb);
drop function if exists public.tiny_people(text);
drop function if exists public.tiny_save_person(text, text, jsonb);
drop function if exists public.tiny_forget_person(text, text);
drop function if exists public.tiny_labels(text);
drop function if exists public.tiny_save_label(text, text, text);
drop function if exists public.tiny_forget_label(text, text);

drop schema if exists tinyagents cascade;

notify pgrst, 'reload schema';
