import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qgkcfckupnsqnltjlmwq.supabase.co';
const supabaseKey = 'sb_publishable_ZfVrgJCYUtI9vXOWH285qQ_FKHdxiTz';
const supabase = createClient(supabaseUrl, supabaseKey);

function getCurrentShiftWindow(date = new Date()) {
  const shiftStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const shiftEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return { start: shiftStart.toISOString(), end: shiftEnd.toISOString() };
}

async function run() {
  const { start, end } = getCurrentShiftWindow();
  console.log("Local Time:", new Date().toString());
  console.log("Start:", start);
  console.log("End:", end);

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true });
    
  if (error) console.error(error);
  else {
    console.log("Count:", data.length);
    const summary = data.reduce((acc, row) => {
       acc[row.staff_name] = (acc[row.staff_name] || 0) + 1;
       return acc;
    }, {});
    console.log("Summary:", summary);
    
    // Check if there are tasks from Anish/Surya and print their created_at
    const anishSurya = data.filter(r => r.staff_name === 'Anish' || r.staff_name === 'Surya');
    if (anishSurya.length > 0) {
       console.log("Anish/Surya entries:", anishSurya.map(r => ({id: r.id, staff: r.staff_name, created_at: r.created_at})));
    }
  }
}

run();
