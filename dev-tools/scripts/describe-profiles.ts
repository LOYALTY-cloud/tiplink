import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  try {
    const { data, error } = await supabase.from('information_schema.columns').select('column_name,data_type,is_nullable').eq('table_name','profiles');
    if (error) {
      console.error('Query failed:', error.message || error);
      process.exit(1);
    }
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error describing profiles:', e);
    process.exit(1);
  }
}

run();
