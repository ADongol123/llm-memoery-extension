-- LLM Memory — Initial Schema
-- Run: supabase db push

-- Enable pgvector for semantic search
create extension if not exists vector;

-- ── Selector Registry ────────────────────────────────────────────────────────
-- Stores CSS selectors per LLM platform. Updated server-side so all extension
-- installs get fixes instantly without a new release.

create table selector_registry (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null unique,
  version     int  not null default 1,
  selectors   jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Public read, no auth required (selectors are not sensitive)
alter table selector_registry enable row level security;
create policy "anyone can read selectors"
  on selector_registry for select using (true);

-- ── Users (extends Supabase auth.users) ──────────────────────────────────────

create table user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan         text not null default 'free',  -- 'free' | 'pro'
  created_at   timestamptz not null default now()
);

alter table user_profiles enable row level security;
create policy "users read own profile"
  on user_profiles for select using (auth.uid() = id);
create policy "users update own profile"
  on user_profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Workspaces ────────────────────────────────────────────────────────────────

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text not null default '',
  color       text not null default '#6366f1',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table workspaces enable row level security;
create policy "users manage own workspaces"
  on workspaces for all using (auth.uid() = user_id);

-- ── Conversations ─────────────────────────────────────────────────────────────

create table conversations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  workspace_id  uuid references workspaces(id) on delete set null,

  platform      text not null,
  source_url    text not null default '',
  title         text not null,
  message_count int  not null default 0,
  raw_messages  jsonb not null default '[]',

  -- AI-processed (null until Edge Function runs)
  summary        text,
  key_points     text[],
  open_questions text[],
  topics         text[],
  entities       jsonb,
  processed_at   timestamptz,

  is_auto_save  bool not null default false,
  is_snippet    bool not null default false,
  pinned        bool not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table conversations enable row level security;
-- Authenticated users see their own; anonymous rows have null user_id and are device-local only
create policy "users manage own conversations"
  on conversations for all using (
    auth.uid() = user_id or user_id is null
  );

-- Index for fast per-user queries
create index conversations_user_id_updated_at
  on conversations(user_id, updated_at desc);

create index conversations_platform
  on conversations(user_id, platform);

-- ── Conversation Embeddings ───────────────────────────────────────────────────
-- Separate table (pgvector best practice — keeps conversations table light)

create table conversation_embeddings (
  conversation_id  uuid primary key references conversations(id) on delete cascade,
  embedding        vector(1024)  -- Voyage AI voyage-3-lite dimensions
);

-- HNSW index for fast approximate nearest-neighbor search
create index conversation_embeddings_hnsw
  on conversation_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ── Context Packages ──────────────────────────────────────────────────────────

create table context_packages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  name            text not null,
  description     text not null default '',
  document        text not null,         -- formatted text for injection
  document_json   jsonb not null,        -- structured version
  shareable_slug  text unique,
  is_public       bool not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table context_packages enable row level security;
create policy "users manage own packages"
  on context_packages for all using (auth.uid() = user_id);
create policy "anyone can read public packages"
  on context_packages for select using (is_public = true);

-- ── Package ↔ Conversation join ───────────────────────────────────────────────

create table package_conversations (
  package_id       uuid not null references context_packages(id) on delete cascade,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  weight           text not null default 'primary',  -- 'primary' | 'supporting'
  primary key (package_id, conversation_id)
);

alter table package_conversations enable row level security;
create policy "users manage own package_conversations"
  on package_conversations for all
  using (
    exists (
      select 1 from context_packages p
      where p.id = package_id and p.user_id = auth.uid()
    )
  );

-- ── Injection Log ─────────────────────────────────────────────────────────────

create table injection_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  package_id       uuid references context_packages(id) on delete set null,
  conversation_id  uuid references conversations(id) on delete set null,
  target_platform  text not null,
  target_url       text not null default '',
  inject_mode      text not null default 'full',
  injected_at      timestamptz not null default now()
);

alter table injection_log enable row level security;
create policy "users read own injection log"
  on injection_log for all using (auth.uid() = user_id);

create index injection_log_user_id on injection_log(user_id, injected_at desc);

-- ── Analytics (lightweight, per-user) ────────────────────────────────────────

create table analytics (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  conversations_saved    int not null default 0,
  packages_generated     int not null default 0,
  injections_done        int not null default 0,
  updated_at             timestamptz not null default now()
);

alter table analytics enable row level security;
create policy "users read own analytics"
  on analytics for all using (auth.uid() = user_id);

-- ── Helper: bump analytics ─────────────────────────────────────────────────────

create function bump_analytics(
  p_user_id uuid,
  p_field   text
) returns void language plpgsql security definer as $$
begin
  insert into analytics (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  execute format(
    'update analytics set %I = %I + 1, updated_at = now() where user_id = $1',
    p_field, p_field
  ) using p_user_id;
end;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enable Realtime on conversations and context_packages so the extension gets
-- live updates when AI processing completes.

alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table context_packages;
