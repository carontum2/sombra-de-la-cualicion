create table if not exists public.users (
  id bigint generated always as identity primary key,
  minecraft_uuid text not null unique,
  minecraft_name text not null,
  password_hash text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wikis (
  id bigint generated always as identity primary key,
  title text not null,
  description text not null,
  content text not null,
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wiki_comments (
  id bigint generated always as identity primary key,
  wiki_id bigint not null references public.wikis(id) on delete cascade,
  author text not null,
  content text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'users_set_updated_at'
  ) then
    create trigger users_set_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();
  end if;
end $$;
