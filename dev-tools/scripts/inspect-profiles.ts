import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('profiles').select('*').limit(1).maybeSingle();
  if (error) {
    console.error('Error querying profiles:', error.message || error);
    process.exit(1);
  }
  if (!data) {
    console.log('No profiles rows found');
    return;
  }
  console.log('Sample profile columns:', Object.keys(data));
  console.log(JSON.stringify(data, null, 2));
}

run();
