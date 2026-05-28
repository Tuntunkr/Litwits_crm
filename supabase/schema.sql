-- Run this in the Supabase SQL editor (Dashboard → SQL).
-- 1) KV store for CRM documents, users, AR/SR, comments, etc.
create table if not exists public.crm_kv (
  bucket text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (bucket, key)
);

alter table public.crm_kv enable row level security;
-- RLS on + no policies: only service_role / bypass can access (see Supabase docs).

-- 2) Leads (compatible with WhatsApp Netlify function + Sales dashboard)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  phone text,
  message text,
  source text default 'WhatsApp',
  name text,
  status text default 'New Query',
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

-- 3) Bootstrap admin (change email / password, then log in)
insert into public.crm_kv (bucket, key, value)
values (
  'user',
  lower('admin@litwits.local'),
  jsonb_build_object(
    'name', 'Admin',
    'password', 'changeme',
    'role', 'admin',
    'phone', '',
    'assignedMentors', '[]'::jsonb,
    'assignedLitwitsDocs', '[]'::jsonb,
    'validityStart', '',
    'validityEnd', '',
    'status', 'active',
    'packageSessions', 0,
    'sessionType', '',
    'packagePlan', 'numeric',
    'attendedSessions', 0,
    'srCount', 0,
    'manualAdjustment', 0,
    'lastModified', 0
  )
)
on conflict (bucket, key) do nothing;
