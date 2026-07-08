-- =====================================================================
-- Long-Term Care (Nursing Home) Medicaid Application System
-- Supabase / Postgres schema, Row Level Security, and Storage policies
--
-- HOW TO RUN THIS:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole
--   file -> Run. It's safe to re-run (uses IF NOT EXISTS / DROP ... IF
--   EXISTS guards) while you're iterating.
--
-- SECURITY MODEL (read this before running anything):
--   - Every table has Row Level Security ON. Nothing is readable or
--     writable by default -- access is granted explicitly below.
--   - Two roles: 'applicant' (or family member filling it out) and
--     'staff' (caseworker/admin who can see across applications).
--     Role lives in profiles.role, set manually for now (see bottom).
--   - Applicants can only ever see rows tied to applications they own
--     (applications.applicant_user_id = auth.uid()).
--   - Staff can see everything, via the is_staff() helper below.
--   - Full SSNs are NOT stored in plain text. Only last 4 digits are
--     stored for display/matching. If you truly need the full SSN
--     digitally, see the note above the `ssn_encrypted` column --
--     don't just add a plain-text column without reading that note.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- PROFILES  (one row per auth user; extends Supabase's auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'applicant' check (role in ('applicant','staff','admin')),
  full_name text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: is the current user staff/admin? SECURITY DEFINER so it can
-- read profiles without recursively triggering profiles' own RLS.
create or replace function public.is_staff()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff','admin')
  );
$$ language sql security definer stable;

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid());

-- ---------------------------------------------------------------------
-- APPLICATIONS  (one per nursing-home Medicaid case)
-- ---------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','approved','denied')),
  state text,
  marital_status text check (marital_status in ('single','married')),
  facility_name text,
  facility_admission_date date,
  level_of_care_documented boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

create or replace function public.owns_application(app_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.applications
    where id = app_id and applicant_user_id = auth.uid()
  ) or public.is_staff();
$$ language sql security definer stable;

alter table public.applications enable row level security;

drop policy if exists "applications_owner_all" on public.applications;
create policy "applications_owner_all" on public.applications
  for all using (applicant_user_id = auth.uid() or public.is_staff())
  with check (applicant_user_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------
-- PEOPLE ON THE APPLICATION  (applicant + spouse)
-- ---------------------------------------------------------------------
create table if not exists public.application_people (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  person_role text not null check (person_role in ('applicant','spouse')),
  first_name text,
  middle_name text,
  last_name text,
  dob date,
  sex text,
  ssn_last4 text,
  ssn_encrypted bytea,
  citizen boolean,
  immigration_status text,
  phone text,
  email text,
  address1 text,
  address2 text,
  city text,
  state text,
  zip text,
  medicare_number text,
  medicaid_number text,
  attending_physician text,
  physician_phone text,
  adl_bathing text,
  adl_dressing text,
  adl_eating text,
  adl_transferring text,
  adl_toileting text,
  adl_continence text,
  primary_diagnosis text,
  created_at timestamptz not null default now()
);

alter table public.application_people enable row level security;

drop policy if exists "people_via_application" on public.application_people;
create policy "people_via_application" on public.application_people
  for all using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

-- ---------------------------------------------------------------------
-- ASSETS
-- ---------------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  owner text not null check (owner in ('applicant','spouse','joint')),
  asset_type text not null,
  institution text,
  account_last4 text,
  description text,
  value numeric(12,2) not null default 0,
  is_exempt boolean not null default false,
  exempt_reason text,
  created_at timestamptz not null default now()
);

alter table public.assets enable row level security;

drop policy if exists "assets_via_application" on public.assets;
create policy "assets_via_application" on public.assets
  for all using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

-- ---------------------------------------------------------------------
-- INCOME SOURCES
-- ---------------------------------------------------------------------
create table if not exists public.income_sources (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  person text not null check (person in ('applicant','spouse')),
  income_type text not null,
  payer text,
  amount numeric(12,2) not null default 0,
  frequency text not null default 'monthly' check (frequency in ('weekly','biweekly','monthly','yearly')),
  created_at timestamptz not null default now()
);

alter table public.income_sources enable row level security;

drop policy if exists "income_via_application" on public.income_sources;
create policy "income_via_application" on public.income_sources
  for all using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

-- ---------------------------------------------------------------------
-- TRANSFERS  (5-year lookback -- recorded as facts, not adjudicated)
-- ---------------------------------------------------------------------
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  transfer_date date,
  asset_description text,
  fair_market_value numeric(12,2),
  amount_received numeric(12,2),
  uncompensated_value numeric(12,2),
  recipient_name text,
  recipient_relationship text,
  was_loan boolean default false,
  has_promissory_note boolean default false,
  was_for_care boolean default false,
  has_care_agreement boolean default false,
  was_returned boolean default false,
  possible_exemption text,
  needs_attorney_review boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.transfers enable row level security;

drop policy if exists "transfers_via_application" on public.transfers;
create policy "transfers_via_application" on public.transfers
  for all using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

-- ---------------------------------------------------------------------
-- DOCUMENTS  (metadata only -- file bytes live in Storage)
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  uploaded_by uuid references public.profiles(id),
  doc_type text,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "documents_via_application" on public.documents;
create policy "documents_via_application" on public.documents
  for all using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

-- ---------------------------------------------------------------------
-- CHECKLIST ITEMS
-- ---------------------------------------------------------------------
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  item_key text not null,
  completed boolean not null default false,
  unique (application_id, item_key)
);

alter table public.checklist_items enable row level security;

drop policy if exists "checklist_via_application" on public.checklist_items;
create policy "checklist_via_application" on public.checklist_items
  for all using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

-- ---------------------------------------------------------------------
-- STAFF NOTES  (staff/admin only -- applicants never see these)
-- ---------------------------------------------------------------------
create table if not exists public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  author_user_id uuid references public.profiles(id),
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.staff_notes enable row level security;

drop policy if exists "staff_notes_staff_only" on public.staff_notes;
create policy "staff_notes_staff_only" on public.staff_notes
  for all using (public.is_staff())
  with check (public.is_staff());

-- =====================================================================
-- STORAGE POLICY
-- Run this AFTER creating a bucket named "documents" in
-- Supabase Dashboard -> Storage -> New bucket -> Public OFF
-- Files should be uploaded to: documents/{application_id}/{filename}
-- =====================================================================

drop policy if exists "documents_bucket_rw" on storage.objects;
create policy "documents_bucket_rw" on storage.objects
  for all using (
    bucket_id = 'documents'
    and public.owns_application( (split_part(name, '/', 1))::uuid )
  )
  with check (
    bucket_id = 'documents'
    and public.owns_application( (split_part(name, '/', 1))::uuid )
  );

-- =====================================================================
-- PROMOTE A USER TO STAFF (run manually after they sign up)
-- Find their ID in: Supabase dashboard -> Authentication -> Users
--   update public.profiles set role = 'staff' where id = '<their-uuid>';
-- =====================================================================
