-- A way back in for an admin who has forgotten their password.
--
-- Whoever controls this database runs, in the Supabase SQL editor:
--     select medicapp_new_recovery_code();
-- and gets a code that is valid for one hour and works once, on the sign-in
-- screen under "Forgot password?". Only its hash is stored.

create or replace function public.medicapp_new_recovery_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  raw text := replace(gen_random_uuid()::text, '-', '');
  code text := substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4) || '-' || substr(raw, 13, 4);
begin
  insert into app_settings (key, value)
    values ('recovery_code_hash', encode(sha256(convert_to(code, 'UTF8')), 'hex'))
    on conflict (key) do update set value = excluded.value;
  insert into app_settings (key, value)
    values ('recovery_code_expires', to_char((now() at time zone 'utc') + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    on conflict (key) do update set value = excluded.value;
  return code;
end $$;

-- Not callable through Supabase's public API: only from the SQL editor.
revoke all on function public.medicapp_new_recovery_code() from public, anon, authenticated;
