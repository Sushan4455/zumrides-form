const fs = require('fs');

let content = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf8');

const assignState = `
  const [assignStaff, setAssignStaff] = useState('');
  const [assignCycles, setAssignCycles] = useState('');
  const [assignMsg, setAssignMsg] = useState('');
  const [assigning, setAssigning] = useState(false);

  const handleAssign = () => {
    if(!assignStaff || !assignCycles) return alert("Please fill both fields");
    setAssigning(true);
    setAssignMsg("");
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'data': JSON.stringify({
           action: "assign",
           staffName: assignStaff,
           cycles: assignCycles
        })
      })
    }).then(() => {
      setAssignMsg("Successfully assigned cycles!");
      setAssignStaff("");
      setAssignCycles("");
      setTimeout(() => setAssignMsg(""), 3000);
    }).finally(() => {
      setAssigning(false);
    });
  };
`;

const assignUI = `
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
          <h3 className="text-gray-900 mb-6">Assign Cycles to Staff</h3>
          
          <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-2">Staff Member</label>
              <select 
                value={assignStaff} 
                onChange={e => setAssignStaff(e.target.value)}
                className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 appearance-none"
              >
                 <option value="">Select Staff Member</option>
                 <option value="Sushan">Sushan</option>
                 <option value="Sujan">Sujan</option>
              </select>
          </div>

          <div className="mb-6">
              <label className="block text-sm text-gray-500 mb-2">Cycle IDs</label>
              <input 
                type="text"
                placeholder="e.g. 101, 55, 89"
                value={assignCycles}
                onChange={e => setAssignCycles(e.target.value)}
                className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900"
              />
          </div>

          <button disabled={assigning} onClick={handleAssign} className="w-full py-4 mt-2 bg-black text-white rounded-xl shadow-lg hover:bg-gray-800 transition text-lg">
            {assigning ? 'Assigning...' : 'Send Assignments'}
          </button>
          {assignMsg && <p className="text-sm text-green-600 text-center mt-2">{assignMsg}</p>}
        </div>
`;

content = content.replace("const [templates, setTemplates] = useState([]);", assignState + "\n  const [templates, setTemplates] = useState([]);");
content = content.replace('<div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-4">', assignUI + '\n        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-4">');

fs.writeFileSync('src/components/AdminDashboard.jsx', content);
