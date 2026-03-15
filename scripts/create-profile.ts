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
    // Try to fetch auth user to copy email into profile when available
    const userRes = await (supabase as any).auth.admin.getUserById(id);
    const handle = `test_${id!.replace(/-/g, '').slice(0, 8)}`;
    const payload: any = { user_id: id!, handle };

    const { data, error } = await supabase.from('profiles').insert(payload).select().single();
    if (error) {
      console.error('Failed to create profile:', error.message || error);
      process.exit(1);
    }
    console.log('Created profile:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error creating profile:', e);
    process.exit(1);
  }
}

run();
