const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf8');

const regex = /source: 'home_cycles'[\s\S]*?\}\)\)[\s\S]*?\]\.sort\(/;
const match = code.match(regex);
if (match) {
  const r = `source: 'home_cycles'\n         })),\n         ...(btests || []).map(b => ({\n           id: b.id,\n           task_type: 'Battery Test',\n           staff_name: b.staff_name,\n           cycle_id: b.battery_id,\n           created_at: b.created_at,\n           fix_description: b.condition + (b.issue ? ' - ' + b.issue : '') + (b.fix_description ? ' - ' + b.fix_description : ''),\n           source: 'battery_tests'\n         }))\n      ].sort(`;
  code = code.replace(regex, r);
  fs.writeFileSync('src/components/AdminDashboard.jsx', code);
  console.log("Success");
} else {
  console.log("Target not found!");
}
