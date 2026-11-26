import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getCurrentShiftWindow, getLocalDateKey, getStoredAssignments, saveStoredAssignments } from '../utils';

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
  { name: 'Data Check', color: '#8b5cf6' },
  { name: 'Sensor', color: '#14b8a6' },
  { name: 'Display', color: '#6366f1' },
  { name: 'Nut', color: '#8b5cf6' },
  { name: 'Chain', color: '#ef4444' }
];

const SwapTimer = ({ startTime, isFinished, onReadyStateChange }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime || isFinished) return;
    const updateElapsed = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startTime, isFinished]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const isReady = mins >= 20;

  useEffect(() => {
    if (onReadyStateChange) {
      onReadyStateChange(isReady);
    }
  }, [isReady, onReadyStateChange]);

  if (!startTime) return null;

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
  const [cycles, setCycles] = useState([{ id: Date.now(), cycleId: '', inBatteryId: '', outBatteryId: '', inPercentage: '', inTime: null, inTimestamp: null, outPercentage: '', outTime: null, condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSwapReady, setIsSwapReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // For Routine Checkup: Checkbox-based workflow
  const [routineItems, setRoutineItems] = useState([]);
  const [extraCycleInput, setExtraCycleInput] = useState('');
  
  // For Pre-Task & Routine Assignments + Blank Paper
  const [eligibleCycles, setEligibleCycles] = useState([]);
  const [assignedCycles, setAssignedCycles] = useState([]);
  const [allRoutineAssignments, setAllRoutineAssignments] = useState(() => {
    return getStoredAssignments(getLocalDateKey());
  });

  // For Maintenance - known issues lookup
  const [cycleIssues, setCycleIssues] = useState({});
  const [knownIssueAlert, setKnownIssueAlert] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(`zum_draft_${taskType}`);
    if (saved) {
      try {
        setCycles(JSON.parse(saved));
        return;
      } catch(e) {}
    }

    if (taskType === 'battery_swap' || taskType === 'home_battery_swap') {
      setCycles([{ id: Date.now(), cycleId: '', inBatteryId: '', outBatteryId: '', inPercentage: '', inTime: null, inTimestamp: null, outPercentage: '', outTime: null, condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
    } else if (taskType === 'home_cycle') {
      setCycles([{ id: Date.now(), manualName: '', homeCycleId: '', batteryId: '', homeTime: '', inVoltage: '', inPercentage: '', outVoltage: '', outPercentage: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
    } else if (taskType === 'battery_test') {
      setCycles([{ id: Date.now(), batteryId: '', actualBatteryPercentage: '', actualVoltage: '', status: 'rest office', startTime: '', endTime: '', beforeBatteryPercentage: '', beforeVoltage: '', odometer: '', notes: '' }]);
    } else {
      setCycles([{ id: Date.now(), cycleId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
    }
  }, [taskType]);

  useEffect(() => {
    localStorage.setItem(`zum_draft_${taskType}`, JSON.stringify(cycles));
  }, [cycles, taskType]);

  useEffect(() => {
    const fetchDependencies = async () => {
      if (taskType === 'pretask' || taskType === 'routine') {
        setIsSyncing(true);
        const { start, end } = getCurrentShiftWindow();
        const todayKey = getLocalDateKey();
        
        try {
          // Strictly query Supabase for TODAY'S shift window first
          let todayAssignments = {};
          let supabaseLoaded = false;

          try {
            const { data: assignData, error: assignErr } = await supabase
              .from('assignments')
              .select('staff_name, cycles, created_at')
              .gte('created_at', start)
              .lt('created_at', end)
              .order('created_at', { ascending: false });

            if (!assignErr && assignData) {
              supabaseLoaded = true;
              assignData.forEach(row => {
                if (row.staff_name && row.cycles && !todayAssignments[row.staff_name]) {
                  todayAssignments[row.staff_name] = row.cycles;
                }
              });
            }
          } catch (sbErr) {
            console.warn("Supabase assignments fetch error:", sbErr);
          }

          // If Supabase loaded, it is authoritative for today. If empty, today has no assignments.
          // Fall back to local storage only if Supabase had a network failure.
          let mergedMap = {};
          if (supabaseLoaded) {
            mergedMap = todayAssignments;
            saveStoredAssignments(mergedMap, todayKey);
          } else {
            mergedMap = getStoredAssignments(todayKey);
          }

          const applyStaffAssignedCycles = (mapObj) => {
            const staffMatch = Object.keys(mapObj).find(
              k => k.trim().toLowerCase() === (staffName || '').trim().toLowerCase()
            );
            const arr = staffMatch
              ? String(mapObj[staffMatch]).split(/[,;\s]+/).map(c => c.trim()).filter(Boolean)
              : [];
            setAssignedCycles(arr);

            // Auto-populate the Routine checklist items exclusively from today's assigned cycles
            if (taskType === 'routine') {
              setRoutineItems(prev => {
                const existingMap = new Map(prev.map(item => [item.cycleId, item]));
                const merged = arr.map(cId => {
                  if (existingMap.has(cId)) return existingMap.get(cId);
                  return {
                    cycleId: cId,
                    checked: true,
                    condition: 'good',
                    issue: ''
                  };
                });
                // Keep any custom extra cycles staff manually added during this session
                prev.filter(p => p.isCustom && !arr.includes(p.cycleId)).forEach(extra => {
                  merged.push(extra);
                });
                return merged;
              });
            }
          };

          setAllRoutineAssignments(mergedMap);
          applyStaffAssignedCycles(mergedMap);

          // Fetch all cycles interacted with during the current shift for suggestions only
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
            const elig = Object.values(unique);
            setEligibleCycles(elig);
          }
        } catch (error) {
          console.error("Error fetching assignments:", error);
        }
        setIsSyncing(false);
      }

      // Always fetch known problem cycles from Fleet Issue and Repair sheet for maintenance auto-fill
      if (taskType === 'maintenance') {
        try {
          const MAINTENANCE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbydh5t8duV6t8MItonvFJ2nxYtSjyE-PApwKdf-PTaB52NNgtymi-7S4kNf29ao22oF/exec';
          const response = await fetch(`${MAINTENANCE_SCRIPT_URL}?action=getPendingIssues`);
          const issuesData = await response.json();
          if (issuesData) {
            const map = {};
            issuesData.forEach(i => { map[i.cycle_id] = i; });
            setCycleIssues(map);
          }
        } catch (error) {
          console.error("Error fetching pending issues from sheet, falling back to Supabase:", error);
          
          const { data: issuesData } = await supabase
            .from('cycle_issues')
            .select('cycle_id, defect_category, reported_issue');
          if (issuesData) {
            const map = {};
            issuesData.forEach(i => { map[i.cycle_id] = i; });
            setCycleIssues(map);
          }
        }
      }
    };
    
    fetchDependencies();
  }, [taskType, staffName]);

  const handleLoadCyclesIntoForm = (cycleStringOrArray) => {
    const list = Array.isArray(cycleStringOrArray)
      ? cycleStringOrArray
      : String(cycleStringOrArray).split(/[,;\s]+/).map(c => c.trim()).filter(Boolean);
    if (list.length === 0) return;

    setCycles(prev => {
      const existingNonEmpty = prev.filter(c => c.cycleId && c.cycleId.trim() !== '');
      const existingIds = new Set(existingNonEmpty.map(c => c.cycleId.trim()));
      const newItems = list
        .filter(cId => !existingIds.has(cId))
        .map((cId, i) => ({
          id: Date.now() + i + Math.random(),
          cycleId: cId,
          condition: 'good',
          issue: '',
          partsChecked: [],
          category: '',
          fixDescription: '',
          odometer: '',
          status: 'Repaired'
        }));
      const combined = [...existingNonEmpty, ...newItems];
      return combined.length > 0 ? combined : prev;
    });
  };

  const addCycle = () => {
    setCycles([...cycles, { id: Date.now(), cycleId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
  };

  const removeCycle = (id) => {
    setCycles(cycles.filter(c => c.id !== id));
  };

  const toggleRoutineCycle = (cycleId) => {
    setRoutineItems(prev => prev.map(item => 
      item.cycleId === cycleId ? { ...item, checked: !item.checked } : item
    ));
  };

  const toggleAllRoutine = (select = true) => {
    setRoutineItems(prev => prev.map(item => ({ ...item, checked: select })));
  };

  const toggleRoutineIssue = (cycleId) => {
    setRoutineItems(prev => prev.map(item => {
      if (item.cycleId !== cycleId) return item;
      const nextCond = item.condition === 'issue' ? 'good' : 'issue';
      return {
        ...item,
        condition: nextCond,
        issue: nextCond === 'good' ? '' : item.issue
      };
    }));
  };

  const setRoutineCondition = (cycleId, cond) => {
    setRoutineItems(prev => prev.map(item => {
      if (item.cycleId !== cycleId) return item;
      return {
        ...item,
        condition: cond,
        issue: cond === 'good' ? '' : item.issue
      };
    }));
  };

  const updateRoutineIssueText = (cycleId, text) => {
    setRoutineItems(prev => prev.map(item => 
      item.cycleId === cycleId ? { ...item, issue: text } : item
    ));
  };

  const handleAddExtraCycle = () => {
    const val = extraCycleInput.trim();
    if (!val) return;
    const ids = val.split(/[,;\s]+/).filter(Boolean);
    setRoutineItems(prev => {
      const existing = new Set(prev.map(p => p.cycleId));
      const toAdd = ids.filter(id => !existing.has(id)).map(id => ({
        cycleId: id,
        checked: true,
        condition: 'good',
        issue: '',
        isCustom: true
      }));
      return [...prev, ...toAdd];
    });
    setExtraCycleInput('');
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
    
    if (!c.cycleId || !c.inBatteryId || !c.outBatteryId) {
       setSaveError("Please enter Cycle ID and IN and OUT Battery IDs before recording OUT.");
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
          in_battery_id: c.inBatteryId ? c.inBatteryId.trim() : null,
          in_percentage: c.inPercentage || null,
          in_time: c.inTime,
          out_battery_id: c.outBatteryId ? c.outBatteryId.trim() : null,
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
        setCycles([{ id: Date.now(), cycleId: c.cycleId, inBatteryId: '', inPercentage: '', inTime: null, inTimestamp: null, outBatteryId: '', outPercentage: '', outTime: null, condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
        setSaveMsg('');
      }, 2000);
      
    } catch(err) {
      setSaveError(err.message);
    }
    setIsSubmitting(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Fast-path for Routine Checkup: Checkbox-based submission without form filling
    if (taskType === 'routine') {
      const selected = routineItems.filter(item => item.checked);
      if (selected.length === 0) {
        setSaveError('Please select at least one assigned cycle to submit!');
        return;
      }

      const missingDesc = selected.find(item => item.condition === 'issue' && !item.issue?.trim());
      if (missingDesc) {
        setSaveError(`Please enter the issue description for Cycle #${missingDesc.cycleId}`);
        return;
      }

      setIsSubmitting(true);
      setSaveMsg('');
      setSaveError('');

      const tasksToInsert = selected.map(item => ({
        staff_name: staffName,
        task_type: 'Routine Checkup',
        station_name: 'N/A',
        cycle_id: item.cycleId.trim(),
        condition: item.condition,
        issue: item.condition === 'issue' ? item.issue.trim() : '',
        parts_checked: '',
        odometer: ''
      }));

      const timestamp = new Date().toLocaleString();
      const sheetsRecords = selected.map(item => ({
        timestamp,
        staffName,
        taskType: 'Routine Checkup',
        stationName: 'N/A',
        cycleId: item.cycleId.trim(),
        condition: item.condition,
        issue: item.condition === 'issue' ? item.issue.trim() : '',
        partsChecked: '',
        odometer: '',
        fixDescription: '',
        defectCategory: '',
        status: ''
      }));

      try {
        const saveToSupabase = async () => {
          try {
            const { error } = await supabase.from('tasks').insert(tasksToInsert);
            if (error) console.error('Supabase tasks err:', error);
          } catch (sbErr) {
            console.error('Supabase exception:', sbErr);
          }
        };
        saveToSupabase();

        setSaveMsg(`✅ ${selected.length} Routine Checkup${selected.length > 1 ? 's' : ''} submitted successfully!`);
        localStorage.removeItem(`zum_routine_items_${staffName}`);
        setTimeout(() => onBack(), 1200);

        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';
        const formData = new FormData();
        formData.append('data', JSON.stringify(sheetsRecords));
        fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formData }).catch(() => {});

        const brokenCycles = sheetsRecords.filter(r => r.condition === 'issue').map(r => ({
          ...r,
          sheetTarget: 'issues',
          defectCategory: 'Routine Issue',
          fixDescription: r.issue
        }));
        if (brokenCycles.length > 0) {
          const MAINTENANCE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbydh5t8duV6t8MItonvFJ2nxYtSjyE-PApwKdf-PTaB52NNgtymi-7S4kNf29ao22oF/exec';
          const issueFormData = new FormData();
          issueFormData.append('data', JSON.stringify(brokenCycles));
          fetch(MAINTENANCE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: issueFormData }).catch(() => {});
        }
      } catch (err) {
        setSaveError('Error submitting: ' + err.message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    setSaveMsg('');
    setSaveError('');

    let niceTaskName = '';
    let stationName = 'N/A';
    
    if (taskType === 'pretask') niceTaskName = 'Pre-Task Check';
    if (taskType === 'routine') niceTaskName = 'Routine Checkup';

    if (taskType === 'overall') { niceTaskName = 'Overall Checkup'; stationName = 'Dillibazar'; }
    if (taskType === 'maintenance') niceTaskName = 'Maintenance';
    if (taskType === 'home_cycle') niceTaskName = 'Home Cycle';
    if (taskType === 'home_battery_swap') niceTaskName = 'Home Battery Swap';
    if (taskType === 'battery_test') niceTaskName = 'Battery Test';

    // Pre-process cycles to auto-flag missing parts as issues
    const processedCycles = cycles.map(c => {
      if ((taskType === 'overall' || taskType === 'pretask') && c.condition === 'good') {
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
    const homeCyclesToInsert = [];
    const batteryTestsToInsert = [];

    processedCycles.forEach(c => {
      if (taskType === 'battery_swap') {
        if (c.cycleId && c.outTime) {
          batterySwapsToInsert.push({
            staff_name: staffName,
            cycle_id: c.cycleId.trim(),
            in_battery_id: c.inBatteryId ? c.inBatteryId.trim() : null,
            in_percentage: c.inPercentage || null,
            in_time: c.inTime,
            out_battery_id: c.outBatteryId ? c.outBatteryId.trim() : null,
            out_percentage: c.outPercentage || null,
            out_time: c.outTime
          });
        }
      } else if (taskType === 'home_battery_swap') {
        if (c.cycleId && (c.inBatteryId || c.outBatteryId)) {
          const currentTimeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
          batterySwapsToInsert.push({
            staff_name: staffName,
            cycle_id: c.cycleId.trim(),
            in_battery_id: c.inBatteryId ? c.inBatteryId.trim() : null,
            in_percentage: c.inPercentage || null,
            in_time: currentTimeStr,
            out_battery_id: c.outBatteryId ? c.outBatteryId.trim() : null,
            out_percentage: c.outPercentage || null,
            out_time: currentTimeStr
          });
        }
      } else if (taskType === 'home_cycle') {
        homeCyclesToInsert.push({
          manual_name: staffName,
          home_cycle_id: c.homeCycleId || ''
        });
      } else if (taskType === 'maintenance') {
        if (c.cycleId && c.fixDescription) {
          maintToInsert.push({
            cycle_id: c.cycleId.trim(),
            fix_description: c.fixDescription.trim(),
            staff_name: staffName,
            status: c.status || 'Repaired'
          });
        }
      } else if (taskType === 'battery_test') {
        if (c.batteryId) {
          batteryTestsToInsert.push({
            staff_name: staffName,
            battery_id: c.batteryId.trim(),
            actual_battery_percentage: c.actualBatteryPercentage ? parseFloat(c.actualBatteryPercentage) : null,
            actual_voltage: c.actualVoltage ? parseFloat(c.actualVoltage) : null,
            status: c.status,
            start_time: c.startTime || null,
            end_time: c.endTime || null,
            before_battery_percentage: c.beforeBatteryPercentage ? parseFloat(c.beforeBatteryPercentage) : null,
            before_voltage: c.beforeVoltage ? parseFloat(c.beforeVoltage) : null,
            odometer: c.odometer ? c.odometer.trim() : null,
            notes: c.notes ? c.notes.trim() : null
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

    if (tasksToInsert.length === 0 && maintToInsert.length === 0 && batterySwapsToInsert.length === 0 && homeCyclesToInsert.length === 0 && batteryTestsToInsert.length === 0) {
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
      // Step 1: Save to Supabase (Best effort, fire and forget)
      const saveToSupabase = async () => {
        try {
          if (tasksToInsert.length > 0) {
            const { error } = await supabase.from('tasks').insert(tasksToInsert);
            if (error) console.error('Supabase tasks err:', error);
          }
          if (maintToInsert.length > 0) {
            const { error } = await supabase.from('maintenance').insert(maintToInsert);
            if (error) console.error('Supabase maint err:', error);
          }
          if (batterySwapsToInsert.length > 0) {
            const { error } = await supabase.from('battery_swaps').insert(batterySwapsToInsert);
            if (error) console.error('Supabase swaps err:', error);
          }
          if (homeCyclesToInsert.length > 0) {
            const { error } = await supabase.from('home_cycles').insert(homeCyclesToInsert);
            if (error) console.error('Supabase home_cycles err:', error);
          }
          if (batteryTestsToInsert.length > 0) {
            const { error } = await supabase.from('battery_tests').insert(batteryTestsToInsert);
            if (error) console.error('Supabase battery_tests err:', error);
          }
        } catch (sbErr) {
          console.error('Supabase exception:', sbErr);
        }

        if (homeCyclesToInsert.length > 0) {
          const MAINTENANCE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbydh5t8duV6t8MItonvFJ2nxYtSjyE-PApwKdf-PTaB52NNgtymi-7S4kNf29ao22oF/exec';
          fetch(MAINTENANCE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ homeCycles: homeCyclesToInsert })
          }).catch(() => {});
        }

        if (batterySwapsToInsert.length > 0) {
          const MAINTENANCE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbydh5t8duV6t8MItonvFJ2nxYtSjyE-PApwKdf-PTaB52NNgtymi-7S4kNf29ao22oF/exec';
          fetch(MAINTENANCE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batterySwaps: batterySwapsToInsert })
          }).catch(() => {});
        }

        if (batteryTestsToInsert.length > 0) {
          // Web App URL from Battery_rested_charging_check_task sheet
          const BATTERY_TEST_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx-YotEtl1_mprMd4smqhHnxV_iBHlegHIvdtvgajVZU1nv290OtaSsKbu76XxSx_Yc4w/exec';
          
          if (BATTERY_TEST_SCRIPT_URL !== 'YOUR_NEW_GOOGLE_APPS_SCRIPT_URL_HERE') {
            fetch(BATTERY_TEST_SCRIPT_URL, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ batteryTests: batteryTestsToInsert })
            }).catch(() => {});
          }
        }
      };

      saveToSupabase(); // Do not await, let it run in background

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
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <label className="block text-sm font-semibold text-gray-700">Parts Checked</label>
            <span className="text-xs text-gray-500">
              {cycle.partsChecked.length} of {PARTS_LIST.length} parts checked
            </span>
          </div>
          <button 
            type="button" 
            onClick={() => handleSelectAllParts(cycle.id)} 
            className="text-xs text-gray-600 hover:text-black font-medium px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
          >
            {allSelected ? 'Clear All' : 'Select All'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          {PARTS_LIST.map(p => {
            const isChecked = cycle.partsChecked.includes(p.name);
            return (
              <label 
                key={p.name} 
                className={`flex items-center gap-3 p-3 sm:p-3.5 rounded-xl cursor-pointer transition select-none min-h-[44px] ${
                  isChecked 
                    ? 'bg-gray-200/90 text-gray-900 font-semibold ring-1 ring-black/10' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/60 hover:text-gray-900'
                }`}
              >
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded text-black focus:ring-black cursor-pointer accent-black shrink-0"
                  checked={isChecked}
                  onChange={() => togglePart(cycle.id, p.name)}
                />
                <span className={`text-sm truncate ${isChecked ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                  {p.name}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const taskTitles = {
    routine: 'Routine',
    pretask: 'Checklist',
    overall: 'Overall',

    maintenance: 'Maintenance',
    battery_swap: 'Standard Battery Swap',
    home_battery_swap: 'Battery Swap',
    home_cycle: 'Home Cycle',
    battery_test: 'Battery Test'
  };
  const displayTitle = taskTitles[taskType] || taskType.replace(/_/g, ' ');

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      <div className="mb-6">
        <h2 className="text-2xl  text-gray-900 capitalize">{displayTitle} Form</h2>
        <p className="text-gray-500  mt-1">Staff: {staffName || 'Not Selected'}</p>
      </div>

      <div className="w-full h-px bg-gray-900 mb-6"></div>

      {taskType === 'routine' ? (
        <div className="mb-6">
          {/* Header & Selection Count */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700">Assigned Cycles</label>
              <span className="text-xs text-gray-500">
                {routineItems.filter(i => i.checked).length} of {routineItems.length} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleAllRoutine(true)}
                className="text-xs text-gray-600 hover:text-black font-medium px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => toggleAllRoutine(false)}
                className="text-xs text-gray-500 hover:text-red-600 font-medium px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Checklist items */}
          {routineItems.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-gray-100 text-gray-500 text-sm mb-4">
              No assigned cycles found yet for {staffName} on this shift.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {routineItems.map((item) => (
                <div
                  key={item.cycleId}
                  className={`p-3.5 sm:p-4 rounded-xl transition-all ${
                    item.checked ? 'bg-gray-100' : 'bg-gray-50 opacity-40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 select-none">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleRoutineCycle(item.cycleId)}
                        className="w-4 h-4 rounded text-black focus:ring-black cursor-pointer accent-black shrink-0"
                      />
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-semibold ${item.checked ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          Cycle #{item.cycleId}
                        </span>
                        {item.isCustom && (
                          <span className="text-[11px] font-medium text-gray-500 bg-gray-200/80 px-2 py-0.5 rounded-md">
                            Added
                          </span>
                        )}
                      </div>
                    </label>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center bg-gray-200/80 p-0.5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setRoutineCondition(item.cycleId, 'good')}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                            item.condition === 'good'
                              ? 'bg-white text-emerald-700 shadow-2xs'
                              : 'text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          ✓ Good
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoutineCondition(item.cycleId, 'issue')}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                            item.condition === 'issue'
                              ? 'bg-red-600 text-white shadow-2xs'
                              : 'text-gray-500 hover:text-red-600'
                          }`}
                        >
                          ⚠ Issue
                        </button>
                      </div>

                      {item.isCustom && (
                        <button
                          type="button"
                          onClick={() => setRoutineItems(prev => prev.filter(p => p.cycleId !== item.cycleId))}
                          className="p-1 text-gray-400 hover:text-red-500 transition"
                          title="Remove cycle"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {item.checked && item.condition === 'issue' && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <label className="block text-xs text-gray-500 mb-1">Issue Description</label>
                      <input
                        type="text"
                        required
                        value={item.issue}
                        onChange={(e) => updateRoutineIssueText(item.cycleId, e.target.value)}
                        placeholder="e.g. Flat tire, loose brake, sensor error..."
                        className="w-full p-3 rounded-lg bg-white border border-gray-200 text-gray-900 text-sm outline-none focus:ring-2 focus:ring-black"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add extra cycle input */}
          <div className="mt-4 mb-2">
            <label className="block text-sm text-gray-500 mb-1">Add Another Cycle (Optional)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={extraCycleInput}
                onChange={(e) => setExtraCycleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddExtraCycle();
                  }
                }}
                placeholder="e.g. 104, 215"
                className="flex-1 p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 text-sm"
              />
              <button
                type="button"
                onClick={handleAddExtraCycle}
                className="px-5 py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium text-sm rounded-xl transition active:scale-95 shrink-0"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      ) : (
        cycles.map((cycle, index) => (
          <div key={cycle.id} className="mb-6 bg-transparent relative">
            {taskType !== 'battery_swap' && taskType !== 'home_battery_swap' && taskType !== 'battery_test' && (
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
            ) : taskType === 'home_cycle' ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Home Cycle ID</label>
                  <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 249" value={cycle.homeCycleId || ''} onChange={e => updateCycle(cycle.id, 'homeCycleId', e.target.value)} />
                </div>
              </>
            ) : taskType === 'battery_test' ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Battery ID</label>
                  <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. BAT-25" value={cycle.batteryId || ''} onChange={e => updateCycle(cycle.id, 'batteryId', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">Actual Battery %</label>
                    <input type="number" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 85" value={cycle.actualBatteryPercentage} onChange={e => updateCycle(cycle.id, 'actualBatteryPercentage', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">Actual Voltage</label>
                    <input type="number" step="0.1" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 52.5" value={cycle.actualVoltage} onChange={e => updateCycle(cycle.id, 'actualVoltage', e.target.value)} />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Status</label>
                  <select className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 appearance-none" value={cycle.status} onChange={e => updateCycle(cycle.id, 'status', e.target.value)}>
                    <option value="rest office">rest office</option>
                    <option value="Rest Outside">Rest Outside</option>
                    <option value="direct charge">direct charge</option>
                    <option value="rest and charge">rest and charge</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">Start Time</label>
                    <input type="time" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" value={cycle.startTime} onChange={e => updateCycle(cycle.id, 'startTime', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">End Time</label>
                    <input type="time" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" value={cycle.endTime} onChange={e => updateCycle(cycle.id, 'endTime', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">Before Battery %</label>
                    <input type="number" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 20" value={cycle.beforeBatteryPercentage} onChange={e => updateCycle(cycle.id, 'beforeBatteryPercentage', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">Before Voltage</label>
                    <input type="number" step="0.1" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 48.0" value={cycle.beforeVoltage} onChange={e => updateCycle(cycle.id, 'beforeVoltage', e.target.value)} />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Odometer (km)</label>
                  <input type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 1500" value={cycle.odometer} onChange={e => updateCycle(cycle.id, 'odometer', e.target.value)} />
                </div>
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Notes</label>
                  <textarea rows="2" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="Additional notes..." value={cycle.notes} onChange={e => updateCycle(cycle.id, 'notes', e.target.value)} />
                </div>
              </>
            ) : (taskType === 'battery_swap' || taskType === 'home_battery_swap') ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Cycle ID</label>
                  <input required type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. CYC-100" value={cycle.cycleId} onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">IN Battery ID</label>
                    <input type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. BAT-25" value={cycle.inBatteryId || ''} onChange={e => updateCycle(cycle.id, 'inBatteryId', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">IN Percentage</label>
                    <input type="number" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 20" value={cycle.inPercentage || ''} onChange={e => updateCycle(cycle.id, 'inPercentage', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">OUT Battery ID</label>
                    <input type="text" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. BAT-30" value={cycle.outBatteryId || ''} onChange={e => updateCycle(cycle.id, 'outBatteryId', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-500 mb-1">OUT Percentage</label>
                    <input type="number" className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" placeholder="e.g. 100" value={cycle.outPercentage || ''} onChange={e => updateCycle(cycle.id, 'outPercentage', e.target.value)} />
                  </div>
                </div>
                {taskType === 'battery_swap' && (
                  <>
                    <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4 mb-4">
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
                        <label className="block text-sm text-gray-500 mb-1">OUT Time (Auto-saves)</label>
                        <button type="button" disabled={isSubmitting || (cycle.inTimestamp && !isSwapReady)} onClick={() => handleRecordOutAndSave(cycle.id)} className={`w-full p-4 rounded-xl font-semibold border-none transition active:scale-[0.98] ${cycle.outTime ? 'bg-gray-100 text-gray-900' : 'bg-green-50 text-green-600 hover:bg-green-100'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                          {cycle.outTime || (isSubmitting ? 'Saving...' : 'Record OUT & Save')}
                        </button>
                      </div>
                    </div>
                    <SwapTimer startTime={cycle.inTimestamp} isFinished={!!cycle.outTime} onReadyStateChange={setIsSwapReady} />
                  </>
                )}
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Cycle ID</label>
                  <input
                    required
                    type="text"
                    list={`cycle-suggestions-${cycle.id}`}
                    className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900 font-medium"
                    placeholder="e.g. 101"
                    value={cycle.cycleId}
                    onChange={e => updateCycle(cycle.id, 'cycleId', e.target.value)}
                  />
                  {(assignedCycles.length > 0 || eligibleCycles.length > 0) && (
                    <datalist id={`cycle-suggestions-${cycle.id}`}>
                      {assignedCycles.map((cId, i) => (
                        <option key={`assign-${i}`} value={cId}>{cId} (Assigned)</option>
                      ))}
                      {eligibleCycles.map((c, i) => (
                        <option key={`elig-${i}`} value={c.cycleId || c.cycle_id}>{c.cycleId || c.cycle_id}</option>
                      ))}
                    </datalist>
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
        ))
      )}

      {taskType !== 'maintenance' && taskType !== 'battery_swap' && taskType !== 'home_battery_swap' && taskType !== 'home_cycle' && taskType !== 'battery_test' && taskType !== 'routine' && (
        <button type="button" onClick={addCycle} className="w-full py-2 mb-6 bg-transparent border-none text-gray-500  text-sm flex items-center justify-center gap-1 hover:text-black transition">
          <Plus size={16} /> Add Another Cycle
        </button>
      )}

      <div className="flex flex-wrap sm:flex-nowrap justify-between sm:justify-end gap-2.5 mt-8 border-t border-gray-100 pt-6">
        <button type="button" onClick={onBack} className="flex-1 sm:flex-initial px-5 py-3 sm:py-2.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition text-center min-h-[44px]">
          Back
        </button>
        <button type="button" onClick={() => {
          if (taskType === 'routine') {
            toggleAllRoutine(false);
          } else if (taskType === 'battery_swap' || taskType === 'home_battery_swap') {
            setCycles([{ id: Date.now(), cycleId: '', batteryId: '', inVoltage: '', inPercentage: '', inTime: null, inTimestamp: null, outVoltage: '', outPercentage: '', outTime: null, condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
          } else {
            setCycles([{ id: Date.now(), cycleId: '', condition: 'good', issue: '', partsChecked: [], category: '', fixDescription: '', odometer: '', status: 'Repaired' }]);
          }
          setSaveMsg('');
          setSaveError('');
        }} className="flex-1 sm:flex-initial px-5 py-3 sm:py-2.5 bg-red-50 text-red-600 rounded-full text-sm font-medium hover:bg-red-100 transition text-center min-h-[44px]">
          Clear
        </button>
        {taskType !== 'battery_swap' && (
          <button type="submit" disabled={isSubmitting || (taskType === 'routine' && routineItems.filter(i => i.checked).length === 0)} className="w-full sm:w-auto px-8 py-3 sm:py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-black transition shadow-sm disabled:opacity-50 text-center min-h-[44px]">
            {isSubmitting
              ? 'Saving...'
              : taskType === 'routine'
              ? `Save (${routineItems.filter(i => i.checked).length})`
              : (taskType === 'home_battery_swap' ? 'Save Swap' : 'Save')}
          </button>
        )}
      </div>

      {saveMsg && (
        <div className="mt-5 flex justify-center">
          <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-full text-sm font-medium shadow-sm">
            <Check size={16} className="text-green-400" />
            {saveMsg.replace('✅ ', '')}
          </span>
        </div>
      )}
      {saveError && (
        <div className="mt-5 flex justify-center">
          <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-700 rounded-full text-sm font-medium border border-red-200">
            <AlertCircle size={16} />
            {saveError}
          </span>
        </div>
      )}
    </form>
  );
}
