import React, { useState, useEffect } from 'react';
import { Home, ClipboardList, Calendar, Users, FileText, Settings, Search, Plus, Database, Wand2, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getCurrentShiftWindow, getDailyAssignments, getLocalDateKey } from '../utils';
import { refineTextWithAI } from '../utils/ai';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isLiveEditMode, setIsLiveEditMode] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [activeTab, setActiveTab] = useState('reports');
  const [editingRecord, setEditingRecord] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [activeIssuesList, setActiveIssuesList] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const [assignStaff, setAssignStaff] = useState('');
  const [assignCycles, setAssignCycles] = useState('');
  const [assignMsg, setAssignMsg] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [currentAssignments, setCurrentAssignments] = useState({});

  const DEFAULT_OVERRIDES = {
    executive: '',
    routine: '',
    pretask: '',
    overall: '',
    station: '',
    individual: '',
    rider: '',
    mechanical: '',
    extra: ''
  };
  const [overrides, setOverrides] = useState(DEFAULT_OVERRIDES);
  const [activeEditSection, setActiveEditSection] = useState('executive');

  const [globalData, setGlobalData] = useState([]);
  const [dataSearch, setDataSearch] = useState('');
  const [dataFilter, setDataFilter] = useState('All');
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [postponements, setPostponements] = useState({ station: [], overall: [] });

  useEffect(() => {
    fetchPostponements();
  }, []);

  const fetchPostponements = async () => {
    try {
      const { data, error } = await supabase.from('schedule_overrides').select('*');
      if (error && error.code !== '42P01') throw error;
      if (data) {
        const st = data.filter(d => d.type === 'station').map(d => d.date_key);
        const ov = data.filter(d => d.type === 'overall').map(d => d.date_key);
        setPostponements({ station: st, overall: ov });
      }
    } catch (e) {
      console.log('Error fetching postponements:', e);
    }
  };

  const handlePostpone = async (dateStr, type) => {
    try {
      const { error } = await supabase.from('schedule_overrides').insert([{ date_key: dateStr, type }]);
      if (error) throw error;
      fetchPostponements();
    } catch (e) {
      alert("Failed to postpone: " + e.message);
    }
  };

  const handleUndoPostpone = async (dateStr, type) => {
    try {
      const { error } = await supabase.from('schedule_overrides').delete().match({ date_key: dateStr, type });
      if (error) throw error;
      fetchPostponements();
    } catch (e) {
      alert("Failed to undo postpone: " + e.message);
    }
  };

  const reportDateKey = getLocalDateKey(selectedDate);
  const dailyAssignments = getDailyAssignments(selectedDate, postponements);
  const overridesKey = `zum_report_overrides_${reportDateKey}`;

  const handleAssign = async (e) => {
    if (e) e.preventDefault();
    if (!assignStaff || !assignCycles) return alert("Please fill both fields");
    setAssigning(true);
    setAssignMsg("");
    
    try {
      // 1. Save to Supabase
      const { error } = await supabase.from('assignments').insert({
        staff_name: assignStaff,
        cycles: assignCycles
      });
      if (error) throw error;

      // 2. Save to Google Sheets
      const formData = new FormData();
      formData.append('data', JSON.stringify({
        action: 'assign',
        staffName: assignStaff,
        cycles: assignCycles
      }));
      fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formData }).catch(() => {});

      setAssignMsg("✅ Successfully assigned cycles!");
      setAssignCycles('');
      
      // Refresh the assignments list
      fetchDashboardData();
    } catch (err) {
      setAssignMsg("❌ Error sending assignments: " + err.message);
    }
    setAssigning(false);
  };

  useEffect(() => {
    const savedOverrides = localStorage.getItem(overridesKey);
    if (savedOverrides) {
      try {
        setOverrides(JSON.parse(savedOverrides));
      } catch (e) {
        console.error("Error parsing overrides:", e);
        setOverrides(DEFAULT_OVERRIDES);
      }
    } else {
      setOverrides(DEFAULT_OVERRIDES);
    }
  }, [overridesKey]);

  const handleUpdateNotes = () => {
    localStorage.setItem(overridesKey, JSON.stringify(overrides));
    setIsEditingNotes(false);
  };

  const handleClearNotes = () => {
    if (window.confirm("Are you sure you want to permanently delete these notes?")) {
      setOverrides(DEFAULT_OVERRIDES);
      localStorage.removeItem(overridesKey);
      setIsEditingNotes(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const { start, end } = getCurrentShiftWindow(selectedDate);

      const { data: tasksDataRaw, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: true });
        
      if (taskError) throw taskError;

      // Filter out faulty records that were saved to Supabase but not Google Sheets today
      const badIds = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
      const tasksData = tasksDataRaw ? tasksDataRaw.filter(t => !badIds.includes(t.id)) : [];

      const { data: maintData, error: maintError } = await supabase
        .from('maintenance')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: true });
        
      if (maintError) throw maintError;

      const result = {
        routine: {},    // { staffName: [{ cycle_id, condition, issue, parts_checked, odometer }] }
        pretask: {},    // same structure
        overall: { staff: dailyAssignments.overall || 'Not assigned today', cycles: [] },
        station: { staff: dailyAssignments.station || 'Not scheduled today', cycles: [] },
        maintenance: []
      };

      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false });
        
      const latestAssignments = {};
      if (assignmentsData) {
        assignmentsData.forEach(row => {
          if (!latestAssignments[row.staff_name]) {
            latestAssignments[row.staff_name] = row.cycles;
          }
        });
      }
      
      // Initialize routine array with all assigned staff so they appear in the report
      Object.keys(latestAssignments).forEach(staff => {
        result.routine[staff] = [];
      });
      
      setCurrentAssignments(latestAssignments);

      if (tasksData) {
        const seenTasks = new Set();
        
        tasksData.forEach(row => {
          // Deduplicate by task_type + staff_name + cycle_id to prevent duplicates on the report
          const uniqueKey = `${row.task_type}-${row.staff_name}-${row.cycle_id}`;
          if (seenTasks.has(uniqueKey)) return;
          seenTasks.add(uniqueKey);
          
          if (row.task_type === 'Routine Checkup') {
            if (!result.routine[row.staff_name]) result.routine[row.staff_name] = [];
            result.routine[row.staff_name].push(row);
          } else if (row.task_type === 'Pre-Task Check') {
            if (!result.pretask[row.staff_name]) result.pretask[row.staff_name] = [];
            result.pretask[row.staff_name].push(row);
          } else if (row.task_type === 'Overall Checkup') {
            result.overall.cycles.push(row);
          } else if (row.task_type === 'Station Visit') {
            result.station.cycles.push(row);
          }
        });
      }

      if (maintData) {
        maintData.forEach(row => {
          result.maintenance.push({
            cycleId: row.cycle_id,
            staffName: row.staff_name,
            fix: row.fix_description
          });
        });
      }

      setData(result);
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, isAuthenticated]);

  const fetchGlobal = async () => {
    setIsLoadingGlobal(true);
    try {
      const { data: tasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(1000);
      const { data: maint } = await supabase.from('maintenance').select('*').order('created_at', { ascending: false }).limit(1000);
      
      const combined = [
        ...(tasks || []).map(t => ({ ...t, source: 'tasks' })),
        ...(maint || []).map(m => ({
           id: m.id,
           task_type: 'Maintenance',
           staff_name: m.staff_name,
           cycle_id: m.cycle_id,
           created_at: m.created_at,
           fix_description: m.fix_description,
           source: 'maintenance'
        }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setGlobalData(combined);
    } catch (err) {
      console.error(err);
    }
    setIsLoadingGlobal(false);
  };

  useEffect(() => {
    if (activeTab === 'manage_data' && isAuthenticated) {
      fetchGlobal();
    }
  }, [activeTab, isAuthenticated]);

  const fetchActiveIssues = async () => {
    const { start, end } = getCurrentShiftWindow(selectedDate);
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .gte('created_at', start)
      .lt('created_at', end)
      .eq('condition', 'issue')
      .order('created_at', { ascending: false });
      
    if (data) {
      const seen = new Set();
      const unique = data.filter(issue => {
         const key = `${issue.task_type}-${issue.staff_name}-${issue.cycle_id}`;
         if (seen.has(key)) return false;
         seen.add(key);
         return true;
      });
      setActiveIssuesList(unique);
    }
  };

  useEffect(() => {
    if (activeTab === 'issues' && isAuthenticated) fetchActiveIssues();
  }, [activeTab, isAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (password !== 'Admin123') {
      setError('Invalid password.');
      setLoading(false);
      return;
    }

    try {
      await fetchDashboardData();
      setIsAuthenticated(true);
    } catch (err) {
      setError('Connection error: ' + err.message);
    }
    setLoading(false);
  };

  const handleDeleteRecord = async (table, id) => {
    if (!window.confirm(`Are you sure you want to delete this record from ${table}? This cannot be undone.`)) return;
    
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      
      alert('Record deleted successfully!');
      setGlobalData(prev => prev.filter(item => !(item.source === table && item.id === id)));
      await fetchDashboardData(); // Refresh UI and PDF data automatically
    } catch (err) {
      alert('Error deleting record: ' + err.message + '\nMake sure you ran the SQL script to allow deletes!');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    setIsSavingEdit(true);
    try {
      const table = editingRecord.source;
      let updates = {};
      
      if (table === 'tasks') {
        updates = { 
          condition: editingRecord.condition, 
          issue: editingRecord.issue,
          task_type: editingRecord.task_type
        };
      } else if (table === 'maintenance') {
        updates = { fix_description: editingRecord.fix_description };
      }
      
      const { error } = await supabase.from(table).update(updates).eq('id', editingRecord.id);
      if (error) throw error;
      
      alert('Record updated successfully!');
      setEditingRecord(null);
      fetchGlobal();
      fetchDashboardData();
    } catch (err) {
      alert('Error updating record: ' + err.message);
    }
    setIsSavingEdit(false);
  };

  const handleResolveIssue = async (issueRecord) => {
    if (!window.confirm("Mark this issue as solved? It will be removed from the active issues list and updated on today's report.")) return;
    try {
      const { start, end } = getCurrentShiftWindow(selectedDate);
      
      // Update ALL duplicates for this cycle/staff in today's shift to ensure it disappears entirely
      const { error } = await supabase.from('tasks').update({ condition: 'good', issue: '' })
        .gte('created_at', start)
        .lt('created_at', end)
        .eq('cycle_id', issueRecord.cycle_id)
        .eq('staff_name', issueRecord.staff_name)
        .eq('task_type', issueRecord.task_type);
        
      if (error) throw error;
      
      alert('Issue marked as solved successfully!');
      fetchActiveIssues();
      fetchDashboardData();
      fetchGlobal();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleRefine = async () => {
    const currentText = overrides[activeEditSection];
    if (!currentText || !currentText.trim()) return;
    
    setIsRefining(true);
    try {
      const refinedText = await refineTextWithAI(currentText);
      setOverrides(prev => ({ ...prev, [activeEditSection]: refinedText }));
    } catch (err) {
      alert(err.message);
    } finally {
      setIsRefining(false);
    }
  };

  const generatePDF = () => {
    const dateStr = selectedDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    const originalTitle = document.title;
    document.title = `Daily_Operations_Report_${dateStr}`;
    window.print();
    document.title = originalTitle;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <form onSubmit={handleLogin} className="w-full max-w-xs text-center">
          <h2 className="text-xl  mb-6 text-gray-900">Admin Area</h2>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 mb-6 rounded-lg bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-center text-gray-900"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button disabled={loading} type="submit" className="px-8 py-2.5 bg-gray-900 text-white rounded-lg  text-sm hover:bg-black transition">
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </form>
      </div>
    );
  }

  // Formatting Data safely
  const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  
  const routineStaff = data?.routine ? Object.keys(data.routine) : [];
  const pretaskStaff = data?.pretask ? Object.keys(data.pretask) : [];
  const stationRows = data?.station?.cycles || [];
  const overallRows = data?.overall?.cycles || [];
  const maintenance = data?.maintenance || [];

  // Helper: get cycle IDs array from full row objects
  const cycleIds = (rows) => rows.map(r => r.cycle_id || r).join(', ');
  
  const renderCycleGroup = (rows) => {
    const list = rows.map(r => {
      if (r.condition === 'issue') {
        const parts = r.issue || r.parts_checked;
        return parts ? `${r.cycle_id} (${parts})` : r.cycle_id;
      }
      return r.cycle_id;
    });
    return <>{list.join(', ')}</>;
  };
  const recordLabel = (count, singular) => {
    if (count === 1) return `${count} ${singular}`;
    const plural = singular.endsWith('activity') || singular.endsWith('entry')
      ? `${singular.slice(0, -1)}ies`
      : `${singular}s`;
    return `${count} ${plural}`;
  };
  const issueCount = (rows) => rows.filter(row => row.condition === 'issue').length;
  const routineTotal = routineStaff.reduce((sum, staff) => sum + (data.routine[staff] || []).length, 0);
  const pretaskTotal = pretaskStaff.reduce((sum, staff) => sum + (data.pretask[staff] || []).length, 0);
  const overallIssueCount = issueCount(overallRows);
  const stationIssueCount = issueCount(stationRows);
  const staffWork = new Map();
  const addStaffWork = (staff, description) => {
    if (!staff) return;
    if (!staffWork.has(staff)) staffWork.set(staff, []);
    staffWork.get(staff).push(description);
  };

  routineStaff.forEach(staff => {
    const rows = data.routine[staff] || [];
    const issues = issueCount(rows);
    addStaffWork(staff, `completed ${recordLabel(rows.length, 'routine checkup')}${issues > 0 ? `, with ${recordLabel(issues, 'issue')} recorded for follow-up` : ', with all submitted entries marked in good condition'}`);
  });
  pretaskStaff.forEach(staff => {
    const rows = data.pretask[staff] || [];
    const issues = issueCount(rows);
    addStaffWork(staff, `completed ${recordLabel(rows.length, 'pre-task cross check')}${issues > 0 ? ` and recorded ${recordLabel(issues, 'issue')}` : ' without a recorded issue'}`);
  });
  if (overallRows.length > 0) addStaffWork(data.overall.staff, `completed ${recordLabel(overallRows.length, 'overall cycle inspection')}`);
  if (stationRows.length > 0) addStaffWork(data.station.staff, `completed ${recordLabel(stationRows.length, 'station inspection')}`);
  const maintenanceByStaff = maintenance.reduce((totals, item) => {
    const staff = item.staffName || 'Maintenance Team';
    totals[staff] = (totals[staff] || 0) + 1;
    return totals;
  }, {});
  Object.entries(maintenanceByStaff).forEach(([staff, count]) => {
    addStaffWork(staff, `completed ${recordLabel(count, 'mechanical maintenance activity')}`);
  });

  const sectionTitles = {
    executive: "1. Executive Operations Summary",
    routine: "2. Routine Cycle Checkups",
    pretask: "3. Pre-Task Cross Check",
    overall: "4. Overall Cycle Checkup",
    station: "5. Station Visit",
    individual: "6. Individual Staff Work Summary",
    rider: "7. Rider Data Collection Instructions",
    mechanical: "8. Mechanical Repair Work",
    extra: "9. Extra Work & Remarks"
  };

  const getUpcomingSchedule = () => {
    const schedule = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const assignments = getDailyAssignments(d, postponements);
      schedule.push({
        dateKey: getLocalDateKey(d),
        dateString: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        overall: assignments.overall,
        station: assignments.station
      });
    }
    return schedule;
  };
  const upcomingSchedule = getUpcomingSchedule();

  return (
    <div className="flex h-screen w-full bg-[#f3f4f6] font-sans text-gray-800 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-[#f9fafb] border-r border-gray-200 flex flex-col overflow-y-auto hidden md:flex">
        <div className="p-4 flex items-center gap-3 border-b border-gray-200 mb-2">
          <div className="w-10 h-10 bg-black text-white flex items-center justify-center rounded-xl">
             Z
          </div>
          <div>
            <div className="text-sm">Zum Operations</div>
            <div className="text-xs text-gray-500">Administrator</div>
          </div>
        </div>
        
        <div className="p-4 flex-1">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input type="text" placeholder="Search" className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-black" />
          </div>
          
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Menu</div>
          <nav className="flex flex-col gap-1 mb-8">
            <button 
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg w-full text-left ${activeTab === 'reports' ? 'text-gray-900 bg-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <ClipboardList size={18} /> Daily Reports
            </button>
            <button 
              onClick={() => setActiveTab('assign')}
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg w-full text-left ${activeTab === 'assign' ? 'text-gray-900 bg-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Users size={18} /> Assign Cycles
            </button>
            <button 
              onClick={() => setActiveTab('manage_data')}
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg w-full text-left ${activeTab === 'manage_data' ? 'text-gray-900 bg-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Database size={18} /> Master Archive
            </button>
            <button 
              onClick={() => setActiveTab('issues')}
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg w-full text-left ${activeTab === 'issues' ? 'text-gray-900 bg-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <div className="w-2 h-2 rounded-full bg-red-500 absolute left-8"></div>
              <Database size={18} className="opacity-0" /> {/* Spacer */}
              <span className="-ml-7 flex items-center gap-2 text-red-600 font-medium">Active Issues</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f3f4f6]">
        {/* Top Header */}
        <div className="px-8 py-5 flex justify-between items-center border-b border-gray-200 bg-white z-10">
          <h1 className="text-xl text-gray-900">
            {activeTab === 'reports' ? 'Daily Operations' : activeTab === 'assign' ? 'Assign Cycles to Staff' : 'Manage Data'}
          </h1>
          {activeTab === 'reports' && (
            <div className="flex gap-3 items-center">
               <div className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-4 py-2 gap-2 shadow-sm">
                 <Calendar size={16} className="text-gray-500" />
                 <input 
                   type="date"
                   value={getLocalDateKey(selectedDate)}
                   onChange={(e) => {
                     if (e.target.value) {
                       const [y, m, d] = e.target.value.split('-');
                       setSelectedDate(new Date(y, m - 1, d));
                     }
                   }}
                   className="bg-transparent border-none text-gray-900 text-sm outline-none cursor-pointer"
                 />
               </div>
               <button onClick={generatePDF} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-full text-sm hover:bg-gray-50 transition shadow-sm">
                  <FileText size={16} /> Export PDF
               </button>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className={`${activeTab === 'manage_data' ? 'w-full' : 'max-w-5xl mx-auto'} flex flex-col gap-6`}>

            {/* Assignments Card */}
            {activeTab === 'assign' && (
              <div className="flex flex-col gap-6">
                <div className="">
                  <h3 className="text-gray-900 text-lg mb-6">Assign Cycles to Staff</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm text-gray-500 mb-2">Staff Member</label>
                        <select 
                          value={assignStaff} 
                          onChange={e => setAssignStaff(e.target.value)}
                          className="w-full p-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-black text-gray-900 appearance-none text-sm bg-gray-50"
                        >
                           <option value="">Select Staff Member...</option>
                           <option value="Kabir">Kabir</option>
                           <option value="Laxman">Laxman</option>
                           <option value="Anish">Anish</option>
                           <option value="Surya">Surya</option>
                           <option value="Dipesh">Dipesh</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-2">Cycle IDs</label>
                        <input 
                          type="text"
                          placeholder="e.g. 101, 55, 89"
                          value={assignCycles}
                          onChange={e => setAssignCycles(e.target.value)}
                          className="w-full p-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-black text-gray-900 text-sm bg-gray-50"
                        />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button disabled={assigning} onClick={handleAssign} className="px-6 py-2.5 bg-gray-900 text-white rounded-full shadow-sm hover:bg-black transition text-sm disabled:opacity-50">
                      {assigning ? 'Assigning...' : 'Send Assignments'}
                    </button>
                    {assignMsg && <span className="text-sm text-green-600">{assignMsg}</span>}
                  </div>
                </div>

                {/* Current Assignments Display */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <h3 className="text-gray-900 text-lg font-medium mb-4">Today's Assigned Cycles</h3>
                  {Object.keys(currentAssignments).length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No cycles have been assigned to anyone for today.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {Object.entries(currentAssignments).map(([staff, cycles]) => (
                        <div key={staff} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <h4 className="font-semibold text-gray-900 mb-2">{staff}</h4>
                          <p className="text-sm text-gray-700 font-medium">{cycles}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2-Week Schedule UI */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <h3 className="text-gray-900 text-lg font-medium mb-4">Upcoming Schedule (Next 14 Days)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                          <th className="py-3 px-4 font-medium">Date</th>
                          <th className="py-3 px-4 font-medium">Overall Visit</th>
                          <th className="py-3 px-4 font-medium">Station Visit</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {upcomingSchedule.map((day, idx) => (
                          <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50 transition">
                            <td className="py-3 px-4 font-medium text-gray-900">
                              {day.dateString}
                              {idx === 0 && <span className="ml-3 px-2.5 py-1 bg-black text-white rounded-full text-[10px] uppercase font-bold tracking-wider">Today</span>}
                              {idx === 1 && <span className="ml-3 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] uppercase font-bold tracking-wider">Tomorrow</span>}
                            </td>
                            <td className="py-3 px-4 text-gray-700">
                              {day.overall ? (
                                <div className="flex items-center gap-3">
                                  <span className="font-medium text-gray-900">{day.overall}</span>
                                  {idx === 0 && <button onClick={() => handlePostpone(day.dateKey, 'overall')} className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100 font-medium transition">Postpone</button>}
                                </div>
                              ) : postponements.overall.includes(day.dateKey) ? (
                                <div className="flex items-center gap-3">
                                  <span className="text-red-500 font-medium text-sm">Postponed</span>
                                  <button onClick={() => handleUndoPostpone(day.dateKey, 'overall')} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 font-medium transition">Undo</button>
                                </div>
                              ) : <span className="text-gray-400 italic">None</span>}
                            </td>
                            <td className="py-3 px-4 text-gray-700">
                              {day.station ? (
                                <div className="flex items-center gap-3">
                                  <span className="font-medium text-gray-900">{day.station}</span>
                                  {idx === 0 && <button onClick={() => handlePostpone(day.dateKey, 'station')} className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100 font-medium transition">Postpone</button>}
                                </div>
                              ) : postponements.station.includes(day.dateKey) ? (
                                <div className="flex items-center gap-3">
                                  <span className="text-red-500 font-medium text-sm">Postponed</span>
                                  <button onClick={() => handleUndoPostpone(day.dateKey, 'station')} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 font-medium transition">Undo</button>
                                </div>
                              ) : <span className="text-gray-400 italic">None</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Master Database UI */}
            {activeTab === 'manage_data' && (
              <div className="w-full">
                {/* Header Section */}
                <div className="flex flex-col gap-6 mb-8">
                  <div className="flex justify-between items-center">
                    <h3 className="text-gray-900 text-xl font-bold">Master Data Archive</h3>
                    <div className="relative">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text"
                        placeholder="Search cycle, staff..."
                        value={dataSearch}
                        onChange={e => setDataSearch(e.target.value)}
                        className="pl-11 pr-4 py-2 bg-white border-none outline-none focus:ring-2 focus:ring-black text-sm rounded-full w-64 text-gray-900 shadow-sm"
                      />
                    </div>
                  </div>
                  
                  {/* Pills */}
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {['All', 'Routine Checkup', 'Pre-task Cross-check', 'Overall Checkup', 'Station Visit', 'Maintenance'].map(filter => (
                      <button 
                        key={filter}
                        onClick={() => setDataFilter(filter)}
                        className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${dataFilter === filter ? 'bg-[#0f172a] text-white border-transparent' : 'bg-transparent text-gray-600 border-gray-200 hover:border-gray-300'}`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table Section */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                        <th className="py-4 px-2 font-semibold">Cycle</th>
                        <th className="py-4 px-2 font-semibold">Type</th>
                        <th className="py-4 px-2 font-semibold">Staff</th>
                        <th className="py-4 px-2 font-semibold">Date & Time</th>
                        <th className="py-4 px-2 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {isLoadingGlobal ? (
                        <tr><td colSpan="5" className="py-12 text-center text-gray-400">Loading master database...</td></tr>
                      ) : (
                        globalData
                          .filter(item => dataFilter === 'All' || item.task_type === dataFilter)
                          .filter(item => {
                            if (!dataSearch.trim()) return true;
                            const term = dataSearch.toLowerCase();
                            return String(item.cycle_id).includes(term) || item.staff_name.toLowerCase().includes(term);
                          })
                          .map(item => (
                          <tr key={`${item.source}-${item.id}`} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="py-5 px-2 font-bold text-gray-900 text-[15px]">{item.cycle_id}</td>
                            <td className="py-5 px-2">
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-wide ${
                                item.task_type === 'Routine Checkup' ? 'bg-blue-50 text-blue-600' :
                                item.task_type === 'Overall Checkup' ? 'bg-purple-50 text-purple-600' :
                                item.task_type === 'Station Visit' ? 'bg-emerald-50 text-emerald-600' :
                                item.task_type === 'Pre-task Cross-check' ? 'bg-indigo-50 text-indigo-600' :
                                'bg-red-50 text-red-600'
                              }`}>
                                {item.task_type}
                              </span>
                            </td>
                            <td className="py-5 px-2 text-gray-600 font-medium text-sm">{item.staff_name}</td>
                            <td className="py-5 px-2">
                              <span className="text-gray-900 font-semibold block text-sm">{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              <span className="text-gray-400 text-[11px]">{new Date(item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                            </td>
                            <td className="py-5 px-2 text-right">
                              <button onClick={() => setEditingRecord(item)} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold transition mr-3">Edit</button>
                              <button onClick={() => handleDeleteRecord(item.source, item.id)} className="text-red-400 hover:text-red-600 text-xs font-bold transition">Delete</button>
                            </td>
                          </tr>
                        ))
                      )}
                      {(!isLoadingGlobal && globalData.length === 0) && (
                        <tr><td colSpan="5" className="py-12 text-center text-gray-400">No records found matching your search.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Active Issues UI */}
            {activeTab === 'issues' && (
              <div className="w-full">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-gray-900 text-xl font-bold">Active Cycle Issues</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeIssuesList.length === 0 ? (
                    <div className="col-span-full p-8 text-center bg-gray-50 rounded-2xl border border-gray-200">
                      <p className="text-gray-500">No active issues found! All cycles are operating smoothly.</p>
                    </div>
                  ) : activeIssuesList.map(issue => (
                    <div key={issue.id} className="bg-white p-6 rounded-2xl border border-red-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-2xl font-black text-gray-900">{issue.cycle_id}</h4>
                          <span className="text-xs font-medium text-red-600 uppercase tracking-wide">{issue.task_type || 'Reported Issue'}</span>
                        </div>
                        <button onClick={() => handleResolveIssue(issue)} className="px-3 py-1.5 bg-green-50 text-green-700 text-xs font-bold rounded-full hover:bg-green-100 transition">
                          Mark Solved
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100">{issue.issue || issue.parts_checked || 'No details provided.'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <>
                <div className="">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-gray-900 text-lg">Report Configuration</h3>
                 {!isEditingNotes ? (
                    <div className="flex gap-3">
                      <button 
                        onClick={() => setIsLiveEditMode(!isLiveEditMode)} 
                        className={`px-5 py-2 rounded-full text-sm font-medium transition shadow-sm ${isLiveEditMode ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-800 hover:bg-gray-50'}`}
                      >
                        {isLiveEditMode ? 'Exit Word-Style Edit' : 'Word-Style Edit Mode'}
                      </button>
                      <button onClick={() => setIsEditingNotes(true)} className="px-5 py-2 bg-white border border-gray-200 text-gray-800 rounded-full text-sm hover:bg-gray-50 transition shadow-sm">
                        Edit Configuration
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditingNotes(false)} className="px-5 py-2 bg-gray-100 text-gray-800 rounded-full text-sm hover:bg-gray-200 transition">
                        Cancel
                      </button>
                      <button onClick={handleUpdateNotes} className="px-5 py-2 bg-gray-900 text-white rounded-full text-sm hover:bg-black transition">
                        Save
                      </button>
                      <button onClick={handleClearNotes} className="px-5 py-2 bg-red-50 text-red-600 rounded-full text-sm hover:bg-red-100 transition ml-2">
                        Clear All
                      </button>
                    </div>
                  )}
              </div>
              
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Select Section to Edit</label>
                  <select 
                    className={`w-full p-3 rounded-xl border-none outline-none text-sm text-gray-900 appearance-none ${isEditingNotes ? 'bg-gray-50 focus:ring-2 focus:ring-black cursor-pointer' : 'bg-gray-50 opacity-60 cursor-not-allowed'}`}
                    value={activeEditSection}
                    onChange={e => setActiveEditSection(e.target.value)}
                    disabled={!isEditingNotes}
                  >
                    {Object.entries(sectionTitles).map(([key, title]) => (
                      <option key={key} value={key}>{title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <label className="block text-sm text-gray-500">Override Text (Leave empty to use automated text)</label>
                    <button 
                      onClick={handleRefine}
                      disabled={!isEditingNotes || isRefining || !overrides[activeEditSection]}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${!isEditingNotes || !overrides[activeEditSection] ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                    >
                      {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      {isRefining ? 'Refining...' : 'Make Professional'}
                    </button>
                  </div>
                  <textarea 
                    className={`w-full p-4 rounded-xl border-none outline-none text-sm text-gray-900 whitespace-pre-wrap ${isEditingNotes ? 'bg-gray-50 focus:ring-2 focus:ring-black' : 'bg-gray-50 opacity-60 cursor-not-allowed'}`}
                    rows="4"
                    placeholder={`Type override text for ${sectionTitles[activeEditSection]}...`}
                    value={overrides[activeEditSection]}
                    onChange={e => setOverrides({ ...overrides, [activeEditSection]: e.target.value })}
                    readOnly={!isEditingNotes}
                  />
                </div>
              </div>
            </div>

      {/* This is the printable report */}
            <div 
              className={`report-document mb-8 ${isLiveEditMode ? 'ring-4 ring-indigo-200 bg-indigo-50/20 rounded-xl p-4 transition-all' : ''}`}
              id="pdf-report-content" 
              style={{ color: '#000' }}
              contentEditable={isLiveEditMode}
              suppressContentEditableWarning={true}
            >

              {/* Header */}
              <div className="report-header flex justify-between items-end border-b-2 border-gray-900 pb-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Daily Operations Report</h2>
                  <p className="text-sm text-gray-900">Date: {todayStr} &nbsp;|&nbsp; Prepared by: Automated System</p>
                </div>
                <div className="text-right text-xs text-gray-900">Zum Operations</div>
              </div>

              {/* Section 1: Executive Summary */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">1. Executive Operations Summary</h3>
                {overrides.executive.trim() ? (
                  <p className="text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">{overrides.executive}</p>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-gray-900">
                      This report summarizes the operational work recorded for the current shift. The team submitted {recordLabel(routineTotal, 'routine checkup record')} across {recordLabel(routineStaff.length, 'staff member')}, {recordLabel(pretaskTotal, 'pre-task cross-check record')}, {recordLabel(overallRows.length, 'overall checkup record')}, and {recordLabel(stationRows.length, 'station visit record')}. The maintenance team also logged {recordLabel(maintenance.length, 'repair activity')}.
                    </p>
                    <p className="text-sm leading-relaxed text-gray-900 mt-3">
                      The sections below provide a staff-level summary followed by the detailed cycle records, recorded conditions, inspection information, and maintenance work submitted during the shift.
                    </p>
                  </>
                )}
              </div>

              {/* Section 2: Routine Checkup — Summary + Individual detail per staff */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">2. Routine Cycle Checkups</h3>
                {routineStaff.length === 0 ? (
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{overrides.routine || 'No routine checkups were submitted for this shift.'}</p>
                ) : (
                  <>
                    {overrides.routine.trim() ? (
                      <p className="text-sm leading-relaxed text-gray-900 mb-4 whitespace-pre-wrap">{overrides.routine}</p>
                    ) : (
                      <p className="text-sm leading-relaxed text-gray-900 mb-4">
                        Routine condition checks were completed by {routineStaff.join(', ')}. Together, they submitted {recordLabel(routineTotal, 'cycle checkup record')}. The summary table shows how the recorded work was distributed among staff members.
                      </p>
                    )}
                    {/* Summary table */}
                    <table className="w-full text-sm text-left border-collapse mb-4 border border-gray-400">
                      <thead>
                        <tr>
                          <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-1/4">Staff</th>
                          <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Cycle IDs</th>
                          <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 text-right w-16">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routineStaff.map(staff => (
                          <tr key={staff}>
                            <td className="border border-gray-400 py-2 px-3 font-medium text-gray-900">{staff}</td>
                            <td className="border border-gray-400 py-2 px-3 text-gray-900 text-xs">{renderCycleGroup(data.routine[staff] || [])}</td>
                            <td className="border border-gray-400 py-2 px-3 text-right font-bold text-gray-900">{(data.routine[staff] || []).length}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="border border-gray-400 py-2 px-3 font-bold text-gray-900">Grand Total</td>
                          <td className="border border-gray-400"></td>
                          <td className="border border-gray-400 py-2 px-3 text-right font-bold text-gray-900">
                            {routineStaff.reduce((sum, s) => sum + (data.routine[s] || []).length, 0)}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                  </>
                )}
              </div>

              {/* Section 3: Pre-Task Check (Cross Check) */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">3. Pre-Task Cross Check</h3>
                {pretaskStaff.length === 0 ? (
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{overrides.pretask || 'No pre-task cross checks were submitted for this shift.'}</p>
                ) : (
                  <>
                    {overrides.pretask.trim() ? (
                      <p className="text-sm leading-relaxed text-gray-900 mb-4 whitespace-pre-wrap">{overrides.pretask}</p>
                    ) : (
                      <p className="text-sm leading-relaxed text-gray-900 mb-4">
                        The team submitted {recordLabel(pretaskTotal, 'pre-task cross check')} before cycles entered operation. These records document the submitted cycle condition and any parts or issues noted during the check.
                      </p>
                    )}
                    {pretaskStaff.map(staff => {
                      const rows = data.pretask[staff] || [];
                      const staffIssueCount = issueCount(rows);
                      return (
                    <div key={staff} className="mb-3">
                      <p className="text-sm font-semibold text-gray-900 mb-1">{staff}</p>
                      <p className="text-sm leading-relaxed text-gray-900 mb-2">
                        {staff} submitted {recordLabel(rows.length, 'pre-task record')} for cycle IDs {cycleIds(rows)}. {staffIssueCount === 0 ? 'No issue was recorded in these entries.' : `${recordLabel(staffIssueCount, 'entry')} ${staffIssueCount === 1 ? 'requires' : 'require'} follow-up.`}
                      </p>
                      {rows.filter(r => r.condition === 'issue').length > 0 && (
                        <table className="w-full text-sm text-left border-collapse mb-2 border border-gray-400">
                          <thead>
                            <tr>
                              <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-20">Cycle</th>
                              <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-24">Condition</th>
                              <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Parts Checked / Issue</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td colSpan="3" className="border border-gray-400 py-2 px-3 font-bold text-gray-900 bg-gray-100">Action Required (Issues)</td>
                            </tr>
                            {rows.filter(r => r.condition === 'issue').map((row, i) => (
                              <tr key={`issue-${i}`}>
                                <td className="border border-gray-400 py-2 px-3 font-bold text-gray-900">{row.cycle_id}</td>
                                <td className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Issue</td>
                                <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.issue || row.parts_checked || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {rows.filter(r => r.condition !== 'issue').length > 0 && (
                        <p className="text-sm text-gray-900 mt-2 mb-2">
                          <span className="font-bold">Good Condition:</span> {rows.filter(r => r.condition !== 'issue').map(r => r.cycle_id).join(', ')}
                        </p>
                      )}
                    </div>
                  )})}
                  </>
                )}
              </div>

              {/* Section 4: Overall Checkup */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">4. Overall Cycle Checkup</h3>
                {overallRows.length === 0 ? (
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{overrides.overall || `No overall cycle checkup was submitted today. The assigned staff member is ${data.overall.staff}.`}</p>
                ) : (
                  <>
                    {overrides.overall.trim() ? (
                      <p className="text-sm leading-relaxed text-gray-900 mb-3 whitespace-pre-wrap">{overrides.overall}</p>
                    ) : (
                      <p className="text-sm leading-relaxed text-gray-900 mb-3">
                        {data.overall.staff} completed {recordLabel(overallRows.length, 'overall cycle inspection')} covering cycle IDs {cycleIds(overallRows)}. {overallIssueCount === 0 ? 'All submitted records were marked in good condition.' : `${recordLabel(overallIssueCount, 'record')} ${overallIssueCount === 1 ? 'was' : 'were'} marked with an issue requiring follow-up.`}
                      </p>
                    )}
                    <p className="text-sm mb-2"><span className="font-medium text-gray-900">Staff:</span> {data.overall.staff} &nbsp;|&nbsp; <span className="font-medium text-gray-900">Total Cycles:</span> {overallRows.length}</p>
                    {overallRows.filter(r => r.condition === 'issue').length > 0 && (
                      <table className="w-full text-sm text-left border-collapse mb-2 border border-gray-400">
                        <thead>
                          <tr>
                            <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-20">Cycle</th>
                            <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Condition</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan="2" className="border border-gray-400 py-2 px-3 font-bold text-gray-900 bg-gray-100">Action Required (Issues)</td>
                          </tr>
                          {overallRows.filter(r => r.condition === 'issue').map((row, i) => (
                            <tr key={`issue-${i}`}>
                              <td className="border border-gray-400 py-2 px-3 font-bold text-gray-900">{row.cycle_id}</td>
                              <td className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Issue: {row.issue || row.parts_checked || 'Unknown'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {overallRows.filter(r => r.condition !== 'issue').length > 0 && (
                      <p className="text-sm text-gray-900 mt-2 mb-2">
                        <span className="font-bold">Good Condition:</span> {overallRows.filter(r => r.condition !== 'issue').map(r => r.cycle_id).join(', ')}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Section 5: Station Visit */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">5. Station Visit</h3>
                {stationRows.length === 0 ? (
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{overrides.station || (data.station.staff === 'Not scheduled today' ? 'No station visit is scheduled for today.' : `No station visit was submitted today. The assigned staff member is ${data.station.staff}.`)}</p>
                ) : (
                  <>
                    {overrides.station.trim() ? (
                      <p className="text-sm leading-relaxed text-gray-900 mb-3 whitespace-pre-wrap">{overrides.station}</p>
                    ) : (
                      <p className="text-sm leading-relaxed text-gray-900 mb-3">
                        {data.station.staff} submitted {recordLabel(stationRows.length, 'station inspection record')} for cycle IDs {cycleIds(stationRows)}. {stationIssueCount === 0 ? 'No issue was recorded in the submitted station entries.' : `${recordLabel(stationIssueCount, 'station record')} ${stationIssueCount === 1 ? 'was' : 'were'} marked with an issue.`}
                      </p>
                    )}
                    <p className="text-sm mb-2"><span className="font-medium text-gray-900">Staff:</span> {data.station.staff} &nbsp;|&nbsp; <span className="font-medium text-gray-900">Total Cycles:</span> {stationRows.length}</p>
                    <div className="text-xs text-gray-900">{renderCycleGroup(stationRows)}</div>
                  </>
                )}
              </div>

              {/* Section 6: Individual Staff Work */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">6. Individual Staff Work Summary</h3>
                {overrides.individual.trim() ? (
                  <p className="text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">{overrides.individual}</p>
                ) : (
                  staffWork.size === 0 ? (
                    <p className="text-sm text-gray-900">No individual staff work was submitted today.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {Array.from(staffWork.entries()).map(([staff, activities]) => (
                        <p key={staff} className="text-sm leading-relaxed text-gray-900">
                          <span className="font-bold">{staff}:</span> {activities.join('; ')}.
                        </p>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Section 7: Rider Instructions */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">7. Rider Data Collection Instructions</h3>
                {overrides.rider.trim() ? (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-900 p-4 ">{overrides.rider}</div>
                ) : (
                  <p className="text-sm text-gray-900">No additional rider data collection instructions were added for this shift.</p>
                )}
              </div>

              {/* Section 8: Mechanical Repair */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">8. Mechanical Repair Work</h3>
                {overrides.mechanical.trim() ? (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4 whitespace-pre-wrap">{overrides.mechanical}</p>
                ) : (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4">
                    {maintenance.length === 0
                      ? 'No mechanical repair work was submitted for this shift.'
                      : `The maintenance team submitted ${recordLabel(maintenance.length, 'repair activity')}. Each record below identifies the cycle, responsible staff member, and the repair or fix description entered during the shift.`}
                  </p>
                )}
                <table className="w-full text-sm text-left border-collapse border border-gray-400">
                  <thead>
                    <tr>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-20">Cycle ID</th>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-24">Staff</th>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Repair / Fix Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenance.length === 0 ? (
                      <tr><td colSpan="3" className="border border-gray-400 py-4 px-3 text-gray-900 italic">No repairs recorded for this shift.</td></tr>
                    ) : (
                      maintenance.map((m, idx) => (
                        <tr key={idx}>
                          <td className="border border-gray-400 py-2 px-3 font-bold text-gray-900">{m.cycleId}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{m.staffName || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{m.fix}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Section 9: Extra Remarks */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">9. Extra Work &amp; Remarks</h3>
                {overrides.extra.trim() ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-900 p-4 ">{overrides.extra}</p>
                ) : (
                  <p className="text-sm text-gray-900">No additional work or remarks were recorded for this shift.</p>
                )}
              </div>

              {/* Section 10: Closing Summary */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">10. Operational Closing Summary</h3>
                <p className="text-sm leading-relaxed text-gray-900">
                  The submitted records account for {recordLabel(routineTotal + pretaskTotal + overallRows.length + stationRows.length, 'operational cycle entry')} and {recordLabel(maintenance.length, 'maintenance activity')} during this shift. Any entries marked with issues should be reviewed by the responsible operations or maintenance team before the affected cycles return to regular service.
                </p>
                <p className="text-sm leading-relaxed text-gray-900 mt-3">
                  This report reflects only the information entered in the Zum Operations forms for the reporting period shown above.
                </p>
              </div>

              {/* Footer */}
              <div className="report-footer border-t-2 border-gray-900 pt-4 mt-6 flex justify-between text-xs text-gray-900">
                <span>Zum Operations — Confidential</span>
                <span>{todayStr}</span>
              </div>
            </div>
              </>
            )}



          </div>
        </div>
      </div>

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-xl relative animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Edit Record</h3>
            
            {editingRecord.source === 'tasks' ? (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Task Type</label>
                  <input 
                    type="text"
                    list="task-types-list"
                    value={editingRecord.task_type || ''}
                    onChange={e => setEditingRecord({...editingRecord, task_type: e.target.value})}
                    className="w-full p-3 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-black text-sm"
                    placeholder="Type or select a task type..."
                  />
                  <datalist id="task-types-list">
                    <option value="Routine Checkup" />
                    <option value="Overall Checkup" />
                    <option value="Pre-Task Check" />
                    <option value="Station Visit" />
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Condition</label>
                  <select 
                    value={editingRecord.condition}
                    onChange={e => setEditingRecord({...editingRecord, condition: e.target.value})}
                    className="w-full p-3 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-black text-sm"
                  >
                    <option value="good">Good</option>
                    <option value="issue">Issue</option>
                  </select>
                </div>
                {editingRecord.condition === 'issue' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Issue Description (Added to Active Issues)</label>
                    <textarea 
                      value={editingRecord.issue}
                      onChange={e => setEditingRecord({...editingRecord, issue: e.target.value})}
                      className="w-full p-3 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-black text-sm"
                      rows="3"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Repair Description</label>
                  <textarea 
                    value={editingRecord.fix_description}
                    onChange={e => setEditingRecord({...editingRecord, fix_description: e.target.value})}
                    className="w-full p-3 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-black text-sm"
                    rows="3"
                  />
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setEditingRecord(null)} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={isSavingEdit} className="px-5 py-2.5 rounded-full text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm disabled:opacity-50 flex items-center gap-2">
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
