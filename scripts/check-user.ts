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
  try {
    const res = await (supabase as any).auth.admin.getUserById(id);
    console.log('supabase.auth.admin.getUserById result:');
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error calling admin.getUserById:', err);
    process.exit(1);
  }
}

run();
