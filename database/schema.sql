-- WBW starter schema for Supabase / PostgreSQL.
-- Private folders and documents are owner-only. Public share reads should go through
-- a server endpoint or carefully reviewed RPC; do not grant anonymous table access.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '작가' check (char_length(nickname) between 1 and 40),
  preferences jsonb not null default '{"theme":"mono","font":"Pretendard"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint folders_parent_owner_fk foreign key (parent_id, owner_id)
    references public.folders(id, owner_id) on delete cascade,
  constraint folders_id_owner_unique unique (id, owner_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid,
  title text not null default '제목 없음' check (char_length(title) between 1 and 300),
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  layout jsonb not null default '{"page":"A4","margin":24,"font":"Pretendard","size":16,"spacing":0,"line":1.9}'::jsonb,
  visibility text not null default 'private' check (visibility in ('private','link','password')),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_folder_owner_fk foreign key (folder_id, owner_id)
    references public.folders(id, owner_id) on delete set null (folder_id)
);

create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  access_type text not null check (access_type in ('link','password')),
  password_hash text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint document_shares_password_check check (
    (access_type = 'password' and password_hash is not null) or
    (access_type = 'link' and password_hash is null)
  )
);

create index if not exists folders_owner_parent_idx on public.folders(owner_id, parent_id, sort_order);
create index if not exists documents_owner_folder_updated_idx on public.documents(owner_id, folder_id, updated_at desc);
create index if not exists shares_document_active_idx on public.document_shares(document_id, expires_at) where revoked_at is null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists folders_updated_at on public.folders;
create trigger folders_updated_at before update on public.folders
for each row execute function public.set_updated_at();
drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at before update on public.documents
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

drop policy if exists "profile owner access" on public.profiles;
create policy "profile owner access" on public.profiles
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists "folder owner access" on public.folders;
create policy "folder owner access" on public.folders
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "document owner access" on public.documents;
create policy "document owner access" on public.documents
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "share owner access" on public.document_shares;
create policy "share owner access" on public.document_shares
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Add public reads only after implementing token hashing, password verification,
-- throttling, expiry/revocation, and a dedicated public read RPC/API.
