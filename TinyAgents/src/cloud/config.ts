/** The Supabase project that hosts Tiny Agents (shared with the wiki; Tiny Agents lives in its own schema). */
export const SUPABASE_URL = 'https://hchyekrxubzuqrnlckpm.supabase.co';
/** Public anon key: safe to ship. The tiny_* database functions check a device token or computer key themselves. */
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaHlla3J4dWJ6dXFybmxja3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjI3NDIsImV4cCI6MjA5OTgzODc0Mn0.IIfUjrwSEnrAzPuRrCUblli2fJ7dYJssj7jE-526OxE';
/**
 * Web push (phone alerts) public VAPID key, from `npx web-push generate-vapid-keys`. Empty until push is set
 * up; see docs/CLAUDE_INTEGRATION.md → Phone alerts.
 */
export const VAPID_PUBLIC_KEY = '';
