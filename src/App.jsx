import React, { useState, useEffect } from "react";
import { ClipboardList, MessageSquare, WifiOff } from "lucide-react";
import TaskForm from "./components/TaskForm";
import FeedbackForm from "./components/FeedbackForm";
import OfflineCyclesForm from "./components/OfflineCyclesForm";
import AdminDashboard from "./components/AdminDashboard";
import { supabase } from "./supabaseClient";
import { getCurrentShiftWindow } from "./utils";

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';

function App() {
  const [selectedTask, setSelectedTask] = useState(() => localStorage.getItem('zum_selectedTask') || null);
  const [staffName, setStaffName] = useState(() => localStorage.getItem('zum_staffName') || '');
  const [nameError, setNameError] = useState(false);
  const [postponements, setPostponements] = useState({ station: [], overall: [], manualStation: {}, manualOverall: {} });
  const [hiddenForms, setHiddenForms] = useState({});
  const [allAssignments, setAllAssignments] = useState(() => {
    try {
      const raw = localStorage.getItem('zum_assignments_latest');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (selectedTask) localStorage.setItem('zum_selectedTask', selectedTask);
    else localStorage.removeItem('zum_selectedTask');
  }, [selectedTask]);

  useEffect(() => {
    if (staffName) localStorage.setItem('zum_staffName', staffName);
  }, [staffName]);


  useEffect(() => {
    // Only fetch for non-admin to avoid double fetching since AdminDashboard handles itself
    if (window.location.pathname !== '/admin') {
      const fetchPostponements = async () => {
        try {
          const { data, error } = await supabase.from('schedule_overrides').select('*');
          if (error && error.code !== '42P01') throw error;
          if (data) {
            const st = data.filter(d => d.type === 'station').map(d => d.date_key);
            const ov = data.filter(d => d.type === 'overall').map(d => d.date_key);
            
            const manualSt = {};
            const manualOv = {};
            data.forEach(d => {
              if (d.type.startsWith('station:')) manualSt[d.date_key] = d.type.split(':')[1];
              if (d.type.startsWith('overall:')) manualOv[d.date_key] = d.type.split(':')[1];
            });
            const hiddenMap = {};
            data.forEach(d => {
              if (d.date_key === 'GLOBAL' && d.type.startsWith('setting:hide_')) {
                hiddenMap[d.type.split('setting:hide_')[1]] = true;
              }
            });
            setHiddenForms(hiddenMap);
            setPostponements({ station: st, overall: ov, manualStation: manualSt, manualOverall: manualOv });
          }
        } catch (e) {
          console.log('Error fetching postponements:', e);
        }
      };

      const fetchAssignmentsForHome = async () => {
        let merged = {};
        try {
          const raw = localStorage.getItem('zum_assignments_latest');
          if (raw) merged = { ...JSON.parse(raw) };
        } catch (e) {}

        // 1. Fetch from Google Sheets Assignments tab (works across devices even when Supabase is paused)
        try {
          const res = await fetch(APPS_SCRIPT_URL);
          const json = await res.json();
          if (json && json.assignments && typeof json.assignments === 'object') {
            Object.entries(json.assignments).forEach(([sName, cList]) => {
              const str = Array.isArray(cList) ? cList.join(', ') : String(cList || '');
              if (str.trim() && !merged[sName]) {
                merged[sName] = str;
              }
            });
          }
        } catch (e) {}

        // 2. Fetch from Supabase assignments table for current shift
        try {
          const { start, end } = getCurrentShiftWindow();
          const { data: assignData } = await supabase
            .from('assignments')
            .select('staff_name, cycles')
            .gte('created_at', start)
            .lt('created_at', end)
            .order('created_at', { ascending: false });
          if (assignData && assignData.length > 0) {
            assignData.forEach(row => {
              if (row.staff_name && row.cycles) {
                merged[row.staff_name] = row.cycles;
              }
            });
          }
        } catch (e) {}

        setAllAssignments(merged);
        try {
          localStorage.setItem('zum_assignments_latest', JSON.stringify(merged));
        } catch (e) {}
      };

      fetchPostponements();
      fetchAssignmentsForHome();
    }
  }, []);

  if (window.location.pathname === '/admin') {
      return <AdminDashboard />;
  }

  if (selectedTask && (staffName || selectedTask === 'home_cycle')) {
    return (
      <main className="min-h-[100dvh] bg-gray-50 px-3 py-4 sm:px-6 sm:py-12 flex justify-center">
        <div className="w-full max-w-md bg-transparent py-1 sm:py-4">
          {selectedTask === 'feedback' ? (
            <FeedbackForm staffName={staffName} onBack={() => setSelectedTask(null)} />
          ) : selectedTask === 'offline_cycles' ? (
            <OfflineCyclesForm staffName={staffName} onBack={() => setSelectedTask(null)} />
          ) : (
            <TaskForm taskType={selectedTask} staffName={staffName} onBack={() => setSelectedTask(null)} />
          )}
        </div>
      </main>
    );
  }

  const inspectionForms = [
    { key: 'routine', label: 'Routine', icon: ClipboardList, task: 'routine' },
    { key: 'pretask', label: 'Check List', icon: ClipboardList, task: 'pretask' },
    { key: 'overall', label: 'Overall', icon: ClipboardList, task: 'overall' },
    { key: 'maintenance', label: 'Maintenance', icon: ClipboardList, task: 'maintenance' },
    { key: 'battery_swap', label: 'Standard Battery Swap', icon: ClipboardList, task: 'battery_swap' },
    { key: 'home_battery_swap', label: 'Battery Swap', icon: ClipboardList, task: 'home_battery_swap' },
    { key: 'home_cycle', label: 'Home Cycle', icon: ClipboardList, task: 'home_cycle' },
    { key: 'battery_test', label: 'Battery Test', icon: ClipboardList, task: 'battery_test' },
  ].filter(form => !hiddenForms[form.key]);

  const toolForms = [
    { key: 'offline_cycles', label: 'Offline Cycles', icon: WifiOff, task: 'offline_cycles', isPrimary: true },
    { key: 'feedback', label: 'Cycle Feedback', icon: MessageSquare, task: 'feedback', isPrimary: false }
  ].filter(form => !hiddenForms[form.key]);

  const matchedStaffKey = Object.keys(allAssignments).find(
    k => k.trim().toLowerCase() === (staffName || '').trim().toLowerCase()
  );
  const myAssignedCycles = matchedStaffKey
    ? String(allAssignments[matchedStaffKey]).split(/[,;\s]+/).map(c => c.trim()).filter(Boolean)
    : [];
  const dynamicStaffSuggestions = Array.from(
    new Set([
      'Kabir', 'Laxman', 'Anish', 'Surya', 'Ram', 'Kiran', 'Dipesh', 'Sandesh',
      ...Object.keys(allAssignments)
    ])
  );

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-3 py-6 sm:px-6 sm:py-12 flex items-center justify-center">
      <section className="w-full max-w-md bg-transparent">
        <div className="flex flex-col gap-5 sm:gap-8">
          <h1 className="text-2xl font-semibold text-center text-gray-900">Zum Operations</h1>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-2">Your Name</label>
            <input 
              type="text"
              list="staff-names"
              placeholder="Select or type your name..."
              value={staffName} 
              onChange={(e) => { setStaffName(e.target.value); setNameError(false); }} 
              className={`w-full rounded-xl bg-gray-100 px-4 py-3.5 sm:py-4 text-base font-medium text-gray-900 outline-none focus:ring-2 focus:ring-black ${nameError ? 'border border-red-500' : 'border-none'}`}
            />
            <datalist id="staff-names">
              {dynamicStaffSuggestions.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {nameError && <p className="text-red-500 text-sm mt-2 font-medium">Please select or type your name first!</p>}

            {/* Live Assigned Cycles Preview as soon as Staff enters their name */}
            {staffName.trim() && myAssignedCycles.length > 0 && (
              <div className="mt-3 p-3.5 rounded-2xl bg-white border border-black/[0.08] flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-900">
                    Your Assigned Routine Cycles ({myAssignedCycles.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedTask('routine')}
                    className="px-3 py-1 bg-gray-900 hover:bg-black text-white rounded-full text-xs font-semibold transition"
                  >
                    Open Routine Form →
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {myAssignedCycles.map((cId, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-900 text-xs font-bold">
                      #{cId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5 sm:space-y-6">
            
            {/* Section 1: Tasks */}
            {inspectionForms.length > 0 && (
              <div className="space-y-2.5 sm:space-y-3">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">Inspections & Checkups</h2>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                  {inspectionForms.map((form, index) => {
                    const Icon = form.icon;
                    const isLastOdd = (inspectionForms.length % 2 !== 0) && (index === inspectionForms.length - 1);
                    return (
                      <button
                        key={form.key}
                        onClick={() => {
                          if (!staffName) return setNameError(true);
                          setSelectedTask(form.task);
                        }}
                        className={`min-h-20 sm:min-h-28 rounded-2xl bg-gray-100 p-3 sm:p-5 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] flex flex-col items-center justify-center gap-1.5 sm:gap-2 ${isLastOdd ? 'col-span-2' : 'col-span-1'}`}
                      >
                        <Icon size={22} className="shrink-0" /> <span className="text-center text-xs sm:text-sm font-medium">{form.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section 2: Tools & Feedback */}
            {toolForms.length > 0 && (
              <div className="space-y-2.5 sm:space-y-3">
                {toolForms.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={tool.key}
                      onClick={() => {
                        if (!staffName.trim()) return setNameError(true);
                        setSelectedTask(tool.task);
                      }}
                      className={tool.isPrimary 
                        ? "w-full min-h-12 sm:min-h-14 rounded-2xl bg-gray-900 px-4 sm:px-5 py-3.5 sm:py-4 text-white font-semibold border-none transition hover:bg-black active:scale-[0.99] flex items-center justify-center gap-2 text-sm sm:text-base"
                        : "w-full min-h-12 sm:min-h-14 rounded-2xl bg-gray-100 px-4 sm:px-5 py-3.5 sm:py-4 text-gray-900 font-semibold border-none transition hover:bg-gray-200 active:scale-[0.99] flex items-center justify-center gap-2 text-sm sm:text-base"
                      }
                    >
                      <Icon size={18} /> <span>{tool.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {inspectionForms.length === 0 && toolForms.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">
                No active forms available.
              </div>
            )}

          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
