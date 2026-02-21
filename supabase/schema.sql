-- NEXO Database Schema
-- Run this in the Supabase SQL Editor

-- Users (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  created_at timestamptz default now(),
  last_refresh_at timestamptz,
  total_refreshes int default 0
);

-- Conversations
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  is_active boolean default true
);

-- Messages
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now(),
  included_in_refresh boolean default false
);

-- Canonical Issues (the emergent taxonomy — NO predefined categories)
create table public.canonical_issues (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  created_at timestamptz default now(),
  merged_into_id uuid references public.canonical_issues(id),
  is_active boolean default true
);

-- User Issues (a user's position on a specific issue)
create table public.user_issues (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  canonical_issue_id uuid references public.canonical_issues(id) not null,
  stance text not null,
  intensity float not null check (intensity >= 0 and intensity <= 1),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  quotes jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, canonical_issue_id)
);

-- User Connections (how a user links two issues)
create table public.user_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  issue_a_id uuid references public.canonical_issues(id) not null,
  issue_b_id uuid references public.canonical_issues(id) not null,
  connection_type text not null check (connection_type in ('co_occurrence', 'causal')),
  evidence text,
  weight float default 1.0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Constellation Snapshots (for animation scrubber — stored now, used later)
create table public.constellation_snapshots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  snapshot_data jsonb not null,
  created_at timestamptz default now()
);

-- Aggregate Issues (collective intelligence layer)
create table public.aggregate_issues (
  canonical_issue_id uuid references public.canonical_issues(id) on delete cascade primary key,
  total_users int default 0,
  energy_score float default 0,
  stance_histogram jsonb default '{}'::jsonb,
  momentum float default 0,
  consensus_score float default 0,
  updated_at timestamptz default now()
);

-- Aggregate Connections (collective graph edges)
create table public.aggregate_connections (
  id uuid default gen_random_uuid() primary key,
  issue_a_id uuid references public.canonical_issues(id) not null,
  issue_b_id uuid references public.canonical_issues(id) not null,
  total_weight float default 0,
  user_count int default 0,
  updated_at timestamptz default now(),
  unique(issue_a_id, issue_b_id)
);

-- Reflection Prompts
create table public.reflection_prompts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  prompt_text text not null,
  created_at timestamptz default now()
);

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_issues enable row level security;
alter table public.user_connections enable row level security;
alter table public.constellation_snapshots enable row level security;
alter table public.reflection_prompts enable row level security;
alter table public.aggregate_issues enable row level security;
alter table public.aggregate_connections enable row level security;
alter table public.canonical_issues enable row level security;

-- Users can read/write their own data
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users read own conversations" on public.conversations for select using (auth.uid() = user_id);
create policy "Users insert own conversations" on public.conversations for insert with check (auth.uid() = user_id);
create policy "Users read own messages" on public.messages for select using (
  conversation_id in (select id from public.conversations where user_id = auth.uid())
);
create policy "Users insert own messages" on public.messages for insert with check (
  conversation_id in (select id from public.conversations where user_id = auth.uid())
);
create policy "Users read own issues" on public.user_issues for select using (auth.uid() = user_id);
create policy "Users read own connections" on public.user_connections for select using (auth.uid() = user_id);
create policy "Users read own snapshots" on public.constellation_snapshots for select using (auth.uid() = user_id);
create policy "Users read own prompts" on public.reflection_prompts for select using (auth.uid() = user_id);

-- Everyone can read aggregate data
create policy "Anyone reads aggregate issues" on public.aggregate_issues for select using (true);
create policy "Anyone reads aggregate connections" on public.aggregate_connections for select using (true);
-- Anyone can read canonical issues
create policy "Anyone reads canonical issues" on public.canonical_issues for select using (true);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create indexes for performance
create index idx_messages_conversation on public.messages(conversation_id);
create index idx_messages_not_refreshed on public.messages(conversation_id) where included_in_refresh = false;
create index idx_user_issues_user on public.user_issues(user_id);
create index idx_user_connections_user on public.user_connections(user_id);
create index idx_aggregate_issues_energy on public.aggregate_issues(energy_score desc);
