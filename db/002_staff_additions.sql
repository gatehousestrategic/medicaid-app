-- =====================================================================
-- ClearCare — Migration 002: Staff portal additions
-- Run in Supabase SQL Editor after 001_schema.sql
-- =====================================================================

-- Add notify_applicant flag to staff_notes
alter table public.staff_notes
  add column if not exists notify_applicant boolean not null default false,
  add column if not exists shared_with_applicant boolean not null default false;

-- Document uploads — allow staff uploads too
-- (the existing documents table already supports this via uploaded_by)
-- Just need to make sure the storage policy allows staff uploads

-- Drop and recreate storage policy to allow staff uploads to any application
drop policy if exists "documents_bucket_rw" on storage.objects;
create policy "documents_bucket_rw" on storage.objects
  for all using (
    bucket_id = 'documents'
    and (
      public.owns_application( (split_part(name, '/', 1))::uuid )
      or public.is_staff()
    )
  )
  with check (
    bucket_id = 'documents'
    and (
      public.owns_application( (split_part(name, '/', 1))::uuid )
      or public.is_staff()
    )
  );

-- Staff can update any application (status changes etc.)
drop policy if exists "applications_staff_update" on public.applications;
create policy "applications_staff_update" on public.applications
  for update using (public.is_staff())
  with check (public.is_staff());

-- Staff can update any application_people row
drop policy if exists "people_staff_update" on public.application_people;
create policy "people_staff_update" on public.application_people
  for update using (public.is_staff())
  with check (public.is_staff());

-- Staff can update assets
drop policy if exists "assets_staff_update" on public.assets;
create policy "assets_staff_update" on public.assets
  for update using (public.is_staff())
  with check (public.is_staff());

-- Staff can update income
drop policy if exists "income_staff_update" on public.income_sources;
create policy "income_staff_update" on public.income_sources
  for update using (public.is_staff())
  with check (public.is_staff());

-- Staff can update transfers
drop policy if exists "transfers_staff_update" on public.transfers;
create policy "transfers_staff_update" on public.transfers
  for update using (public.is_staff())
  with check (public.is_staff());

-- =====================================================================
-- NOTIFY-APPLICANT Edge Function
-- After running this SQL, create the Edge Function in Supabase:
--   Dashboard -> Edge Functions -> New function -> name: notify-applicant
--   Paste the code from: staff/edge-functions/notify-applicant.ts
-- Then enable the database webhook:
--   Dashboard -> Database -> Webhooks -> Create webhook
--     Table: staff_notes
--     Events: INSERT
--     URL: https://<your-project-ref>.supabase.co/functions/v1/notify-applicant
-- =====================================================================

-- =====================================================================
-- Firm settings (staff configure once, auto-populates cover letters)
-- =====================================================================
create table if not exists public.firm_settings (
  id uuid primary key default gen_random_uuid(),
  firm_name text,
  firm_address text,
  firm_city_state_zip text,
  firm_phone text,
  firm_email text,
  firm_website text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.firm_settings enable row level security;

-- Only staff can read or write firm settings
drop policy if exists "firm_settings_staff" on public.firm_settings;
create policy "firm_settings_staff" on public.firm_settings
  for all using (public.is_staff())
  with check (public.is_staff());

-- Insert a default empty row
insert into public.firm_settings (firm_name) values ('') on conflict do nothing;
