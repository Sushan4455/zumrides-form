import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
  const { data, error } = await supabase.from('schedule_overrides').delete().eq('date_key', '2026-09-28').like('type', 'overall%');
  console.log("Delete res:", { data, error });
}
test();
