import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  console.log("Checking user...");
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("List users error:", listError);
    return;
  }
  
  const user = users.find(u => u.email === 'ibrahimbinharist@gmail.com');
  if (!user) {
    console.log("User not found in Supabase Auth.");
    return;
  }
  
  console.log("Found user in Auth:", {
    id: user.id,
    email: user.email,
    created_at: user.created_at
  });
  
  const { data: session, error: dbError } = await supabase
    .from('telegram_sessions')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
    
  if (dbError) {
    console.error("DB query error:", dbError);
    return;
  }
  
  if (!session) {
    console.log("No telegram_sessions row found for user ID:", user.id);
  } else {
    console.log("Found telegram_session row:", {
      user_id: session.user_id,
      api_id: session.api_id,
      has_api_hash: !!session.api_hash_encrypted,
      has_session_string: !!session.session_string_encrypted,
      updated_at: session.updated_at
    });
  }
}

check();
