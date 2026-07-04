import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oqtoridtcvkdikrvxuhj.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''; // Fill this with your Anon Public Key

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
