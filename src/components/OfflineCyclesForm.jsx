import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, Radio, RefreshCw, WifiOff } from 'lucide-react';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 10;

export default function OfflineCyclesForm({ staffName, onBack }) {
  const [cycles, setCycles] = useState([]);
  const [total, setTotal] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingCycle, setSavingCycle] = useState('');
  const [error, setError] = useState('');
  const [isLive, setIsLive] = useState(false);

  const loadCycles = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');

    const [queueResult, allResult] = await Promise.all([
      supabase
        .from('offline_cycles')
        .select('*')
        .eq('completed', false)
        .order('sort_order', { ascending: true })
        .limit(PAGE_SIZE),
      supabase
        .from('offline_cycles')
        .select('completed'),
    ]);

    if (queueResult.error || allResult.error) {
      setError(queueResult.error?.message || allResult.error?.message || 'Unable to load cycles.');
    } else {
      setCycles(queueResult.data || []);
      setTotal(allResult.data?.length || 0);
      setCompleted(allResult.data?.filter((cycle) => cycle.completed).length || 0);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadCycles();

    const channel = supabase
      .channel('offline-cycles-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'offline_cycles' },
        () => loadCycles({ quiet: true }),
      )
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCycles]);

  const markComplete = async (cycleNumber) => {
    if (savingCycle) return;
    setSavingCycle(cycleNumber);
    setError('');

    const { data, error: updateError } = await supabase
      .from('offline_cycles')
      .update({
        completed: true,
        completed_by: staffName.trim(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('cycle_number', cycleNumber)
      .eq('completed', false)
      .select('cycle_number');

    if (updateError) {
      setError(updateError.message);
    } else if (!data?.length) {
      setError(`${cycleNumber} was already completed by another staff member.`);
    }

    await loadCycles({ quiet: true });
    setSavingCycle('');
  };

  const progress = total ? Math.round((completed / total) * 100) : 0;

  return (
    <section className="w-full" aria-live="polite">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200"
          aria-label="Back to forms"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Offline Cycles</h2>
          <p className="mt-0.5 text-sm text-gray-500">Live work queue for {staffName}</p>
        </div>
        <div className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          <Radio size={13} /> {isLive ? 'Live' : 'Connecting'}
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-gray-100 p-4">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Progress</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{completed}<span className="text-base font-medium text-gray-400"> / {total}</span></p>
          </div>
          <span className="text-sm font-semibold text-gray-700">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-gray-900 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-gray-700">Next {Math.min(PAGE_SIZE, cycles.length)} cycles</p>
        <button type="button" onClick={() => loadCycles()} className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">Unable to load the work queue. Please ask the administrator to finish the Supabase setup.</p>}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-gray-500"><LoaderCircle className="animate-spin" size={26} /></div>
      ) : error ? null : cycles.length ? (
        <div className="space-y-2.5">
          {cycles.map((cycle) => {
            const isSaving = savingCycle === cycle.cycle_number;
            return (
              <div key={cycle.cycle_number} className="flex min-h-20 items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
                  <WifiOff size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900">{cycle.cycle_number}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cycle.status === 'OFFLINE' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                    {cycle.status}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => markComplete(cycle.cycle_number)}
                  disabled={Boolean(savingCycle)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white transition hover:bg-black active:scale-95 disabled:cursor-wait disabled:opacity-50"
                  aria-label={`Mark ${cycle.cycle_number} complete`}
                >
                  {isSaving ? <LoaderCircle className="animate-spin" size={21} /> : <Check size={22} strokeWidth={3} />}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-emerald-50 px-5 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={26} /></div>
          <p className="font-semibold text-emerald-900">All cycles completed</p>
          <p className="mt-1 text-sm text-emerald-700">There are no offline cycles left in the queue.</p>
        </div>
      )}

      {cycles.length > 0 && total - completed > PAGE_SIZE && (
        <p className="mt-4 text-center text-xs text-gray-400">The next cycles appear automatically as these are completed.</p>
      )}
    </section>
  );
}
