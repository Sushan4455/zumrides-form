import React, { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function FeedbackForm({ staffName, onBack }) {
  const [cycleId, setCycleId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const cleanedCycleId = cycleId.trim();
    const cleanedFeedback = feedback.trim();
    if (!staffName.trim() || !cleanedCycleId || !cleanedFeedback) {
      setSaveError('Please enter a cycle ID and feedback.');
      return;
    }

    setIsSubmitting(true);
    setSaveMsg('');
    setSaveError('');
    try {
      // Save to Supabase
      const { error } = await supabase.from('cycle_feedback').insert({
        staff_name: staffName.trim(),
        cycle_id: cleanedCycleId,
        feedback: cleanedFeedback,
      });
      if (error) throw error;
      
      // Save to Google Sheets silently in the background
      const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbydh5t8duV6t8MItonvFJ2nxYtSjyE-PApwKdf-PTaB52NNgtymi-7S4kNf29ao22oF/exec';
      
      const payload = {
        feedback: [{
          staff_name: staffName.trim(),
          cycle_id: cleanedCycleId,
          feedback: cleanedFeedback
        }]
      };
      
      fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.error('Failed to save to Google Sheets:', err));

      setCycleId('');
      setFeedback('');
      setSaveMsg('Feedback saved successfully!');
    } catch (error) {
      console.error('Unable to save cycle feedback:', error);
      setSaveError('Could not save feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      <div className="mb-6">
        <h2 className="text-2xl text-gray-900">Feedback Form</h2>
        <p className="text-gray-500 mt-1">Staff: {staffName}</p>
      </div>
      <div className="w-full h-px bg-gray-900 mb-6" />
      <div className="mb-4">
        <label htmlFor="feedback-cycle-id" className="block text-sm text-gray-500 mb-1">Cycle ID</label>
        <input id="feedback-cycle-id" required type="text" maxLength={50} value={cycleId}
          onChange={(event) => setCycleId(event.target.value)} placeholder="e.g. 101"
          className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" />
      </div>
      <div className="mb-4">
        <label htmlFor="cycle-feedback" className="block text-sm text-gray-500 mb-1">Feedback</label>
        <textarea id="cycle-feedback" required rows={5} maxLength={2000} value={feedback}
          onChange={(event) => setFeedback(event.target.value)} placeholder="Write your feedback about this cycle..."
          className="w-full p-4 rounded-xl bg-gray-100 border-none outline-none focus:ring-2 focus:ring-black text-gray-900" />
      </div>
      <div className="flex justify-end gap-3 mt-8 border-t border-gray-100 pt-6">
        <button type="button" onClick={onBack} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition">Back</button>
        <button type="button" onClick={() => { setCycleId(''); setFeedback(''); setSaveMsg(''); setSaveError(''); }} className="px-5 py-2.5 bg-red-50 text-red-600 rounded-full text-sm font-medium hover:bg-red-100 transition">Clear</button>
        <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-black transition shadow-sm disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save'}</button>
      </div>
      {saveMsg && <div role="status" className="mt-5 flex justify-center"><span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-full text-sm font-medium shadow-sm"><Check size={16} className="text-green-400" />{saveMsg}</span></div>}
      {saveError && <div role="alert" className="mt-5 flex justify-center"><span className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-700 rounded-full text-sm font-medium border border-red-200"><AlertCircle size={16} />{saveError}</span></div>}
    </form>
  );
}
