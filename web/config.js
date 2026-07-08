// Supabase connection settings.
// Get these from: Supabase dashboard -> Project Settings -> API
// The anon/public key is SAFE to expose in frontend code.
// Row Level Security (in db/001_schema.sql) protects the data, not secrecy of this key.
// Never put the service_role key here.

window.APP_CONFIG = {
  SUPABASE_URL: "https://wwjdlnbfauaeyvtquotw.supabase.co/",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3amRsbmJmYXVhZXl2dHF1b3R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NzIwMDQsImV4cCI6MjA5OTA0ODAwNH0.UEwY-uBOPDNy76ca75vPu0r5qgYPSwxiF-hrGyYxI-4"
};
