import React, { useState, useEffect } from 'react';
import { Home, ClipboardList, Calendar, Users, FileText, Settings, Search, Plus, Database } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getCurrentShiftWindow, getDailyAssignments, getLocalDateKey } from '../utils';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [activeTab, setActiveTab] = useState('reports');
  const [assignStaff, setAssignStaff] = useState('');
  const [assignCycles, setAssignCycles] = useState('');
  const [assignMsg, setAssignMsg] = useState('');
  const [assigning, setAssigning] = useState(false);

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
  const [rawTasks, setRawTasks] = useState([]);
  const [rawMaint, setRawMaint] = useState([]);

  const reportDateKey = getLocalDateKey();
  const dailyAssignments = getDailyAssignments();
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
      }
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
      const { start, end } = getCurrentShiftWindow();

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
      setRawTasks(tasksData);

      const { data: maintData, error: maintError } = await supabase
        .from('maintenance')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: true });
        
      if (maintError) throw maintError;
      setRawMaint(maintData || []);

      const result = {
        routine: {},    // { staffName: [{ cycle_id, battery_id, condition, issue, parts_checked, odometer }] }
        pretask: {},    // same structure
        overall: { staff: dailyAssignments.overall || 'No Saturday assignment', cycles: [] },
        station: { staff: dailyAssignments.station || 'No Saturday assignment', cycles: [] },
        maintenance: []
      };

      if (tasksData) {
        tasksData.forEach(row => {
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
      await fetchDashboardData(); // Refresh UI and PDF data automatically
    } catch (err) {
      alert('Error deleting record: ' + err.message + '\nMake sure you ran the SQL script to allow deletes!');
    }
  };

  const generatePDF = () => {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
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
              <Database size={18} /> Manage Data
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
            <div className="flex gap-3">
               <button onClick={generatePDF} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-full text-sm hover:bg-gray-50 transition shadow-sm">
                  <FileText size={16} /> Export PDF
               </button>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-5xl mx-auto flex flex-col gap-6">

            {/* Assignments Card */}
            {activeTab === 'assign' && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
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
            )}

            {/* Notes Settings Card */}
            {activeTab === 'manage_data' && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-gray-900 text-lg mb-6">Manage Shift Data</h3>
                
                <h4 className="font-semibold mb-3">Tasks Data</h4>
                <div className="overflow-x-auto mb-8">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-900">
                        <th className="py-2 px-3">ID</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Staff</th>
                        <th className="py-2 px-3">Cycle</th>
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawTasks.length === 0 ? (
                        <tr><td colSpan="6" className="py-4 text-center text-gray-500">No tasks found.</td></tr>
                      ) : rawTasks.map(t => (
                        <tr key={t.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-500 text-xs">{t.id}</td>
                          <td className="py-2 px-3 font-medium">{t.task_type}</td>
                          <td className="py-2 px-3">{t.staff_name}</td>
                          <td className="py-2 px-3 font-bold">{t.cycle_id}</td>
                          <td className="py-2 px-3">{new Date(t.created_at).toLocaleTimeString()}</td>
                          <td className="py-2 px-3 text-right">
                            <button onClick={() => handleDeleteRecord('tasks', t.id)} className="text-red-500 hover:text-red-700 text-xs font-semibold px-2 py-1 bg-red-50 rounded">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h4 className="font-semibold mb-3">Maintenance Data</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-900">
                        <th className="py-2 px-3">ID</th>
                        <th className="py-2 px-3">Staff</th>
                        <th className="py-2 px-3">Cycle</th>
                        <th className="py-2 px-3">Fix</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawMaint.length === 0 ? (
                        <tr><td colSpan="5" className="py-4 text-center text-gray-500">No maintenance records found.</td></tr>
                      ) : rawMaint.map(m => (
                        <tr key={m.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-500 text-xs">{m.id}</td>
                          <td className="py-2 px-3 font-medium">{m.staff_name}</td>
                          <td className="py-2 px-3 font-bold">{m.cycle_id}</td>
                          <td className="py-2 px-3 truncate max-w-[200px]">{m.fix_description}</td>
                          <td className="py-2 px-3 text-right">
                            <button onClick={() => handleDeleteRecord('maintenance', m.id)} className="text-red-500 hover:text-red-700 text-xs font-semibold px-2 py-1 bg-red-50 rounded">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-gray-900 text-lg">Report Configuration</h3>
                 {!isEditingNotes ? (
                    <button onClick={() => setIsEditingNotes(true)} className="px-5 py-2 bg-white border border-gray-200 text-gray-800 rounded-full text-sm hover:bg-gray-50 transition shadow-sm">
                      Edit Configuration
                    </button>
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
                  <label className="block text-sm text-gray-500 mb-2">Override Text (Leave empty to use automated text)</label>
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
            <div className="report-document bg-white p-10 rounded-2xl shadow-sm border border-gray-300 mb-8" id="pdf-report-content" style={{ color: '#000' }}>

              {/* Header */}
              <div className="report-header flex justify-between items-end border-b-2 border-gray-900 pb-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Daily Operations Report</h2>
                  <p className="text-sm text-gray-900">Date: {todayStr} &nbsp;|&nbsp; Prepared by: Sushan Karki</p>
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
                  <p className="text-sm text-gray-900">No routine checkups were submitted for this shift.</p>
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
                    <table className="w-full text-sm text-left border-collapse mb-4">
                      <thead>
                        <tr className="border-b border-gray-900 ">
                          <th className="py-2 px-3 font-semibold text-gray-900 w-1/4">Staff</th>
                          <th className="py-2 px-3 font-semibold text-gray-900">Cycle IDs</th>
                          <th className="py-2 px-3 font-semibold text-gray-900 text-right w-16">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routineStaff.map(staff => (
                          <tr key={staff} className="border-b border-gray-100">
                            <td className="py-2 px-3 font-medium text-gray-900">{staff}</td>
                            <td className="py-2 px-3 text-gray-900 text-xs">{cycleIds(data.routine[staff] || [])}</td>
                            <td className="py-2 px-3 text-right font-bold text-gray-900">{(data.routine[staff] || []).length}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-900 ">
                          <td className="py-2 px-3 font-bold text-gray-900">Grand Total</td>
                          <td></td>
                          <td className="py-2 px-3 text-right font-bold text-gray-900">
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
                  <p className="text-sm text-gray-900">No pre-task cross checks were submitted for this shift.</p>
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
                      <table className="w-full text-sm text-left border-collapse mb-2">
                        <thead>
                          <tr className="border-b border-gray-900">
                            <th className="py-2 px-3 font-semibold text-gray-900 w-20">Cycle</th>
                            <th className="py-2 px-3 font-semibold text-gray-900 w-24">Condition</th>
                            <th className="py-2 px-3 font-semibold text-gray-900">Parts Checked / Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr key={i} className="border-b border-gray-100">
                              <td className="py-2 px-3 font-bold text-gray-900">{row.cycle_id}</td>
                              <td className="py-2 px-3 text-gray-900">{row.condition === 'issue' ? 'Issue' : 'Good'}</td>
                              <td className="py-2 px-3 text-gray-900">{row.issue || row.parts_checked || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                    <table className="w-full text-sm text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-900">
                          <th className="py-2 px-3 font-semibold text-gray-900 w-20">Cycle</th>
                          <th className="py-2 px-3 font-semibold text-gray-900 w-24">Battery</th>
                          <th className="py-2 px-3 font-semibold text-gray-900">Condition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallRows.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2 px-3 font-bold text-gray-900">{row.cycle_id}</td>
                            <td className="py-2 px-3 text-gray-900">{row.battery_id || '—'}</td>
                            <td className="py-2 px-3 text-gray-900">{row.condition === 'issue' ? 'Issue' : 'Good'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              {/* Section 5: Station Visit */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">5. Station Visit</h3>
                {stationRows.length === 0 ? (
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{overrides.station || `No station visit was submitted today. The assigned staff member is ${data.station.staff}.`}</p>
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
                    <p className="text-xs text-gray-900">{cycleIds(stationRows)}</p>
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
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-900 ">
                      <th className="py-2 px-3 font-semibold text-gray-900 w-20">Cycle ID</th>
                      <th className="py-2 px-3 font-semibold text-gray-900 w-24">Staff</th>
                      <th className="py-2 px-3 font-semibold text-gray-900">Repair / Fix Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenance.length === 0 ? (
                      <tr><td colSpan="3" className="py-4 px-3 text-gray-900 italic">No repairs recorded for this shift.</td></tr>
                    ) : (
                      maintenance.map((m, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-2 px-3 font-bold text-gray-900">{m.cycleId}</td>
                          <td className="py-2 px-3 text-gray-900">{m.staffName || '—'}</td>
                          <td className="py-2 px-3 text-gray-900">{m.fix}</td>
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
    </div>
  );
}
