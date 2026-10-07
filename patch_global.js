const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf8');

const target = `         ...(homes || []).map(h => ({
           id: h.id,
           task_type: 'Home Cycle',
           staff_name: h.manual_name,
           cycle_id: h.home_cycle_id || h.old_battery_id,
           created_at: h.created_at,
           source: 'home_cycles'
         }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));`;

const replacement = `         ...(homes || []).map(h => ({
           id: h.id,
           task_type: 'Home Cycle',
           staff_name: h.manual_name,
           cycle_id: h.home_cycle_id || h.old_battery_id,
           created_at: h.created_at,
           source: 'home_cycles'
         })),
         ...(btests || []).map(b => ({
           id: b.id,
           task_type: 'Battery Test',
           staff_name: b.staff_name,
           cycle_id: b.battery_id,
           created_at: b.created_at,
           fix_description: b.condition + (b.issue ? ' - ' + b.issue : '') + (b.fix_description ? ' - ' + b.fix_description : ''),
           source: 'battery_tests'
         }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/components/AdminDashboard.jsx', code);
  console.log("Success");
} else {
  console.log("Target not found!");
}
