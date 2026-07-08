// ClearCare — Supabase connection
// Get these from: Supabase dashboard -> Project Settings -> API
// The anon/public key is safe to expose here — RLS protects the data.
// Never put the service_role key in this file.

window.APP_CONFIG = {
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-public-key"
};
