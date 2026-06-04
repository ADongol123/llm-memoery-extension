create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  content_type text not null check (content_type in ('text', 'code', 'table')),
  raw_content text not null,
  processed_content text not null,
  chunk_index int not null,
  embedding vector(1024),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks (conversation_id);
