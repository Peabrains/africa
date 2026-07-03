'use strict';

/* ============================================================
   SUPABASE CLIENT
   Loaded via CDN in index.html — window.supabase is available
   after the CDN script loads.
   ============================================================ */

const SUPABASE_URL  = 'https://abycrkrfaocttujzhqhq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFieWNya3JmYW9jdHR1anpocWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzE0MjMsImV4cCI6MjA5ODYwNzQyM30.avKzMLh86ncgq7nsKNUvmjcOa2G2Av0OSsZKzfqqlXE';

const SupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:    true,      // keeps login across app restarts
    autoRefreshToken:  true,      // silently refreshes JWT before expiry
    detectSessionInUrl: false,    // not needed for PWA
  },
});

window.SB = SupabaseClient;
