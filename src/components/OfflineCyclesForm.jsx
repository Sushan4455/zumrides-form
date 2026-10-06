import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, MessageSquare, Radio, RefreshCw, Search, Undo2, WifiOff, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function OfflineCyclesForm({ staffName, onBack }) {
  const [cycles, setCycles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingCycle, setSavingCycle] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [issueCycle, setIssueCycle] = useState('');
  const [issueText, setIssueText] = useState('');

  const loadCycles = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');

    const { data, error: loadError } = await supabase
      .from('offline_cycles')
      .select('*')
      .order('sort_order', { ascending: true });

    if (loadError) {
      setError(loadError.message || 'Unable to load cycles.');
    } else {
      setCycles(data || []);
      setTotal(data?.length || 0);
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
        (payload) => {
          const changedCycle = payload.new;

          if (payload.eventType === 'INSERT') {
            setTotal((current) => current + 1);
          } else if (payload.eventType === 'DELETE') {
            setTotal((current) => Math.max(0, current - 1));
          }

          setCycles((current) => {
            const withoutChangedCycle = current.filter(
              (cycle) => cycle.cycle_number !== (changedCycle?.cycle_number || payload.old?.cycle_number),
            );
            if (!changedCycle) return withoutChangedCycle;
            return [...withoutChangedCycle, changedCycle].sort((a, b) => a.sort_order - b.sort_order);
          });
        },
      )
      .subscribe((status) => {
        const connected = status === 'SUBSCRIBED';
        setIsLive(connected);
        if (connected) loadCycles({ quiet: true });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCycles]);

  const setCycleOnline = async (cycleNumber, online) => {
    if (savingCycle) return;
    setSavingCycle(cycleNumber);
    setError('');
    setNotice('');

    // Update this screen before the network response. The realtime event does
    // the same for every other connected user without an additional fetch.
    setCycles((current) => current.map((cycle) => (
      cycle.cycle_number === cycleNumber
        ? {
          ...cycle,
          completed: online,
          completed_by: online ? staffName.trim() : null,
          completed_at: online ? new Date().toISOString() : null,
        }
        : cycle
    )));

    const { data, error: updateError } = await supabase
      .from('offline_cycles')
      .update({
        completed: online,
        completed_by: online ? staffName.trim() : null,
        completed_at: online ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('cycle_number', cycleNumber)
      .eq('completed', !online)
      .select('cycle_number');

    if (updateError) {
      setError(updateError.message);
      await loadCycles({ quiet: true });
    } else if (!data?.length) {
      setNotice(`${cycleNumber} was already updated by another staff member.`);
      await loadCycles({ quiet: true });
    }

    setSavingCycle('');
  };

  const openIssueEditor = (cycle) => {
    setIssueCycle(cycle.cycle_number);
    setIssueText(cycle.issue || '');
    setNotice('');
  };

  const saveIssue = async (cycleNumber) => {
    if (savingCycle) return;
    setSavingCycle(cycleNumber);
    setError('');

    const cleanedIssue = issueText.trim();
    setCycles((current) => current.map((cycle) => (
      cycle.cycle_number === cycleNumber ? { ...cycle, issue: cleanedIssue } : cycle
    )));

    const { error: updateError } = await supabase
      .from('offline_cycles')
      .update({ issue: cleanedIssue || null, updated_at: new Date().toISOString() })
      .eq('cycle_number', cycleNumber);

    if (updateError) {
      setError(updateError.message);
      await loadCycles({ quiet: true });
    } else {
      setIssueCycle('');
      setIssueText('');
    }
    setSavingCycle('');
  };

  const completed = cycles.filter((cycle) => cycle.completed).length;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleCycles = cycles.filter((cycle) => (
    (filter === 'all' || (filter === 'online' ? cycle.completed : !cycle.completed))
    && (
      !normalizedSearch
      || cycle.cycle_number.toLowerCase().includes(normalizedSearch)
      || cycle.status.toLowerCase().includes(normalizedSearch)
      || (cycle.issue || '').toLowerCase().includes(normalizedSearch)
      || (cycle.completed_by || '').toLowerCase().includes(normalizedSearch)
      || (cycle.completed ? 'online checked' : 'offline pending').includes(normalizedSearch)
    )
  ));
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

      <div className="mb-5 rounded-2xl bg-gray-100 p-4">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cycles Online</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{completed}<span className="text-base font-medium text-gray-400"> / {total}</span></p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-700">{progress}%</p>
            <p className="mt-0.5 text-xs text-gray-500">{Math.max(0, total - completed)} remaining</p>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search cycle number or status..."
          className="w-full rounded-2xl border-0 bg-gray-100 py-3.5 pl-11 pr-4 text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-gray-100 p-1.5">
        {[
          { key: 'all', label: `All ${total}` },
          { key: 'online', label: `Online ${completed}` },
          { key: 'offline', label: `Remaining ${Math.max(0, total - completed)}` },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition ${filter === option.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-gray-700">{visibleCycles.length} {visibleCycles.length === 1 ? 'cycle' : 'cycles'}</p>
        <button type="button" onClick={() => loadCycles()} className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">Unable to load the work queue. Please ask the administrator to finish the Supabase setup.</p>}
      {notice && <p className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">{notice}</p>}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-gray-500"><LoaderCircle className="animate-spin" size={26} /></div>
      ) : visibleCycles.length ? (
        <div className="space-y-2.5">
          {visibleCycles.map((cycle) => {
            const isSaving = savingCycle === cycle.cycle_number;
            return (
              <div key={cycle.cycle_number} className={`rounded-2xl px-4 py-3 shadow-sm ring-1 transition ${cycle.completed ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-gray-200'}`}>
                <div className="flex min-h-14 items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cycle.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                    {cycle.completed ? <Check size={21} strokeWidth={3} /> : <WifiOff size={20} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900">{cycle.cycle_number}</p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cycle.completed ? 'bg-emerald-100 text-emerald-700' : cycle.status === 'OFFLINE' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                      {cycle.completed ? 'ONLINE' : cycle.status}
                    </span>
                    {cycle.completed && cycle.completed_by && <p className="mt-1 truncate text-[11px] text-gray-500">Checked by {cycle.completed_by}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => openIssueEditor(cycle)}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${cycle.issue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    aria-label={`${cycle.issue ? 'Edit' : 'Add'} issue for ${cycle.cycle_number}`}
                  >
                    <MessageSquare size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCycleOnline(cycle.cycle_number, !cycle.completed)}
                    disabled={Boolean(savingCycle)}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition active:scale-95 disabled:cursor-wait disabled:opacity-50 ${cycle.completed ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-gray-900 hover:bg-black'}`}
                    aria-label={cycle.completed ? `Uncheck ${cycle.cycle_number}` : `Mark ${cycle.cycle_number} online`}
                  >
                    {isSaving ? <LoaderCircle className="animate-spin" size={20} /> : cycle.completed ? <Undo2 size={18} /> : <Check size={21} strokeWidth={3} />}
                  </button>
                </div>

                {cycle.issue && issueCycle !== cycle.cycle_number && (
                  <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><span className="font-semibold">Issue:</span> {cycle.issue}</div>
                )}

                {issueCycle === cycle.cycle_number && (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600">Issue / note</label>
                    <textarea
                      value={issueText}
                      onChange={(event) => setIssueText(event.target.value)}
                      placeholder="Describe the issue with this cycle..."
                      rows={3}
                      autoFocus
                      className="w-full resize-none rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-gray-900"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => { setIssueCycle(''); setIssueText(''); }} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100"><X size={14} /> Cancel</button>
                      <button type="button" onClick={() => saveIssue(cycle.cycle_number)} disabled={Boolean(savingCycle)} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Save issue</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : error ? null : (
        <div className="rounded-2xl bg-emerald-50 px-5 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={26} /></div>
          <p className="font-semibold text-emerald-900">No cycles found</p>
          <p className="mt-1 text-sm text-emerald-700">Try a different cycle number or status.</p>
        </div>
      )}
    </section>
  );
}
