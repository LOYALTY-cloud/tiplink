import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const id = process.env.TEST_CREATOR_ID;

if (!url || !key) {
  console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

if (!id) {
  console.error('TEST_CREATOR_ID is not set');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', id).maybeSingle();
  if (error) {
    console.error('Error querying profiles:', error);
    process.exit(1);
  }
  if (!data) {
    console.log('No profile found for id', id);
  } else {
    console.log('Profile found:');
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
