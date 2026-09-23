const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qgkcfckupnsqnltjlmwq.supabase.co';
const supabaseKey = 'sb_publishable_ZfVrgJCYUtI9vXOWH285qQ_FKHdxiTz';
const supabase = createClient(supabaseUrl, supabaseKey);

const records = [
  { task_type: 'Routine Checkup', cycle_id: '89',  condition: 'good', staff_name: 'Kabir' },
  { task_type: 'Routine Checkup', cycle_id: '241', condition: 'good', staff_name: 'Kabir' },
  { task_type: 'Routine Checkup', cycle_id: '55',  condition: 'good', staff_name: 'Kabir' },
  { task_type: 'Routine Checkup', cycle_id: '169', condition: 'good', staff_name: 'Kabir' },
  { task_type: 'Routine Checkup', cycle_id: '101', condition: 'good', staff_name: 'Kabir' },
  { task_type: 'Routine Checkup', cycle_id: '237', condition: 'good', staff_name: 'Surya' },
  { task_type: 'Routine Checkup', cycle_id: '131', condition: 'good', staff_name: 'Surya' },
  { task_type: 'Routine Checkup', cycle_id: '15',  condition: 'good', staff_name: 'Surya' },
  { task_type: 'Routine Checkup', cycle_id: '234', condition: 'good', staff_name: 'Surya' },
  { task_type: 'Routine Checkup', cycle_id: '100', condition: 'good', staff_name: 'Surya' },
  { task_type: 'Routine Checkup', cycle_id: '90',  condition: 'good', staff_name: 'Laxman' },
  { task_type: 'Routine Checkup', cycle_id: '33',  condition: 'good', staff_name: 'Laxman' },
  { task_type: 'Routine Checkup', cycle_id: '120', condition: 'good', staff_name: 'Anish' },
  { task_type: 'Routine Checkup', cycle_id: '167', condition: 'good', staff_name: 'Anish' }
];

async function run() {
  const { data, error } = await supabase.from('tasks').insert(records);
  if (error) {
    console.error('Error inserting:', error);
  } else {
    console.log('Successfully inserted', records.length, 'records.');
  }
}

run();
