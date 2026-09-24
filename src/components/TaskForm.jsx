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

const SwapTimer = ({ startTime, isFinished }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime || isFinished) return;
    const updateElapsed = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startTime, isFinished]);

  if (!startTime) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const isReady = mins >= 20;

  return (
    <div className={`text-center font-bold text-lg mt-3 ${isFinished ? 'text-gray-400' : isReady ? 'text-green-600' : 'text-orange-500'}`}>
      {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
      {!isFinished && !isReady && <div className="text-xs font-normal">Wait 20 mins</div>}
      {!isFinished && isReady && <div className="text-xs font-normal">Ready for OUT</div>}
      {isFinished && <div className="text-xs font-normal">Swap Finished</div>}
    </div>
  );
};
export default function TaskForm({ taskType, staffName, onBack }) {
  const [cycles, setCycles] = useState([{ id: Date.now(), cycleId: '', batteryId: '', inVoltage: '', inPercentage: '', inTime: null, inTimestamp: null, outVoltage: '', outPercentage: '', outTime: null, condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // For Pre-Task
  const [eligibleCycles, setEligibleCycles] = useState([]);
  const [assignedCycles, setAssignedCycles] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // For Maintenance - known issues lookup
  const [cycleIssues, setCycleIssues] = useState({});
  const [knownIssueAlert, setKnownIssueAlert] = useState('');

  useEffect(() => {
    if (taskType === 'battery_swap') {
      const saved = localStorage.getItem('zum_battery_swap_draft');
      if (saved) {
        try {
          setCycles(JSON.parse(saved));
          return;
        } catch(e) {}
      }
      setCycles([{ id: Date.now(), cycleId: '', batteryId: '', inVoltage: '', inPercentage: '', inTime: null, inTimestamp: null, outVoltage: '', outPercentage: '', outTime: null, condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
    } else {
      setCycles([{ id: Date.now(), cycleId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
    }
  }, [taskType]);

  useEffect(() => {
    if (taskType === 'battery_swap') {
      localStorage.setItem('zum_battery_swap_draft', JSON.stringify(cycles));
    }
  }, [cycles, taskType]);

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

          // Fetch all cycles interacted with during the current shift
          const { data: allData } = await supabase
            .from('tasks')
            .select('*')
            .gte('created_at', start)
            .lt('created_at', end);

          if (allData) {
            const unique = {};
            if (taskType === 'pretask') {
               // For pre-task: Show cycles touched by OTHER staff
               const filtered = allData.filter(c => c.staff_name !== staffName);
               filtered.forEach(c => unique[c.cycle_id] = c);
            } else if (taskType === 'routine') {
               // For routine: Show cycles touched by THIS staff via Pre-Task
               const filtered = allData.filter(c => c.staff_name === staffName && (c.task_type === 'Pre-Task Check' || c.task_type === 'pretask'));
               filtered.forEach(c => unique[c.cycle_id] = c);
            }
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
    setCycles([...cycles, { id: Date.now(), cycleId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
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

  const handleSelectAllParts = (id) => {
    setCycles(cycles.map(c => {
      if (c.id === id) {
        if (c.partsChecked.length === PARTS_LIST.length) {
          return { ...c, partsChecked: [] }; // deselect all
        } else {
          return { ...c, partsChecked: PARTS_LIST.map(p => p.name) }; // select all
        }
      }
      return c;
    }));
  };

  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  const handleRecordOutAndSave = async (cycleId) => {
    const outTimeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
    const c = cycles.find(cyc => cyc.id === cycleId);
    
    if (!c.cycleId || !c.batteryId) {
       setSaveError("Please enter Cycle ID and Battery ID before recording OUT.");
       return;
    }
    if (!c.inTime || !c.inTimestamp) {
       setSaveError("Please Record IN time first.");
       return;
    }
    
    const elapsedMins = (Date.now() - c.inTimestamp) / 1000 / 60;
    if (elapsedMins < 20) {
       setSaveError("You must wait at least 20 minutes before recording OUT.");
       return;
    }
    
    updateCycle(cycleId, 'outTime', outTimeStr);
    setIsSubmitting(true);
    setSaveError('');
    setSaveMsg('');
    try {
      const batterySwapsToInsert = [{
          staff_name: staffName,
          cycle_id: c.cycleId.trim(),
          battery_id: c.batteryId.trim(),
          in_voltage: c.inVoltage || null,
          in_percentage: c.inPercentage || null,
          in_time: c.inTime,
          out_voltage: c.outVoltage || null,
          out_percentage: c.outPercentage || null,
          out_time: outTimeStr
      }];
      const url = 'https://script.google.com/macros/s/AKfycbydh5t8duV6t8MItonvFJ2nxYtSjyE-PApwKdf-PTaB52NNgtymi-7S4kNf29ao22oF/exec';
      const payload = { batterySwaps: batterySwapsToInsert };
      
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setSaveMsg('✅ Battery Swap Saved!');
      setTimeout(() => {
        setCycles([{ id: Date.now(), cycleId: c.cycleId, batteryId: '', inVoltage: '', inPercentage: '', inTime: null, inTimestamp: null, outVoltage: '', outPercentage: '', outTime: null, condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
        setSaveMsg('');
      }, 2000);
      
    } catch(err) {
      setSaveError(err.message);
    }
    setIsSubmitting(false);
  };

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

    // Pre-process cycles to auto-flag missing parts as issues
    const processedCycles = cycles.map(c => {
      if (taskType !== 'maintenance' && c.condition === 'good') {
        const unchecked = PARTS_LIST.filter(p => !c.partsChecked.includes(p.name)).map(p => p.name);
        if (unchecked.length > 0) {
          return { ...c, condition: 'issue', issue: `Unchecked Parts: ${unchecked.join(', ')}` };
        }
      }
      return c;
    });

    const tasksToInsert = [];
    const maintToInsert = [];
    const batterySwapsToInsert = [];

    processedCycles.forEach(c => {
      if (taskType === 'battery_swap') {
        if (c.cycleId && c.batteryId && c.outTime) {
          batterySwapsToInsert.push({
            staff_name: staffName,
            cycle_id: c.cycleId.trim(),
            battery_id: c.batteryId.trim(),
            in_voltage: c.inVoltage || null,
            in_percentage: c.inPercentage || null,
            in_time: c.inTime,
            out_voltage: c.outVoltage || null,
            out_percentage: c.outPercentage || null,
            out_time: c.outTime
          });
        }
      } else if (taskType === 'maintenance') {
        if (c.cycleId && c.fixDescription) {
          maintToInsert.push({
            cycle_id: c.cycleId.trim(),
            fix_description: c.fixDescription.trim(),
            staff_name: staffName,
            status: c.status || 'Repaired'
          });
        }
      } else {
        if (c.cycleId) {
          tasksToInsert.push({
            staff_name: staffName,
            task_type: niceTaskName,
            station_name: stationName,
            cycle_id: c.cycleId.trim(),
            condition: c.condition,
            issue: (c.condition === 'issue' ? c.issue : ''),
            parts_checked: c.partsChecked.join(', '),
            odometer: c.odometer ? c.odometer.trim() : ''
          });
        }
      }
    });

    if (tasksToInsert.length === 0 && maintToInsert.length === 0 && batterySwapsToInsert.length === 0) {
      setSaveError('Please fill out the required fields!');
      setIsSubmitting(false);
      return;
    }

    // Build Google Sheets-compatible records for backup
    const timestamp = new Date().toLocaleString();
    const sheetsRecords = processedCycles.map(c => ({
      timestamp,
      staffName,
      taskType: niceTaskName,
      stationName,
      cycleId: c.cycleId ? c.cycleId.trim() : '',
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
      if (batterySwapsToInsert.length > 0) {
        const { error } = await supabase.from('battery_swaps').insert(batterySwapsToInsert);
        if (error) throw error;
      }

      // Step 2: Show success immediately — don't wait for Sheets
      setSaveMsg('✅ Saved successfully!');
      setCycles([{ id: Date.now(), cycleId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
      setTimeout(() => onBack(), 1200);

      // Step 3: Send to Google Sheets silently in background (fire and forget)
      const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';
      const MAINTENANCE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbydh5t8duV6t8MItonvFJ2nxYtSjyE-PApwKdf-PTaB52NNgtymi-7S4kNf29ao22oF/exec';
      
      const targetUrl = taskType === 'maintenance' ? MAINTENANCE_SCRIPT_URL : SCRIPT_URL;
      const formData = new FormData();
      
      // For maintenance tasks, we need to explicitly set the sheetTarget to 'repaired' to work with the updated Apps Script
      const payloadRecords = sheetsRecords.map(r => ({
        ...r,
        sheetTarget: taskType === 'maintenance' ? 'repaired' : undefined
      }));
      formData.append('data', JSON.stringify(payloadRecords));
      
      fetch(targetUrl, { method: 'POST', mode: 'no-cors', body: formData }).catch(() => {});

      // Step 4: If this was a checkup task and we found broken cycles, ALSO send them to the Issue sheet!
      if (taskType !== 'maintenance') {
        const brokenCycles = sheetsRecords.filter(r => r.condition === 'issue').map(r => ({
          ...r,
          sheetTarget: 'issues',
          reportedIssue: r.issue,
          status: 'Pending'
        }));

        if (brokenCycles.length > 0) {
          const issueFormData = new FormData();
          issueFormData.append('data', JSON.stringify(brokenCycles));
          fetch(MAINTENANCE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: issueFormData }).catch(() => {});
        }
      }

    } catch (err) {
      console.error(err);
      setSaveError('Error: ' + err.message);
    }


    setIsSubmitting(false);
  };

  const renderPartsChecked = (cycle) => {
    const allSelected = cycle.partsChecked.length === PARTS_LIST.length;
    return (
      <div className="mb-4">
        <div className="flex justify-between items-end mb-3">
          <label className="block text-sm font-semibold text-gray-700">Parts Checked</label>
          <button 
            type="button" 
            onClick={() => handleSelectAllParts(cycle.id)} 
            className="text-xs text-blue-700 hover:text-white hover:bg-blue-600 font-semibold bg-blue-50 border border-blue-200 px-4 py-1.5 rounded-md transition-all shadow-sm active:scale-95"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PARTS_LIST.map(p => {
            const isChecked = cycle.partsChecked.includes(p.name);
            return (
              <label 
                key={p.name} 
                className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-all duration-200 border ${
                  isChecked ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900' : 'border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <input 
                  type="checkbox" 
                  className="rounded text-gray-900 focus:ring-gray-900 w-4 h-4 cursor-pointer"
                  checked={isChecked}
                  onChange={() => togglePart(cycle.id, p.name)}
                />
                <div className="flex items-center gap-2 flex-1">
                  <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: p.color }}></span>
                  <span className={`text-sm ${isChecked ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {p.name}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      <div className="mb-6">
        <h2 className="text-2xl  text-gray-900 capitalize">{taskType} Form</h2>
        <p className="text-gray-500  mt-1">Staff: {staffName || 'Not Selected'}</p>
      </div>

      <div className="w-full h-px bg-gray-900 mb-6"></div>

      {cycles.map((cycle, index) => (
        <div key={cycle.id} className="mb-6 bg-transparent relative">
          {taskType !== 'battery_swap' && (
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-gray-900">
                {cycles.length > 1 ? `Cycle #${index + 1}` : ''}
              </span>
              {index > 0 && (
                <button type="button" onClick={() => removeCycle(cycle.id)} className="text-red-500 text-sm">
                  Remove
                </button>
              )}
            </div>
          )}

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
                  <option value="Repaired">Repaired</option>
                  <option value="Pending Parts">Pending Parts</option>
                  <option value="In Progress">In Progress</option>
                </select>
              </div>
            </>
          ) : taskType === 'battery_swap' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-500 mb-1">Cycle ID</label>
                <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. CYC-100" value={cycle.cycleId} onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)} />
              </div>
              <div className="mb-4">
                <label className="block text-sm text-gray-500 mb-1">Battery ID</label>
                <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. BAT-25" value={cycle.batteryId || ''} onChange={e => updateCycle(cycle.id, 'batteryId', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">IN Voltage</label>
                  <input type="number" step="0.1" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 52.5" value={cycle.inVoltage || ''} onChange={e => updateCycle(cycle.id, 'inVoltage', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">IN Percentage</label>
                  <input type="number" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 20" value={cycle.inPercentage || ''} onChange={e => updateCycle(cycle.id, 'inPercentage', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">OUT Voltage</label>
                  <input type="number" step="0.1" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 58.2" value={cycle.outVoltage || ''} onChange={e => updateCycle(cycle.id, 'outVoltage', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">OUT Percentage</label>
                  <input type="number" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 100" value={cycle.outPercentage || ''} onChange={e => updateCycle(cycle.id, 'outPercentage', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">IN Time</label>
                  <button type="button" onClick={() => {
                    updateCycle(cycle.id, 'inTime', new Date().toLocaleTimeString('en-US', { hour12: false }));
                    updateCycle(cycle.id, 'inTimestamp', Date.now());
                  }} className={`w-full p-4 rounded-xl font-semibold border-none transition active:scale-[0.98] ${cycle.inTime ? 'bg-gray-100 text-gray-900' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                    {cycle.inTime || 'Record IN'}
                  </button>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">OUT Time (Saves automatically)</label>
                  <button type="button" disabled={isSubmitting} onClick={() => handleRecordOutAndSave(cycle.id)} className={`w-full p-4 rounded-xl font-semibold border-none transition active:scale-[0.98] ${cycle.outTime ? 'bg-gray-100 text-gray-900' : 'bg-green-50 text-green-600 hover:bg-green-100'} disabled:opacity-50`}>
                    {cycle.outTime || (isSubmitting ? 'Saving...' : 'Record OUT & Save')}
                  </button>
                </div>
              </div>
              <SwapTimer startTime={cycle.inTimestamp} isFinished={!!cycle.outTime} />
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm  text-gray-500 mb-1">Cycle ID</label>
                {(taskType === 'pretask' || (taskType === 'routine' && assignedCycles.length > 0)) ? (
                  <select required className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 appearance-none" value={cycle.cycleId} onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)}>
                    <option value="" disabled>Select Cycle...</option>
                    
                    {assignedCycles.length > 0 && (
                      <optgroup label="Assigned to You">
                        {assignedCycles.map((cId, i) => (
                          <option key={`assign-${i}`} value={cId}>{cId}</option>
                        ))}
                      </optgroup>
                    )}

                    {eligibleCycles.length > 0 && (
                      <optgroup label={taskType === 'pretask' ? "From Previous Shifts" : "Your Pre-Task Cycles"}>
                        {eligibleCycles.map((c, i) => (
                          <option key={`elig-${i}`} value={c.cycleId || c.cycle_id}>
                             {c.cycleId || c.cycle_id} {taskType === 'pretask' && `(via ${c.staffName || c.staff_name})`}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                ) : (
                  <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. CYC-100" value={cycle.cycleId} onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)} />
                )}
              </div>
              
              <div className="mb-4">
                <label className="block text-sm text-gray-500 mb-1">Battery ID (Optional)</label>
                <input type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 70" value={cycle.batteryId || ''} onChange={e => updateCycle(cycle.id, 'batteryId', e.target.value)} />
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

      {taskType !== 'maintenance' && taskType !== 'battery_swap' && (
        <button type="button" onClick={addCycle} className="w-full py-2 mb-6 bg-transparent border-none text-gray-500  text-sm flex items-center justify-center gap-1 hover:text-black transition">
          <Plus size={16} /> Add Another Cycle
        </button>
      )}

      <div className="flex justify-end gap-3 mt-8 border-t border-gray-100 pt-6">
        <button type="button" onClick={onBack} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition">
          Back
        </button>
        <button type="button" onClick={() => {
          if (taskType === 'battery_swap') {
            setCycles([{ id: Date.now(), cycleId: '', batteryId: '', inVoltage: '', inPercentage: '', inTime: null, inTimestamp: null, outVoltage: '', outPercentage: '', outTime: null, condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
          } else {
            setCycles([{ id: Date.now(), cycleId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
          }
          setSaveMsg('');
          setSaveError('');
        }} className="px-5 py-2.5 bg-red-50 text-red-600 rounded-full text-sm font-medium hover:bg-red-100 transition">
          Clear
        </button>
        {taskType !== 'battery_swap' && (
          <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-black transition shadow-sm disabled:opacity-50">
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        )}
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
