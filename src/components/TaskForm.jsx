import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getCurrentShiftWindow } from '../utils';

const PARTS_LIST = [
  { name: 'Basket', color: '#f59e0b' },
  { name: 'F. Brake', color: '#ef4444' },
  { name: 'B. Brake', color: '#dc2626' },
  { name: 'F. Air', color: '#3b82f6' },
  { name: 'B. Air', color: '#2563eb' },
  { name: 'F. Puncture', color: '#8b5cf6' },
  { name: 'B. Puncture', color: '#7c3aed' },
  { name: 'Electrical', color: '#eab308' },
  { name: 'Cleaning', color: '#06b6d4' },
  { name: 'Light/Horn', color: '#f97316' },
  { name: 'Pedals/BB', color: '#10b981' },
  { name: 'Data Check', color: '#8b5cf6' }
];

export default function TaskForm({ taskType, staffName, onBack }) {
  const [cycles, setCycles] = useState([{ id: Date.now(), cycleId: '', batteryId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Fixed (Ready to Deploy)' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // For Pre-Task
  const [eligibleCycles, setEligibleCycles] = useState([]);
  const [assignedCycles, setAssignedCycles] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // For Maintenance - known issues lookup
  const [cycleIssues, setCycleIssues] = useState({});
  const [knownIssueAlert, setKnownIssueAlert] = useState('');

  useEffect(() => {
    const fetchDependencies = async () => {
      if (taskType === 'pretask' || taskType === 'routine') {
        setIsSyncing(true);
        const { start, end } = getCurrentShiftWindow();
        
        try {
          // Fetch assignments for routine
          const { data: assignData } = await supabase
            .from('assignments')
            .select('cycles')
            .eq('staff_name', staffName)
            .gte('created_at', start)
            .lt('created_at', end)
            .order('created_at', { ascending: false })
            .limit(1);

          if (assignData && assignData.length > 0) {
            const arr = assignData[0].cycles.split(',').map(c => c.trim()).filter(Boolean);
            setAssignedCycles(arr);
          } else {
            setAssignedCycles([]);
          }

          // Fetch pre-task eligible cycles (other staff routine checks from current shift)
          const { data: pretaskData } = await supabase
            .from('tasks')
            .select('*')
            .in('task_type', ['Routine Checkup', 'routine'])
            .neq('staff_name', staffName)
            .gte('created_at', start)
            .lt('created_at', end);

          if (pretaskData) {
            const unique = {};
            pretaskData.forEach(c => unique[c.cycle_id] = c);
            setEligibleCycles(Object.values(unique));
          }
        } catch (error) {
          console.error("Error fetching assignments:", error);
        }
        setIsSyncing(false);
      }

      // Always fetch known problem cycles for maintenance auto-fill
      if (taskType === 'maintenance') {
        const { data: issuesData } = await supabase
          .from('cycle_issues')
          .select('cycle_id, defect_category, reported_issue');
        if (issuesData) {
          const map = {};
          issuesData.forEach(i => { map[i.cycle_id] = i; });
          setCycleIssues(map);
        }
      }
    };
    
    fetchDependencies();
  }, [taskType, staffName]);

  const addCycle = () => {
    setCycles([...cycles, { id: Date.now(), cycleId: '', batteryId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Fixed (Ready to Deploy)' }]);
  };

  const removeCycle = (id) => {
    setCycles(cycles.filter(c => c.id !== id));
  };

  // Smart updateCycle — auto-fills defect info for maintenance when cycle ID matches a known issue
  const updateCycle = (id, field, value) => {
    setCycles(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      if (field === 'cycleId' && taskType === 'maintenance') {
        const known = cycleIssues[value.trim()];
        if (known) {
          updated.category = known.defect_category;
          // fixDescription is intentionally NOT auto-filled — staff must enter what they actually did
          setKnownIssueAlert(`⚠️ Known issue: ${known.defect_category} — ${known.reported_issue}`);
        } else {
          setKnownIssueAlert('');
        }
      }
      return updated;
    }));
  };

  const togglePart = (id, partName) => {
    setCycles(cycles.map(c => {
      if (c.id === id) {
        const parts = c.partsChecked.includes(partName) 
          ? c.partsChecked.filter(p => p !== partName)
          : [...c.partsChecked, partName];
        return { ...c, partsChecked: parts };
      }
      return c;
    }));
  };

  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSaveMsg('');
    setSaveError('');

    let niceTaskName = '';
    let stationName = 'N/A';
    
    if (taskType === 'pretask') niceTaskName = 'Pre-Task Check';
    if (taskType === 'routine') niceTaskName = 'Routine Checkup';
    if (taskType === 'station') { niceTaskName = 'Station Visit'; stationName = 'Lazimpat'; }
    if (taskType === 'overall') { niceTaskName = 'Overall Checkup'; stationName = 'Dillibazar'; }
    if (taskType === 'maintenance') niceTaskName = 'Maintenance';

    const tasksToInsert = [];
    const maintToInsert = [];

    cycles.forEach(c => {
      if (taskType === 'maintenance') {
        if (c.cycleId && c.fixDescription) {
          maintToInsert.push({
            cycle_id: c.cycleId.trim(),
            fix_description: c.fixDescription.trim(),
            staff_name: staffName,
            status: c.status || 'Fixed (Ready to Deploy)'
          });
        }
      } else {
        if (c.cycleId) {
          tasksToInsert.push({
            staff_name: staffName,
            task_type: niceTaskName,
            station_name: stationName,
            cycle_id: c.cycleId.trim(),
            battery_id: c.batteryId ? c.batteryId.trim() : '',
            condition: c.condition,
            issue: (c.condition === 'issue' ? c.issue : ''),
            parts_checked: c.partsChecked.join(', '),
            odometer: c.odometer ? c.odometer.trim() : ''
          });
        }
      }
    });

    if (tasksToInsert.length === 0 && maintToInsert.length === 0) {
      setSaveError('Please fill out the required fields!');
      setIsSubmitting(false);
      return;
    }

    // Build Google Sheets-compatible records for backup
    const timestamp = new Date().toLocaleString();
    const sheetsRecords = cycles.map(c => ({
      timestamp,
      staffName,
      taskType: niceTaskName,
      stationName,
      cycleId: c.cycleId ? c.cycleId.trim() : '',
      batteryId: c.batteryId ? c.batteryId.trim() : '',
      condition: c.condition || '',
      issue: c.condition === 'issue' ? c.issue : '',
      partsChecked: (c.partsChecked || []).join(', '),
      odometer: c.odometer ? c.odometer.trim() : '',
      fixDescription: c.fixDescription ? c.fixDescription.trim() : '',
      defectCategory: c.category || '',
      status: c.status || ''
    })).filter(r => r.cycleId);

    try {
      // Step 1: Save to Supabase (awaited — must succeed)
      if (tasksToInsert.length > 0) {
        const { error } = await supabase.from('tasks').insert(tasksToInsert);
        if (error) throw error;
      }
      if (maintToInsert.length > 0) {
        const { error } = await supabase.from('maintenance').insert(maintToInsert);
        if (error) throw error;
      }

      // Step 2: Show success immediately — don't wait for Sheets
      setSaveMsg('✅ Saved successfully!');
      setCycles([{ id: Date.now(), cycleId: '', batteryId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Fixed (Ready to Deploy)' }]);
      setTimeout(() => onBack(), 1200);

      // Step 3: Send to Google Sheets silently in background (fire and forget)
      const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';
      const MAINTENANCE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwdjdLFGkiE683shjT3auwewzvEvmLBUmhp6VRydHQj_6oRF6bsocTG_UDT_fLALR7rDw/exec';
      const targetUrl = taskType === 'maintenance' ? MAINTENANCE_SCRIPT_URL : SCRIPT_URL;
      const formData = new FormData();
      formData.append('data', JSON.stringify(sheetsRecords));
      fetch(targetUrl, { method: 'POST', mode: 'no-cors', body: formData }).catch(() => {});

    } catch (err) {
      console.error(err);
      setSaveError('Error: ' + err.message);
    }


    setIsSubmitting(false);
  };

  const renderPartsChecked = (cycle) => (
    <div className="mb-4">
      <label className="block text-sm  text-gray-700 mb-2">Parts Checked</label>
      <div className="grid grid-cols-2 gap-2">
        {PARTS_LIST.map(p => (
          <label key={p.name} className="flex items-center space-x-2 p-2 bg-gray-50 rounded border border-gray-200 cursor-pointer hover:bg-gray-100">
            <input 
              type="checkbox" 
              className="rounded text-black focus:ring-black"
              checked={cycle.partsChecked.includes(p.name)}
              onChange={() => togglePart(cycle.id, p.name)}
            />
            <span className="text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
              {p.name}
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      <div className="mb-6">
        <h2 className="text-2xl  text-gray-900 capitalize">{taskType} Form</h2>
        <p className="text-gray-500  mt-1">Staff: {staffName || 'Not Selected'}</p>
      </div>

      <div className="w-full h-px bg-gray-900 mb-6"></div>

      {cycles.map((cycle, index) => (
        <div key={cycle.id} className="mb-6 bg-transparent relative">
          <div className="flex justify-between items-center mb-2">
            <span className=" text-sm text-gray-900">
              {cycles.length > 1 ? `Cycle #${index + 1}` : ''}
            </span>
            {index > 0 && (
              <button type="button" onClick={() => removeCycle(cycle.id)} className="text-red-500  text-sm">
                Remove
              </button>
            )}
          </div>

          {taskType === 'maintenance' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Broken Cycle ID</label>
                <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 93" value={cycle.cycleId} onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)} />
                {knownIssueAlert && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-800 font-medium">
                    {knownIssueAlert}
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Defect Category / Issue</label>
                <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. E-10 Error" value={cycle.category} onChange={e => updateCycle(cycle.id, 'category', e.target.value)} />
              </div>
              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Repair Action Taken</label>
                <textarea required rows="3" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="Describe fix..." value={cycle.fixDescription} onChange={e => updateCycle(cycle.id, 'fixDescription', e.target.value)} />
              </div>
              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Odometer</label>
                <input type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 1500" value={cycle.odometer} onChange={e => updateCycle(cycle.id, 'odometer', e.target.value)} />
              </div>
              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Status</label>
                <select className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 appearance-none" value={cycle.status} onChange={e => updateCycle(cycle.id, 'status', e.target.value)}>
                  <option value="Fixed (Ready to Deploy)">Fixed (Ready to Deploy)</option>
                  <option value="Pending Parts">Pending Parts</option>
                  <option value="In Progress">In Progress</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Cycle ID</label>
                {taskType === 'pretask' ? (
                  <select required className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 appearance-none" value={cycle.cycleId} onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)}>
                    <option value="" disabled>Select Cycle from Previous Shift...</option>
                    {eligibleCycles.map((c, i) => (
                      <option key={i} value={c.cycle_id}>{c.cycle_id} (via {c.staff_name})</option>
                    ))}
                  </select>
                ) : taskType === 'routine' && assignedCycles.length > 0 ? (
                  <select required className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 appearance-none" value={cycle.cycleId} onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)}>
                    <option value="" disabled>Select Assigned Cycle...</option>
                    {assignedCycles.map((cId, i) => (
                      <option key={i} value={cId}>{cId}</option>
                    ))}
                  </select>
                ) : (
                  <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. CYC-100" value={cycle.cycleId} onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)} />
                )}
              </div>
              
              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Battery ID (Optional)</label>
                <input type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 70" value={cycle.batteryId} onChange={e => updateCycle(cycle.id, 'batteryId', e.target.value)} />
              </div>

              {(taskType === 'overall' || taskType === 'pretask') && renderPartsChecked(cycle)}

              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Condition</label>
                <select className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 appearance-none" value={cycle.condition} onChange={e => updateCycle(cycle.id, 'condition', e.target.value)}>
                  <option value="good">All Good</option>
                  <option value="issue">Has Issue</option>
                </select>
              </div>

              {cycle.condition === 'issue' && (
                <div className="mb-4">
                  <label className="block text-sm  text-gray-500 mb-1">Issue Description</label>
                  <textarea required className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" rows="2" placeholder="Describe the issue..." value={cycle.issue} onChange={e => updateCycle(cycle.id, 'issue', e.target.value)} />
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {taskType !== 'maintenance' && (
        <button type="button" onClick={addCycle} className="w-full py-2 mb-6 bg-transparent border-none text-gray-500  text-sm flex items-center justify-center gap-1 hover:text-black transition">
          <Plus size={16} /> Add Another Cycle
        </button>
      )}

      <div className="flex gap-2 mt-4">
        <button type="button" onClick={onBack} className="w-1/3 py-4 bg-gray-200 text-gray-800 rounded-xl text-sm hover:bg-gray-300 transition">
          Back
        </button>
        <button type="button" onClick={() => {
          setCycles([{ id: Date.now(), cycleId: '', batteryId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Fixed (Ready to Deploy)' }]);
          setSaveMsg('');
          setSaveError('');
        }} className="w-1/3 py-4 bg-red-500 text-white rounded-xl text-sm hover:bg-red-600 transition">
          Clear
        </button>
        <button type="submit" disabled={isSubmitting} className="w-1/3 py-4 bg-gray-900 text-white rounded-xl text-sm hover:bg-black transition disabled:opacity-50">
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>

      {saveMsg && (
        <div className="mt-4 p-4 bg-green-50 border border-green-300 rounded-xl text-green-800 font-semibold text-center text-sm">
          {saveMsg}
        </div>
      )}
      {saveError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-300 rounded-xl text-red-800 font-semibold text-center text-sm">
          {saveError}
        </div>
      )}
    </form>
  );
}
