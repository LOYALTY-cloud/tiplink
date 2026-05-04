import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabaseAdmin
    .from("information_schema.columns")
    .select("column_name,data_type,udt_name,ordinal_position")
    .eq("table_name", "tip_intents")
    .order("ordinal_position", { ascending: true });

  if (error) {
    console.error("QUERY ERROR:", error);
    process.exit(1);
  }

  console.log("tip_intents schema:");
  console.table(
    (data || []).map((r) => ({ column: r.column_name, data_type: r.data_type, udt_name: r.udt_name }))
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
