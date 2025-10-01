import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase environment variables (SUPABASE_URL or SUPABASE_ANON_KEY).");
}

export const supabase = createClient(supabaseUrl, supabaseKey);