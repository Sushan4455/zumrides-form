const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('tasks').select('*').eq('task_type', 'Pre-Task Check').order('created_at', { ascending: false }).limit(3);
  console.log(data);
}
run();
