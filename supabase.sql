-- Supabase schema + RLS for custom login (no Supabase Auth)
-- Edit as needed.

create extension if not exists pgcrypto;

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamp with time zone default now()
);

alter table public.usuarios enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'usuarios' and policyname = 'usuarios_select'
  ) then
    create policy usuarios_select on public.usuarios
    for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'usuarios' and policyname = 'usuarios_insert'
  ) then
    create policy usuarios_insert on public.usuarios
    for insert with check (true);
  end if;
end $$;
