import React, { useState, useEffect } from "react";
import { ClipboardList, Wrench } from "lucide-react";
import TaskForm from "./components/TaskForm";
import AdminDashboard from "./components/AdminDashboard";
import { getDailyAssignments } from "./utils";
import { supabase } from "./supabaseClient";

function App() {
  const [selectedTask, setSelectedTask] = useState(null);
  const [staffName, setStaffName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [postponements, setPostponements] = useState({ station: [], overall: [] });

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

  if (selectedTask && staffName) {
    return (
      <main className="min-h-[100dvh] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 flex justify-center">
        <div className="w-full max-w-md bg-transparent py-2 sm:py-4">
          <TaskForm taskType={selectedTask} staffName={staffName} onBack={() => setSelectedTask(null)} />
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
            <select 
              value={staffName} 
              onChange={(e) => { setStaffName(e.target.value); setNameError(false); }} 
              className={`w-full rounded-xl bg-gray-100 px-4 py-4 text-base font-medium text-gray-900 outline-none appearance-none focus:ring-2 focus:ring-black ${nameError ? 'border border-red-500' : 'border-none'}`}
            >
              <option value="" disabled>Enter your name...</option>
              <optgroup label="Operations Team">
                <option value="Kabir">Kabir</option>
                <option value="Laxman">Laxman</option>
                <option value="Anish">Anish</option>
                <option value="Surya">Surya</option>
              </optgroup>
              <optgroup label="Maintenance Team">
                <option value="Ram">Ram</option>
                <option value="Kiran">Kiran</option>
                <option value="Dipesh">Dipesh</option>
              </optgroup>
            </select>
            {nameError && <p className="text-red-500 text-sm mt-2 font-medium">Please select your name first!</p>}
          </div>

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
            <button onClick={() => { if(!staffName) return setNameError(true); setSelectedTask('maintenance'); }} className="col-span-2 mt-1 min-h-12 rounded-full bg-gray-900 px-5 py-3.5 text-white border-none transition hover:bg-black active:scale-[0.99] flex items-center justify-center gap-2 sm:mt-2 sm:min-h-14">
              <Wrench size={20} /> <span>Maintenance</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
