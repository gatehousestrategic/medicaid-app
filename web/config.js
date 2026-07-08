// Supabase connection settings.
// Get these from: Supabase dashboard -> Project Settings -> API
// The anon/public key is SAFE to expose in frontend code.
// Row Level Security (in db/001_schema.sql) protects the data, not secrecy of this key.
// Never put the service_role key here.

window.APP_CONFIG = {
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-public-key"
};
