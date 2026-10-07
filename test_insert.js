import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://qgkcfckupnsqnltjlmwq.supabase.co', 'sb_publishable_ZfVrgJCYUtI9vXOWH285qQ_FKHdxiTz');

async function run() {
  const { data, error } = await supabase.from('tasks').insert([{
    staff_name: "Station",
    task_type: "Pre-Task Check",
    station_name: "N/A",
    cycle_id: "CYC-TEST-001",
    condition: "good",
    issue: "",
    parts_checked: "F. Brake",
    odometer: ""
  }]).select();
  console.log("Error:", error);
  console.log("Data:", data);
}
run();
