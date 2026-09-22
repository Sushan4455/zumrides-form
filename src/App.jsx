import React, { useState } from "react";
import { ClipboardList, Wrench } from "lucide-react";
import TaskForm from "./components/TaskForm";
import AdminDashboard from "./components/AdminDashboard";
import { getDailyAssignments } from "./utils";

function App() {
  const [selectedTask, setSelectedTask] = useState(null);
  const [staffName, setStaffName] = useState('');
  const dailyAssignments = getDailyAssignments();

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
        <div className="w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          <TaskForm taskType={selectedTask} staffName={staffName} onBack={() => setSelectedTask(null)} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 flex items-center justify-center">
      <section className="w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8 md:p-10">
        <div className="flex flex-col gap-8 sm:gap-10">
          <h1 className="text-2xl font-semibold text-center text-gray-900 sm:text-3xl">Zum Operations</h1>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-3 sm:text-base">Your Name</label>
            <select value={staffName} onChange={(e) => setStaffName(e.target.value)} className="w-full rounded-2xl bg-gray-100 px-5 py-4 text-base font-medium text-gray-900 border-none outline-none appearance-none focus:ring-2 focus:ring-black sm:py-5">
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
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            <button onClick={() => { if(!staffName) return alert('Select staff name first!'); setSelectedTask('routine'); }} className="min-h-28 rounded-2xl bg-gray-100 p-4 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] flex flex-col items-center justify-center gap-3 sm:min-h-32 sm:p-6">
              <ClipboardList size={24} /> <span>Routine</span>
            </button>
            <button onClick={() => { if(!staffName) return alert('Select staff name first!'); setSelectedTask('pretask'); }} className="min-h-28 rounded-2xl bg-gray-100 p-4 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] flex flex-col items-center justify-center gap-3 sm:min-h-32 sm:p-6">
              <ClipboardList size={24} /> <span>Pre-Task</span>
            </button>
            <button disabled={!dailyAssignments.isWorkingDay} onClick={() => openAssignedTask('overall', dailyAssignments.overall)} className="min-h-28 rounded-2xl bg-gray-100 p-4 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-100 flex flex-col items-center justify-center gap-2 sm:min-h-32 sm:p-6">
              <ClipboardList size={24} /> <span>Overall</span>
              <span className="text-xs font-medium text-gray-500">{dailyAssignments.isWorkingDay ? `${dailyAssignments.overall} today` : 'No Saturday assignment'}</span>
            </button>
            <button disabled={!dailyAssignments.isWorkingDay} onClick={() => openAssignedTask('station', dailyAssignments.station)} className="min-h-28 rounded-2xl bg-gray-100 p-4 text-gray-900 border-none transition hover:bg-gray-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-100 flex flex-col items-center justify-center gap-2 sm:min-h-32 sm:p-6">
              <ClipboardList size={24} /> <span>Station</span>
              <span className="text-xs font-medium text-gray-500">{dailyAssignments.isWorkingDay ? `${dailyAssignments.station} today` : 'No Saturday assignment'}</span>
            </button>
            <button onClick={() => { if(!staffName) return alert('Select staff name first!'); setSelectedTask('maintenance'); }} className="col-span-2 mt-2 min-h-14 rounded-full bg-gray-900 px-5 py-4 text-white border-none transition hover:bg-black active:scale-[0.99] flex items-center justify-center gap-3 sm:mt-3 sm:min-h-16">
              <Wrench size={20} /> <span>Maintenance</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
