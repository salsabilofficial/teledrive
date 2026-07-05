import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oqtoridtcvkdikrvxuhj.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xdG9yaWR0Y3ZrZGlrcnZ4dWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTE5MTMsImV4cCI6MjA5ODcyNzkxM30.5l0Xew6zV5GTdy7axjGmGB1s-TLRdL_uRhX01ugnlXU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
