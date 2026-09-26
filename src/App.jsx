import React, { useState, useEffect } from "react";
import { ClipboardList, MessageSquare, Wrench } from "lucide-react";
import TaskForm from "./components/TaskForm";
import FeedbackForm from "./components/FeedbackForm";
import AdminDashboard from "./components/AdminDashboard";
import { getDailyAssignments } from "./utils";
import { supabase } from "./supabaseClient";

function App() {
  const [selectedTask, setSelectedTask] = useState(() => localStorage.getItem('zum_selectedTask') || null);
  const [staffName, setStaffName] = useState(() => localStorage.getItem('zum_staffName') || '');
  const [nameError, setNameError] = useState(false);
  const [postponements, setPostponements] = useState({ station: [], overall: [] });

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
            setPostponements({ station: st, overall: ov });
          }
        } catch (e) {
          console.log('Error fetching postponements:', e);
        }
      };
      fetchPostponements();
    }
  }, []);

  const dailyAssignments = getDailyAssignments(new Date(), postponements);

  const openAssignedTask = (taskType, assignedStaff) => {
    if (!assignedStaff) return;
    setStaffName(assignedStaff);
    setSelectedTask(taskType);
  };
  
  if (window.location.pathname === '/admin') {
      return <AdminDashboard />;
  }

  if (selectedTask && (staffName || selectedTask === 'home_cycle')) {
    return (
      <main className="min-h-[100dvh] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 flex justify-center">
        <div className="w-full max-w-md bg-transparent py-2 sm:py-4">
          {selectedTask === 'feedback' ? (
            <FeedbackForm staffName={staffName} onBack={() => setSelectedTask(null)} />
          ) : (
            <TaskForm taskType={selectedTask} staffName={staffName} onBack={() => setSelectedTask(null)} />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 flex items-center justify-center">
      <section className="w-full max-w-md bg-transparent">
        <div className="flex flex-col gap-6 sm:gap-8">
          <h1 className="text-2xl font-semibold text-center text-gray-900">Zum Operations</h1>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-2">Your Name</label>
            <input 
              type="text"
              list="staff-names"
              placeholder="Select or type your name..."
              value={staffName} 
              onChange={(e) => { setStaffName(e.target.value); setNameError(false); }} 
              className={`w-full rounded-xl bg-gray-100 px-4 py-4 text-base font-medium text-gray-900 outline-none focus:ring-2 focus:ring-black ${nameError ? 'border border-red-500' : 'border-none'}`}
            />
            <datalist id="staff-names">
              <option value="Kabir" />
              <option value="Laxman" />
              <option value="Anish" />
              <option value="Surya" />
              <option value="Ram" />
              <option value="Kiran" />
              <option value="Dipesh" />
              <option value="Sandesh" />
            </datalist>
            {nameError && <p className="text-red-500 text-sm mt-2 font-medium">Please select or type your name first!</p>}
          </div>

          <div className="space-y-6">
            
            {/* Section 1: Tasks */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">Inspections & Checkups</h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button onClick={() => { if(!staffName) return setNameError(true); setSelectedTask('routine'); }} className="min-h-24 rounded-2xl bg-gray-100 p-4 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] flex flex-col items-center justify-center gap-2 sm:min-h-28 sm:p-5">
                  <ClipboardList size={24} /> <span>Routine</span>
                </button>
                <button onClick={() => { if(!staffName) return setNameError(true); setSelectedTask('pretask'); }} className="min-h-24 rounded-2xl bg-gray-100 p-4 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] flex flex-col items-center justify-center gap-2 sm:min-h-28 sm:p-5">
                  <ClipboardList size={24} /> <span>Pre-Task</span>
                </button>
                <button disabled={!dailyAssignments.isWorkingDay} onClick={() => openAssignedTask('overall', dailyAssignments.overall)} className="min-h-24 rounded-2xl bg-gray-100 p-4 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-100 flex flex-col items-center justify-center gap-1.5 sm:min-h-28 sm:p-5">
                  <ClipboardList size={24} /> <span>Overall</span>
                  <span className="text-xs font-medium text-gray-500">{dailyAssignments.isWorkingDay ? `${dailyAssignments.overall} today` : 'No Saturday assignment'}</span>
                </button>
                <button disabled={!dailyAssignments.isWorkingDay} onClick={() => openAssignedTask('station', dailyAssignments.station)} className="min-h-24 rounded-2xl bg-gray-100 p-4 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-100 flex flex-col items-center justify-center gap-1.5 sm:min-h-28 sm:p-5">
                  <ClipboardList size={24} /> <span>Station</span>
                  <span className="text-xs font-medium text-gray-500">{dailyAssignments.isWorkingDay ? `${dailyAssignments.station} today` : 'No Saturday assignment'}</span>
                </button>
              </div>
            </div>

            {/* Section 2: Operations */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button onClick={() => { if(!staffName) return setNameError(true); setSelectedTask('battery_swap'); }} className="min-h-16 rounded-2xl bg-blue-50 text-blue-700 font-semibold border-none transition hover:bg-blue-100 active:scale-[0.98] flex flex-col items-center justify-center gap-1.5 p-3">
                  <ClipboardList size={22} /> <span className="text-sm">Battery Swap</span>
                </button>
                <button onClick={() => { if(!staffName) return setNameError(true); setSelectedTask('home_cycle'); }} className="min-h-16 rounded-2xl bg-indigo-50 text-indigo-700 font-semibold border-none transition hover:bg-indigo-100 active:scale-[0.98] flex flex-col items-center justify-center gap-1.5 p-3">
                  <ClipboardList size={22} /> <span className="text-sm">Home Cycle</span>
                </button>
              </div>
            </div>

            {/* Section 3: Maintenance */}
            <div>
              <button onClick={() => { if (!staffName.trim()) return setNameError(true); setSelectedTask('feedback'); }} className="w-full min-h-14 rounded-2xl bg-gray-100 px-5 py-4 text-gray-900 font-semibold border-none transition hover:bg-gray-200 active:scale-[0.99] flex items-center justify-center gap-2">
                <MessageSquare size={20} /> <span>Cycle Feedback</span>
              </button>
            </div>

            <div className="pt-2">
              <button onClick={() => { if(!staffName) return setNameError(true); setSelectedTask('maintenance'); }} className="w-full min-h-14 rounded-2xl bg-gray-900 px-5 py-4 text-white font-semibold border-none transition hover:bg-black active:scale-[0.99] flex items-center justify-center gap-2">
                <Wrench size={20} /> <span>Maintenance</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
