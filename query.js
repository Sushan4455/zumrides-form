import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://qgkcfckupnsqnltjlmwq.supabase.co', 'sb_publishable_ZfVrgJCYUtI9vXOWH285qQ_FKHdxiTz');

async function run() {
  const { data, error } = await supabase.from('tasks').select('*').order('id', { ascending: false }).limit(20);
  console.log("Error:", error);
  console.log("Data:", JSON.stringify(data, null, 2));
}
run();
