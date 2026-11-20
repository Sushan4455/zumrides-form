import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Home, ClipboardList, Calendar, Users, FileText, Settings, Search, Plus, 
  Database, Wand2, Loader2, Eye, Trash2, Edit3, AlertTriangle, X, Filter, 
  Wrench, Menu, Bold, Italic, Underline, Type, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, RotateCcw, 
  Check, PlusCircle, MinusCircle, Sparkles, Table as TableIcon, ArrowUp, ArrowDown, ListFilter 
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getCurrentShiftWindow, getDailyAssignments, getLocalDateKey } from '../utils';
import {
  refineTextWithAI,
  refineReportParagraphsWithAI,
  analyzeReportAndGenerateSummariesWithAI,
  executeAICommand,
  getStoredGeminiApiKey,
  DEFAULT_GEMINI_API_KEY
} from '../utils/ai';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';

const INITIAL_DATA = {
  routine: {},
  pretask: {},
  overall: { staff: 'Not assigned today', cycles: [] },
  station: { staff: 'Not scheduled today', cycles: [] },
  maintenance: [],
  battery_swaps: [],
  home_cycles: [],
  battery_tests: []
};

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isLiveEditMode, setIsLiveEditMode] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [activeTab, setActiveTab] = useState('reports');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [reportLogo, setReportLogo] = useState(() => {
    const saved = localStorage.getItem('zum_report_logo');
    if (saved === 'NONE') return '';
    return saved || '/zum-favicon.png';
  });
  const [reportLogoSize, setReportLogoSize] = useState(() => localStorage.getItem('zum_report_logo_size') || '56');
  const [reportFontSize, setReportFontSize] = useState(() => localStorage.getItem('zum_report_font_size') || '14');
  const logoInputRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const undoStackRef = useRef([]);

  // Popup states for adding new title, multi-row/column table builder, and reordering titles
  const [showAddTitleModal, setShowAddTitleModal] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionContent, setNewSectionContent] = useState('');
  const [newSectionPlacement, setNewSectionPlacement] = useState('above_extra');
  const [includeTableInNewSection, setIncludeTableInNewSection] = useState(false);
  const [tableBuilderHeaders, setTableBuilderHeaders] = useState(['Column 1', 'Column 2', 'Column 3']);
  const [tableBuilderRows, setTableBuilderRows] = useState([
    ['', '', ''],
    ['', '', '']
  ]);
  const [reportSectionsSnapshot, setReportSectionsSnapshot] = useState([]);
  const [showReorderTitlesModal, setShowReorderTitlesModal] = useState(false);
  const lastClickedTableRef = useRef(null);
  const [activeTableBanner, setActiveTableBanner] = useState(null); // { sectionTitle, top }
  const [editingRecord, setEditingRecord] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [activeIssuesList, setActiveIssuesList] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const [aiCommand, setAiCommand] = useState('');
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    const saved = localStorage.getItem('zum_gemini_api_key');
    if (!saved || saved.startsWith('AQ.Ab8RN6Kfv')) {
      const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY || DEFAULT_GEMINI_API_KEY || '';
      if (fallbackKey) {
        try {
          localStorage.setItem('zum_gemini_api_key', fallbackKey);
        } catch (e) {}
      }
      return fallbackKey;
    }
    return saved;
  });
  const [geminiRefineStyle, setGeminiRefineStyle] = useState('professional'); // 'professional' | 'grammar' | 'concise'
  const [isRefiningEntireReport, setIsRefiningEntireReport] = useState(false);
  const [refiningSectionIdx, setRefiningSectionIdx] = useState(null);
  const [selectedTitleIdxToRefine, setSelectedTitleIdxToRefine] = useState(0);
  const [isAnalyzingSummaries, setIsAnalyzingSummaries] = useState(false);
  const [isRefiningNewSectionText, setIsRefiningNewSectionText] = useState(false);
  const [geminiStatusMsg, setGeminiStatusMsg] = useState('');
  
  const [assignStaff, setAssignStaff] = useState('');
  const [assignCycles, setAssignCycles] = useState('');
  const [assignmentRows, setAssignmentRows] = useState([{ id: Date.now(), staff: '', cycles: '' }]);
  const [editingAssignment, setEditingAssignment] = useState(null); // { originalStaff, staff, cycles }
  const [blankPaperText, setBlankPaperText] = useState(() => localStorage.getItem('zum_routine_blank_paper') || '');
  const [blankPaperSavedMsg, setBlankPaperSavedMsg] = useState('');
  const [assignMsg, setAssignMsg] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [currentAssignments, setCurrentAssignments] = useState(() => {
    try {
      const saved = localStorage.getItem('zum_assignments_latest');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [hiddenForms, setHiddenForms] = useState({});

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
  const [dataDateFilter, setDataDateFilter] = useState('');
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [postponements, setPostponements] = useState({ station: [], overall: [], manualStation: {}, manualOverall: {} });
  
  const [repairedIssuesData, setRepairedIssuesData] = useState([]);
  const [isLoadingRepairedIssues, setIsLoadingRepairedIssues] = useState(false);
  const [repairedSearch, setRepairedSearch] = useState('');

  // Formatting Data safely & Derived State (computed at top level so all hooks & effects can safely access them)
  const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  
  const routineStaff = useMemo(() => (data?.routine ? Object.keys(data.routine) : []), [data?.routine]);
  const pretaskStaff = useMemo(() => (data?.pretask ? Object.keys(data.pretask) : []), [data?.pretask]);
  const stationRows = useMemo(() => data?.station?.cycles || [], [data?.station?.cycles]);
  const overallRows = useMemo(() => data?.overall?.cycles || [], [data?.overall?.cycles]);
  const maintenance = useMemo(() => data?.maintenance || [], [data?.maintenance]);

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
  const routineIssueRows = routineStaff.flatMap(staff =>
    (data.routine[staff] || [])
      .filter(r => r.condition === 'issue')
      .map(r => ({ ...r, staff_name: r.staff_name || staff }))
  );
  const pretaskIssueRows = pretaskStaff.flatMap(staff =>
    (data.pretask[staff] || [])
      .filter(r => r.condition === 'issue')
      .map(r => ({ ...r, staff_name: r.staff_name || staff }))
  );
  const overallIssueRows = overallRows.filter(r => r.condition === 'issue');
  const stationIssueRows = stationRows.filter(r => r.condition === 'issue');
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

  const getPossibleTypes = (baseType) => [baseType, ...['Kabir', 'Laxman', 'Anish', 'Surya', 'Dipesh'].map(n => `${baseType}:${n}`)];

  const handlePostpone = async (dateStr, type) => {
    try {
      await supabase.from('schedule_overrides').delete().eq('date_key', dateStr).in('type', getPossibleTypes(type));
      const { error } = await supabase.from('schedule_overrides').insert([{ date_key: dateStr, type }]);
      if (error) throw error;
      fetchPostponements();
    } catch (e) {
      alert("Failed to postpone: " + e.message);
    }
  };

  const handleUndoPostpone = async (dateStr, type) => {
    try {
      const { error } = await supabase.from('schedule_overrides').delete().eq('date_key', dateStr).in('type', getPossibleTypes(type));
      if (error) throw error;
      fetchPostponements();
    } catch (e) {
      alert("Failed to undo postpone: " + e.message);
    }
  };

  const handleOverrideAssign = async (dateStr, baseType, newStaff) => {
    try {
      const { error: delError } = await supabase.from('schedule_overrides').delete().eq('date_key', dateStr).in('type', getPossibleTypes(baseType));
      if (delError) console.error("Del Error:", delError);
      
      if (newStaff) {
        const { error } = await supabase.from('schedule_overrides').insert([{ date_key: dateStr, type: `${baseType}:${newStaff}` }]);
        if (error) throw error;
      }
      fetchPostponements();
    } catch (e) {
      alert("Failed to override assignment: " + e.message);
    }
  };

  const handleToggleFormVisibility = async (formKey) => {
    try {
      const isHidden = hiddenForms[formKey];
      const settingKey = `setting:hide_${formKey}`;
      await supabase.from('schedule_overrides').delete().eq('date_key', 'GLOBAL').eq('type', settingKey);
      
      if (!isHidden) {
        await supabase.from('schedule_overrides').insert([{ date_key: 'GLOBAL', type: settingKey }]);
      }
      
      setHiddenForms(prev => ({...prev, [formKey]: !isHidden}));
    } catch (e) {
      alert("Failed to toggle visibility");
    }
  };

  const reportDateKey = getLocalDateKey(selectedDate);
  const dailyAssignments = getDailyAssignments(selectedDate, postponements);
  const overridesKey = `zum_report_overrides_${reportDateKey}`;

  const persistAssignments = async (updatedMap, entriesToSync = []) => {
    setCurrentAssignments(updatedMap);
    try {
      localStorage.setItem(`zum_assignments_${reportDateKey}`, JSON.stringify(updatedMap));
      localStorage.setItem('zum_assignments_latest', JSON.stringify(updatedMap));
    } catch (e) {}

    for (const entry of entriesToSync) {
      // 1. Save to Google Sheets (Always works even if Supabase is paused)
      try {
        const formData = new FormData();
        formData.append('data', JSON.stringify({
          action: 'assign',
          staffName: entry.staff,
          cycles: entry.cycles
        }));
        fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formData }).catch(() => {});
      } catch (e) {}

      // 2. Save to Supabase in background
      try {
        await supabase.from('assignments').insert({
          staff_name: entry.staff,
          cycles: entry.cycles
        });
      } catch (e) {}
    }
  };

  const handleBulkAssign = async (e) => {
    if (e) e.preventDefault();
    const validRows = assignmentRows.filter(r => r.staff.trim() && r.cycles.trim());
    if (validRows.length === 0) {
      alert("Please enter at least one staff name and cycle ID(s).");
      return;
    }

    setAssigning(true);
    setAssignMsg("");

    const updatedMap = { ...currentAssignments };
    const entriesToSync = [];

    validRows.forEach(row => {
      const staff = row.staff.trim();
      const newCyclesArr = row.cycles.split(/[,;\s]+/).map(c => c.trim()).filter(Boolean);
      const existingArr = updatedMap[staff]
        ? updatedMap[staff].split(',').map(c => c.trim()).filter(Boolean)
        : [];
      const merged = [...new Set([...existingArr, ...newCyclesArr])].join(', ');
      updatedMap[staff] = merged;
      entriesToSync.push({ staff, cycles: merged });
    });

    await persistAssignments(updatedMap, entriesToSync);
    setAssignmentRows([{ id: Date.now(), staff: '', cycles: '' }]);
    setAssignMsg(`✅ Assigned cycles to ${validRows.length} staff member(s)!`);
    setTimeout(() => setAssignMsg(''), 3500);
    setAssigning(false);
  };

  const handleSaveEditAssignment = async () => {
    if (!editingAssignment) return;
    const newStaff = editingAssignment.staff.trim();
    const newCycles = editingAssignment.cycles
      .split(/[,;\s]+/)
      .map(c => c.trim())
      .filter(Boolean)
      .join(', ');

    if (!newStaff) {
      alert("Staff name cannot be empty.");
      return;
    }

    const updatedMap = { ...currentAssignments };
    if (editingAssignment.originalStaff !== newStaff) {
      delete updatedMap[editingAssignment.originalStaff];
    }

    if (newCycles) {
      updatedMap[newStaff] = newCycles;
      await persistAssignments(updatedMap, [{ staff: newStaff, cycles: newCycles }]);
    } else {
      delete updatedMap[newStaff];
      await persistAssignments(updatedMap, []);
    }

    setEditingAssignment(null);
    setAssignMsg("✅ Assignment updated!");
    setTimeout(() => setAssignMsg(''), 2500);
  };

  const handleDeleteAssignment = async (staffName) => {
    const updatedMap = { ...currentAssignments };
    delete updatedMap[staffName];
    await persistAssignments(updatedMap, []);
  };

  const handleSaveBlankPaper = (newText) => {
    setBlankPaperText(newText);
    try {
      localStorage.setItem('zum_routine_blank_paper', newText);
    } catch (e) {}
    setBlankPaperSavedMsg('Saved');
    setTimeout(() => setBlankPaperSavedMsg(''), 1500);
  };

  const handleSyncBlankPaperToAssignments = async () => {
    if (!blankPaperText.trim()) {
      alert("Write lines like 'Name: 101, 55, 89' or 'Name - 101' on the blank paper first.");
      return;
    }

    const lines = blankPaperText.split('\n').map(l => l.trim()).filter(Boolean);
    const updatedMap = { ...currentAssignments };
    const entriesToSync = [];
    let count = 0;

    lines.forEach(line => {
      // Match patterns like "Kabir: 101, 55, 89" or "Kabir - 101 55" or "Kabir = 101"
      const match = line.match(/^([A-Za-z\s.]+?)\s*[:\-=→]\s*(.+)$/);
      if (match) {
        const staff = match[1].trim();
        const rawCycles = match[2].trim();
        const cycleTokens = rawCycles.split(/[,;\s]+/).map(c => c.trim()).filter(Boolean);
        if (staff && cycleTokens.length > 0) {
          const existingArr = updatedMap[staff]
            ? updatedMap[staff].split(',').map(c => c.trim()).filter(Boolean)
            : [];
          const merged = [...new Set([...existingArr, ...cycleTokens])].join(', ');
          updatedMap[staff] = merged;
          entriesToSync.push({ staff, cycles: merged });
          count++;
        }
      }
    });

    if (count === 0) {
      alert("Could not find 'Name: Cycle1, Cycle2' lines to convert. Example format:\nKabir: 101, 55, 89\nLaxman - 204");
      return;
    }

    await persistAssignments(updatedMap, entriesToSync);
    setAssignMsg(`✅ Synced ${count} assignment line(s) from Blank Paper!`);
    setTimeout(() => setAssignMsg(''), 3500);
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

      const { data: swapsData } = await supabase.from('battery_swaps').select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true });
      const { data: homeCyclesData } = await supabase.from('home_cycles').select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true });
      const { data: batteryTestsData } = await supabase.from('battery_tests').select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true });

      const result = {
        routine: {},    // { staffName: [{ cycle_id, condition, issue, parts_checked, odometer }] }
        pretask: {},    // same structure
        overall: { staff: '', cycles: [] },
        station: { staff: '', cycles: [] },
        maintenance: [],
        battery_swaps: swapsData || [],
        home_cycles: homeCyclesData || [],
        battery_tests: batteryTestsData || []
      };

      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false });
        
      let latestAssignments = {};
      try {
        const localSaved = localStorage.getItem(`zum_assignments_${reportDateKey}`) || localStorage.getItem('zum_assignments_latest');
        if (localSaved) latestAssignments = JSON.parse(localSaved);
      } catch (e) {}

      if (assignmentsData && assignmentsData.length > 0) {
        assignmentsData.forEach(row => {
          if (!latestAssignments[row.staff_name]) {
            latestAssignments[row.staff_name] = row.cycles;
          }
        });
      }
      
      setCurrentAssignments(latestAssignments);

      if (tasksData) {
        const seenTasks = new Set();
        
        tasksData.forEach(row => {
          // Deduplicate by task_type + staff_name + cycle_id to prevent duplicates on the report
          const uniqueKey = `${row.task_type}-${row.staff_name}-${row.cycle_id}`;
          if (seenTasks.has(uniqueKey)) return;
          seenTasks.add(uniqueKey);
          
          if (row.task_type === 'Routine Checkup') {
            const staff = row.staff_name || 'Staff';
            if (!result.routine[staff]) result.routine[staff] = [];
            result.routine[staff].push(row);
          } else if (row.task_type === 'Pre-Task Check') {
            const staff = row.staff_name || 'Staff';
            if (!result.pretask[staff]) result.pretask[staff] = [];
            result.pretask[staff].push(row);
          } else if (row.task_type === 'Overall Checkup') {
            result.overall.cycles.push(row);
            if (!result.overall.staff) {
              result.overall.staff = row.staff_name;
            } else if (!result.overall.staff.split(', ').includes(row.staff_name)) {
              result.overall.staff += `, ${row.staff_name}`;
            }
          } else if (row.task_type === 'Station Visit') {
            result.station.cycles.push(row);
            if (!result.station.staff) {
              result.station.staff = row.staff_name;
            } else if (!result.station.staff.split(', ').includes(row.staff_name)) {
              result.station.staff += `, ${row.staff_name}`;
            }
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
      setConnectionError('');
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      const isFetchErr = err?.message?.includes('fetch') || err?.message?.includes('network') || err?.message?.includes('Failed');
      const friendlyMsg = isFetchErr
        ? "Unable to connect to Supabase database. Your Supabase project may be paused due to inactivity, or the network is unreachable. Please visit supabase.com/dashboard to unpause/restore the project."
        : (err?.message || "Failed to load dashboard data");
      setConnectionError(friendlyMsg);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Initial fetch
    fetchDashboardData();

    // Helper: detect if the user is currently focused and typing anywhere inside the report
    const isTypingInReport = () => {
      const el = document.getElementById('report-editable-body');
      return !!(el && document.activeElement && el.contains(document.activeElement));
    };

    // 1. Supabase Realtime channel for instant live updates across home_cycles, tasks, swaps, maintenance
    const channel = supabase
      .channel('admin-dashboard-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_cycles' }, () => {
        if (!isTypingInReport()) fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        if (!isTypingInReport()) fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'battery_swaps' }, () => {
        if (!isTypingInReport()) fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance' }, () => {
        if (!isTypingInReport()) fetchDashboardData();
      })
      .subscribe();

    // 2. Active 5-second polling interval (skips if user is actively writing to prevent any cursor bounce)
    const pollInterval = setInterval(() => {
      if (!isTypingInReport()) {
        fetchDashboardData();
      }
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, isAuthenticated]);

  const fetchGlobal = async () => {
    setIsLoadingGlobal(true);
    try {
      const { data: tasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(1000);
      const { data: maint } = await supabase.from('maintenance').select('*').order('created_at', { ascending: false }).limit(1000);
      const { data: swaps } = await supabase.from('battery_swaps').select('*').order('created_at', { ascending: false }).limit(1000);
      const { data: homes } = await supabase.from('home_cycles').select('*').order('created_at', { ascending: false }).limit(1000);
      const { data: btests } = await supabase.from('battery_tests').select('*').order('created_at', { ascending: false }).limit(1000);
      
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
        })),
        ...(swaps || []).map(s => ({
           id: s.id,
           task_type: 'Battery Swap',
           staff_name: s.staff_name,
           cycle_id: s.cycle_id,
           created_at: s.created_at,
           in_battery_id: s.in_battery_id,
           out_battery_id: s.out_battery_id,
           source: 'battery_swaps'
        })),
        ...(homes || []).map(h => ({
           id: h.id,
           task_type: 'Home Cycle',
           staff_name: h.manual_name,
           cycle_id: h.home_cycle_id || h.old_battery_id,
           created_at: h.created_at,
           source: 'home_cycles'
         })),
         ...(btests || []).map(b => ({
           id: b.id,
           task_type: 'Battery Test',
           staff_name: b.staff_name,
           cycle_id: b.battery_id,
           created_at: b.created_at,
           fix_description: b.condition + (b.issue ? ' - ' + b.issue : '') + (b.fix_description ? ' - ' + b.fix_description : ''),
           source: 'battery_tests'
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

  const fetchRepairedAndIssues = async () => {
    setIsLoadingRepairedIssues(true);
    try {
      const { data: tasks } = await supabase.from('tasks').select('*').eq('condition', 'issue').order('created_at', { ascending: false }).limit(1000);
      const { data: maint } = await supabase.from('maintenance').select('*').order('created_at', { ascending: false }).limit(1000);
      
      const combined = [
        ...(tasks || []).map(t => ({ ...t, source: 'tasks' })),
        ...(maint || []).map(m => ({
           id: m.id,
           task_type: 'Maintenance',
           staff_name: m.staff_name,
           cycle_id: m.cycle_id,
           created_at: m.created_at,
           issue: m.fix_description,
           status: m.status,
           source: 'maintenance'
        }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setRepairedIssuesData(combined);
    } catch (err) {
      console.error(err);
    }
    setIsLoadingRepairedIssues(false);
  };

  useEffect(() => {
    if (activeTab === 'repaired_issues' && isAuthenticated) {
      fetchRepairedAndIssues();
    }
  }, [activeTab, isAuthenticated]);

  const REPORT_HTML_STORAGE_KEY = `liveEditHtml_v3_${reportDateKey}`;

  const triggerSaveIndicator = () => {
    const badge = document.getElementById('live-save-status-badge');
    if (badge) {
      badge.classList.remove('opacity-0');
      badge.classList.add('opacity-100');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        badge.classList.remove('opacity-100');
        badge.classList.add('opacity-0');
      }, 1500);
    }
  };

  const saveCurrentReportHtml = (showIndicator = false) => {
    const el = document.getElementById('report-editable-body');
    if (el) {
      try {
        localStorage.setItem(REPORT_HTML_STORAGE_KEY, el.innerHTML);
      } catch (e) {}
      if (showIndicator) {
        triggerSaveIndicator();
      }
    }
  };

  const handleReportInput = () => {
    // Save to localStorage directly without triggering a React re-render while typing
    const el = document.getElementById('report-editable-body');
    if (el) {
      try {
        localStorage.setItem(REPORT_HTML_STORAGE_KEY, el.innerHTML);
      } catch (e) {}
    }
    // Show visual "Saved" badge smoothly without any React component re-render!
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      triggerSaveIndicator();
    }, 1500);
  };

  const handleFormat = (command, value = null) => {
    document.execCommand(command, false, value);
    saveCurrentReportHtml(true);
  };

  const handleIncreaseFontSize = () => {
    setReportFontSize(prev => {
      const next = Math.min(24, parseInt(prev, 10) + 1);
      localStorage.setItem('zum_report_font_size', String(next));
      return next;
    });
  };

  const handleDecreaseFontSize = () => {
    setReportFontSize(prev => {
      const next = Math.max(11, parseInt(prev, 10) - 1);
      localStorage.setItem('zum_report_font_size', String(next));
      return next;
    });
  };

  const getEditableSectionNodes = () => {
    const el = document.getElementById('report-editable-body');
    if (!el) return [];
    return Array.from(el.children).filter(
      child => !child.classList.contains('report-header') && !child.classList.contains('report-footer')
    );
  };

  const pushUndoState = () => {
    const el = document.getElementById('report-editable-body');
    if (el) {
      undoStackRef.current.push(el.innerHTML);
      if (undoStackRef.current.length > 25) {
        undoStackRef.current.shift();
      }
    }
  };

  const handleUndo = () => {
    if (!undoStackRef.current || undoStackRef.current.length === 0) {
      alert("Nothing to undo.");
      return;
    }
    const previousHtml = undoStackRef.current.pop();
    const el = document.getElementById('report-editable-body');
    if (el && previousHtml) {
      el.innerHTML = previousHtml;
      saveCurrentReportHtml(true);
      scanReportSections();
    }
  };

  const renderHomeCyclesHtml = (cyclesList = null) => {
    const rows = cyclesList || data?.home_cycles || [];
    let tableHtml = '';
    if (rows.length === 0) {
      tableHtml = '<p class="text-sm text-gray-900">No home cycles were submitted for this shift.</p>';
    } else {
      const trs = rows.map(r => `
        <tr>
          <td class="border border-gray-400 py-2 px-3 font-medium text-gray-900">${r.manual_name || '—'}</td>
          <td class="border border-gray-400 py-2 px-3 text-gray-900">${r.home_cycle_id || '—'}</td>
          <td class="border border-gray-400 py-2 px-3 font-mono text-gray-900">${r.old_battery_id || '—'}</td>
          <td class="border border-gray-400 py-2 px-3 font-mono text-gray-900">${r.new_battery_id || '—'}</td>
        </tr>
      `).join('');
      tableHtml = `
        <div class="overflow-x-auto my-3 table-box-wrapper">
          <table class="w-full text-sm text-left border-collapse border border-gray-400">
            <thead>
              <tr>
                <th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Name</th>
                <th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Cycle</th>
                <th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Old Battery</th>
                <th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900">New Battery</th>
              </tr>
            </thead>
            <tbody>${trs}</tbody>
          </table>
        </div>
      `;
    }
    return `
      <div class="mb-12 break-inside-avoid standard-report-section" data-section-key="home_cycles">
        <h3 class="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">10. Home Cycles</h3>
        ${tableHtml}
      </div>
    `;
  };

  const handleRestoreHomeCyclesSection = () => {
    pushUndoState();
    const el = document.getElementById('report-editable-body');
    if (!el) return;

    const nodes = getEditableSectionNodes();
    const existing = nodes.find(n => /home\s*cycles/i.test(n.querySelector('h3, h2')?.innerText || ''));
    if (existing) {
      alert('"Home Cycles" section is already present in the report.');
      return;
    }

    const homeHtml = renderHomeCyclesHtml(data?.home_cycles || []);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = homeHtml.trim();
    const newSection = tempDiv.firstElementChild;

    const refNode = nodes.find(n => /battery\s*tests/i.test(n.querySelector('h3, h2')?.innerText || ''))
      || nodes.find(n => /extra\s*work|remarks/i.test(n.querySelector('h3, h2')?.innerText || ''))
      || nodes.find(n => /closing\s*summary/i.test(n.querySelector('h3, h2')?.innerText || ''));

    if (refNode && refNode.parentNode === el) {
      el.insertBefore(newSection, refNode);
    } else {
      const footer = el.querySelector('.report-footer');
      if (footer) {
        el.insertBefore(newSection, footer);
      } else {
        el.appendChild(newSection);
      }
    }

    handleAutoNumberReportSections();
    saveCurrentReportHtml(true);
    scanReportSections();
  };

  const updateHomeCyclesSectionInDom = (homeCyclesList) => {
    const el = document.getElementById('report-editable-body');
    if (!el) return;
    const nodes = getEditableSectionNodes();
    const homeNode = nodes.find(n => /home\s*cycles/i.test(n.querySelector('h3, h2')?.innerText || ''));
    if (!homeNode) return;

    const heading = homeNode.querySelector('h3, h2');
    const headingHtml = heading ? heading.outerHTML : '<h3 class="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">10. Home Cycles</h3>';

    let tableHtml = '';
    if (!homeCyclesList || homeCyclesList.length === 0) {
      tableHtml = '<p class="text-sm text-gray-900">No home cycles were submitted for this shift.</p>';
    } else {
      const trs = homeCyclesList.map(row => `
        <tr>
          <td class="border border-gray-400 py-2 px-3 font-medium text-gray-900">${row.manual_name || '—'}</td>
          <td class="border border-gray-400 py-2 px-3 text-gray-900">${row.home_cycle_id || '—'}</td>
          <td class="border border-gray-400 py-2 px-3 font-mono text-gray-900">${row.old_battery_id || '—'}</td>
          <td class="border border-gray-400 py-2 px-3 font-mono text-gray-900">${row.new_battery_id || '—'}</td>
        </tr>
      `).join('');
      tableHtml = `
        <div class="overflow-x-auto my-3 table-box-wrapper">
          <table class="w-full text-sm text-left border-collapse border border-gray-400">
            <thead>
              <tr>
                <th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Name</th>
                <th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Cycle</th>
                <th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Old Battery</th>
                <th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900">New Battery</th>
              </tr>
            </thead>
            <tbody>${trs}</tbody>
          </table>
        </div>
      `;
    }

    homeNode.innerHTML = `${headingHtml}\n${tableHtml}`;
    saveCurrentReportHtml();
  };

  const scanReportSections = () => {
    const nodes = getEditableSectionNodes();
    const list = nodes.map((node, idx) => {
      const heading = node.querySelector('h3, h2');
      return {
        index: idx,
        title: heading ? heading.innerText.trim() : `Section ${idx + 1}`,
        hasTable: !!node.querySelector('table')
      };
    });
    setReportSectionsSnapshot(list);
    return list;
  };

  const handleOpenAddTitleModal = ({ tableOnly = false } = {}) => {
    if (!isLiveEditMode) setIsLiveEditMode(true);
    const list = scanReportSections();
    setNewSectionTitle(tableOnly ? '' : '');
    setNewSectionContent('');
    setIncludeTableInNewSection(tableOnly);
    setTableBuilderHeaders(['Column 1', 'Column 2', 'Column 3']);
    setTableBuilderRows([
      ['', '', ''],
      ['', '', '']
    ]);
    // Default placement: Above Extra Work & Closing Summary
    const extraIdx = list.findIndex(s => /extra\s*work|remarks/i.test(s.title));
    const closingIdx = list.findIndex(s => /closing\s*summary/i.test(s.title));
    if (extraIdx !== -1) {
      setNewSectionPlacement(`before_${extraIdx}`);
    } else if (closingIdx !== -1) {
      setNewSectionPlacement(`before_${closingIdx}`);
    } else {
      setNewSectionPlacement('above_extra');
    }
    setShowAddTitleModal(true);
  };

  const handleConfirmAddSectionOrTable = (e) => {
    if (e) e.preventDefault();
    if (!newSectionTitle.trim() && !includeTableInNewSection && !newSectionContent.trim()) {
      alert("Please enter a title, text content, or include a table.");
      return;
    }

    const el = document.getElementById('report-editable-body');
    if (!el) return;
    pushUndoState();

    const newSection = document.createElement('div');
    newSection.className = 'mb-12 break-inside-avoid custom-report-section';

    let inner = '';
    const cleanNewTitle = newSectionTitle.trim().replace(/^\d+[\.\)]\s*/, '');
    if (cleanNewTitle) {
      inner += `<h3 class="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2" style="font-family: 'Play', sans-serif;">${cleanNewTitle}</h3>`;
    }
    if (newSectionContent.trim()) {
      inner += `<p class="text-sm leading-relaxed text-gray-900 mb-3 whitespace-pre-wrap" style="font-family: 'Play', sans-serif;">${newSectionContent.trim()}</p>`;
    } else if (!includeTableInNewSection) {
      inner += `<p class="text-sm leading-relaxed text-gray-900 mb-3 whitespace-pre-wrap" style="font-family: 'Play', sans-serif;">Click here to write section details...</p>`;
    }
    if (includeTableInNewSection) {
      const thHtml = tableBuilderHeaders
        .map(h => `<th class="border border-gray-400 py-2 px-3 font-semibold text-gray-900 bg-gray-100">${h || 'Header'}</th>`)
        .join('');
      const trsHtml = tableBuilderRows
        .map(row => {
          const tds = row
            .map(cell => `<td class="border border-gray-400 py-2 px-3 text-gray-900">${cell || '&nbsp;'}</td>`)
            .join('');
          return `<tr>${tds}</tr>`;
        })
        .join('');
      inner += `
        <div class="overflow-x-auto my-3 table-box-wrapper">
          <table class="w-full text-sm text-left border-collapse mb-4 border border-gray-400 custom-report-table">
            <thead><tr>${thHtml}</tr></thead>
            <tbody>${trsHtml}</tbody>
          </table>
        </div>
      `;
    }

    newSection.innerHTML = inner;

    const sectionNodes = getEditableSectionNodes();
    let referenceNode = null;

    if (newSectionPlacement.startsWith('before_')) {
      const targetIdx = parseInt(newSectionPlacement.replace('before_', ''), 10);
      if (!isNaN(targetIdx) && sectionNodes[targetIdx]) {
        referenceNode = sectionNodes[targetIdx];
      }
    } else if (newSectionPlacement === 'above_extra') {
      referenceNode = sectionNodes.find(n => /extra\s*work|remarks/i.test(n.querySelector('h3, h2')?.innerText || ''))
        || sectionNodes.find(n => /closing\s*summary/i.test(n.querySelector('h3, h2')?.innerText || ''));
    } else if (newSectionPlacement === 'above_closing') {
      referenceNode = sectionNodes.find(n => /closing\s*summary/i.test(n.querySelector('h3, h2')?.innerText || ''));
    }

    if (referenceNode && referenceNode.parentNode === el) {
      el.insertBefore(newSection, referenceNode);
    } else {
      const footer = el.querySelector('.report-footer');
      if (footer) {
        el.insertBefore(newSection, footer);
      } else {
        el.appendChild(newSection);
      }
    }

    // Automatically manage and apply numbering to all sections including the new one
    handleAutoNumberReportSections();
    setShowAddTitleModal(false);
  };

  const handleOpenReorderTitlesModal = () => {
    if (!isLiveEditMode) setIsLiveEditMode(true);
    scanReportSections();
    setShowReorderTitlesModal(true);
  };

  const handleMoveReportSection = (fromIdx, toIdx) => {
    const el = document.getElementById('report-editable-body');
    if (!el) return;
    pushUndoState();
    const nodes = getEditableSectionNodes();
    if (toIdx < 0 || toIdx >= nodes.length || fromIdx === toIdx) return;

    const movingNode = nodes[fromIdx];
    const targetNode = nodes[toIdx];

    if (fromIdx < toIdx) {
      el.insertBefore(movingNode, targetNode.nextSibling);
    } else {
      el.insertBefore(movingNode, targetNode);
    }

    // Automatically manage numbering after reordering
    handleAutoNumberReportSections();
  };

  const handleRenameReportSection = (idx, updatedTitle) => {
    const nodes = getEditableSectionNodes();
    if (!nodes[idx]) return;
    let heading = nodes[idx].querySelector('h3, h2');
    if (!heading) {
      heading = document.createElement('h3');
      heading.className = 'text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2';
      nodes[idx].insertBefore(heading, nodes[idx].firstChild);
    }
    const cleanTitle = updatedTitle.trim().replace(/^\d+[\.\)]\s*/, '');
    const finalTitle = cleanTitle ? `${idx + 1}. ${cleanTitle}` : updatedTitle;
    heading.innerText = finalTitle;
    saveCurrentReportHtml();
    setReportSectionsSnapshot(prev => prev.map((s, i) => i === idx ? { ...s, title: finalTitle } : s));
  };

  const handleDeleteReportSection = (idx) => {
    const nodes = getEditableSectionNodes();
    if (!nodes[idx]) return;
    pushUndoState();
    nodes[idx].remove();
    // Automatically manage and adjust numbering after removing the section
    handleAutoNumberReportSections();
  };

  const handleAutoNumberReportSections = () => {
    const nodes = getEditableSectionNodes();
    let currentNum = 1;
    nodes.forEach((node) => {
      const heading = node.querySelector('h3, h2');
      if (heading) {
        const rawText = heading.innerText.trim();
        const cleanTitle = rawText.replace(/^\d+[\.\)]\s*/, '').trim();
        if (cleanTitle) {
          heading.innerText = `${currentNum}. ${cleanTitle}`;
          currentNum++;
        }
      }
    });
    saveCurrentReportHtml();
    scanReportSections();
  };

  const handleRemoveActiveSection = () => {
    const el = document.getElementById('report-editable-body');
    if (!el) return;
    pushUndoState();
    const nodes = getEditableSectionNodes();
    if (nodes.length <= 1) {
      alert("Cannot remove the only remaining section.");
      return;
    }

    let targetSection = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let curr = sel.anchorNode;
      while (curr && curr !== el) {
        if (curr.parentNode === el) {
          targetSection = curr;
          break;
        }
        curr = curr.parentNode;
      }
    }

    if (!targetSection && lastClickedTableRef.current) {
      let curr = lastClickedTableRef.current;
      while (curr && curr !== el) {
        if (curr.parentNode === el) {
          targetSection = curr;
          break;
        }
        curr = curr.parentNode;
      }
    }

    if (!targetSection) {
      handleOpenReorderTitlesModal();
      return;
    }

    const heading = targetSection.querySelector('h3, h2');
    const titleText = heading ? heading.innerText.trim() : 'this section';
    if (window.confirm(`Remove "${titleText}"? All remaining sections will be automatically renumbered.`)) {
      targetSection.remove();
      handleAutoNumberReportSections();
    }
  };

  const handleReportBlur = () => {
    saveCurrentReportHtml(false);
    if (data?.home_cycles) {
      updateHomeCyclesSectionInDom(data.home_cycles);
    }
  };

  const getActiveOrLastReportTable = () => {
    const el = document.getElementById('report-editable-body');
    if (!el) return null;
    if (lastClickedTableRef.current && el.contains(lastClickedTableRef.current)) {
      return lastClickedTableRef.current;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node = sel.anchorNode;
      while (node && node !== el) {
        if (node.nodeName === 'TABLE') {
          lastClickedTableRef.current = node;
          return node;
        }
        node = node.parentNode;
      }
    }
    const tables = el.querySelectorAll('table');
    return tables.length > 0 ? tables[tables.length - 1] : null;
  };

  const getTableColumnCount = (table) => {
    const theadRow = table.querySelector('thead tr');
    if (theadRow && theadRow.children.length > 0) {
      return theadRow.children.length;
    }
    const firstRow = table.querySelector('tr');
    if (!firstRow) return 3;
    let totalCols = 0;
    Array.from(firstRow.children).forEach(cell => {
      totalCols += parseInt(cell.getAttribute('colspan') || '1', 10);
    });
    return totalCols || 3;
  };

  const clearPlaceholderRowIfNeeded = (table, colCount) => {
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 1) {
      const onlyRow = rows[0];
      const hasColspan = onlyRow.children.length === 1 && parseInt(onlyRow.children[0].getAttribute('colspan') || '1', 10) > 1;
      const isPlaceholderAttr = onlyRow.getAttribute('data-placeholder-row') === 'true';
      const text = (onlyRow.innerText || '').trim();
      if (isPlaceholderAttr || (hasColspan && /^no\s+/i.test(text))) {
        onlyRow.remove();
      }
    }
  };

  const handleAddTableRowInReport = (targetTable = null) => {
    if (!isLiveEditMode) setIsLiveEditMode(true);
    const table = (targetTable && targetTable.nodeName === 'TABLE') ? targetTable : getActiveOrLastReportTable();
    if (!table) {
      handleOpenAddTitleModal({ tableOnly: true });
      return;
    }
    pushUndoState();
    const colCount = getTableColumnCount(table);
    clearPlaceholderRowIfNeeded(table, colCount);

    const tbody = table.querySelector('tbody') || table;
    const tr = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.className = 'border border-gray-400 py-2 px-3 text-gray-900';
      td.innerHTML = i === 0 ? '—' : '&nbsp;';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    saveCurrentReportHtml();
  };

  const handleAddTableColInReport = (targetTable = null) => {
    if (!isLiveEditMode) setIsLiveEditMode(true);
    const table = (targetTable && targetTable.nodeName === 'TABLE') ? targetTable : getActiveOrLastReportTable();
    if (!table) {
      handleOpenAddTitleModal({ tableOnly: true });
      return;
    }
    pushUndoState();
    const colCount = getTableColumnCount(table);
    // If table only has a colSpan placeholder row, convert it into real cells first
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 1 && rows[0].children.length === 1 && parseInt(rows[0].children[0].getAttribute('colspan') || '1', 10) > 1) {
      rows[0].innerHTML = '';
      rows[0].removeAttribute('data-placeholder-row');
      for (let i = 0; i < colCount; i++) {
        const td = document.createElement('td');
        td.className = 'border border-gray-400 py-2 px-3 text-gray-900';
        td.innerHTML = i === 0 ? '—' : '&nbsp;';
        rows[0].appendChild(td);
      }
    }

    const theadRow = table.querySelector('thead tr');
    if (theadRow) {
      const th = document.createElement('th');
      th.className = 'border border-gray-400 py-2 px-3 font-semibold text-gray-900';
      th.innerText = `Column ${theadRow.children.length + 1}`;
      theadRow.appendChild(th);
    }
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(tr => {
      const td = document.createElement('td');
      td.className = 'border border-gray-400 py-2 px-3 text-gray-900';
      td.innerHTML = '&nbsp;';
      tr.appendChild(td);
    });
    saveCurrentReportHtml();
  };

  const handleRemoveTableRowInReport = (targetTable = null) => {
    const table = (targetTable && targetTable.nodeName === 'TABLE') ? targetTable : getActiveOrLastReportTable();
    if (!table) return;
    pushUndoState();
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length > 1) {
      rows[rows.length - 1].remove();
      saveCurrentReportHtml();
    }
  };

  const handleRemoveTableColInReport = (targetTable = null) => {
    const table = (targetTable && targetTable.nodeName === 'TABLE') ? targetTable : getActiveOrLastReportTable();
    if (!table) return;
    pushUndoState();
    const theadRow = table.querySelector('thead tr');
    if (theadRow && theadRow.children.length > 1) {
      theadRow.lastElementChild.remove();
    }
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(tr => {
      if (tr.children.length > 1) {
        tr.lastElementChild.remove();
      }
    });
    saveCurrentReportHtml();
  };

  const handleDeleteTableInReport = (targetTable = null) => {
    if (!isLiveEditMode) setIsLiveEditMode(true);
    const table = (targetTable && targetTable.nodeName === 'TABLE') ? targetTable : getActiveOrLastReportTable();
    if (!table) return;
    pushUndoState();

    const parentWrapper = table.closest('.table-box-wrapper') || (table.parentElement?.classList.contains('overflow-x-auto') ? table.parentElement : null);
    const section = table.closest('.custom-report-section, .standard-report-section, div.mb-12');

    if (parentWrapper) {
      parentWrapper.remove();
    } else {
      table.remove();
    }

    // If the enclosing section has no more content, or only an empty heading left, remove section too
    if (section) {
      const remainingTables = section.querySelectorAll('table');
      const paragraphs = section.querySelectorAll('p');
      const heading = section.querySelector('h3, h2');
      const text = (section.innerText || '').replace(heading?.innerText || '', '').trim();
      if (remainingTables.length === 0 && paragraphs.length === 0 && !text) {
        section.remove();
        handleAutoNumberReportSections();
      }
    }

    lastClickedTableRef.current = null;
    setActiveTableBanner(null);
    saveCurrentReportHtml(true);
    scanReportSections();
  };

  const handleReportBodyClick = (e) => {
    const clickedTable = e.target.closest('table');
    const reportContainer = document.getElementById('pdf-report-content');
    if (clickedTable && reportContainer && reportContainer.contains(clickedTable)) {
      lastClickedTableRef.current = clickedTable;
      const sectionDiv = clickedTable.closest('div');
      const heading = sectionDiv?.querySelector('h3, h2');
      const containerRect = reportContainer.getBoundingClientRect();
      const tableRect = clickedTable.getBoundingClientRect();
      setActiveTableBanner({
        sectionTitle: heading ? heading.innerText.trim() : 'Selected Table',
        top: Math.max(8, tableRect.top - containerRect.top - 38)
      });
    } else {
      setActiveTableBanner(null);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 3 * 1024 * 1024) {
      alert("Logo image is too large. Please select an image under 3MB.");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (base64) {
        setReportLogo(base64);
        localStorage.setItem('zum_report_logo', base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    if (window.confirm("Remove logo from the report?")) {
      setReportLogo('');
      localStorage.setItem('zum_report_logo', 'NONE');
    }
  };

  const handleResetReport = () => {
    if (window.confirm("Reset manual edits and restore original automated operational report?")) {
      localStorage.removeItem(REPORT_HTML_STORAGE_KEY);
      localStorage.removeItem(`liveEditHtml_${reportDateKey}`);
      window.location.reload();
    }
  };

  const reportLoadedDateRef = useRef(null);
  const lastHomeCyclesJsonRef = useRef('');

  useEffect(() => {
    if (reportLoadedDateRef.current === reportDateKey) return;
    const savedHtml = localStorage.getItem(REPORT_HTML_STORAGE_KEY);
    if (savedHtml) {
      // Check if savedHtml is missing any staff who are currently present in live routine data
      const missingStaff = routineStaff.filter(name => !savedHtml.includes(name));
      if (missingStaff.length > 0) {
        // Saved HTML is stale (e.g. from earlier before all staff submitted).
        // Remove stale cache so live report displays all staff properly!
        try {
          localStorage.removeItem(REPORT_HTML_STORAGE_KEY);
        } catch (e) {}
        reportLoadedDateRef.current = reportDateKey;
        return;
      }
      const el = document.getElementById('report-editable-body');
      if (el) {
        // Strip any legacy embedded report-header from savedHtml
        const cleanSavedHtml = savedHtml.replace(/<div class="report-header[^>]*>[\s\S]*?<\/div>\s*<\/div>/i, '');
        el.innerHTML = cleanSavedHtml;
        if (data?.home_cycles && data.home_cycles.length > 0) {
          updateHomeCyclesSectionInDom(data.home_cycles);
        }
      }
    }
    reportLoadedDateRef.current = reportDateKey;
  }, [reportDateKey, routineStaff]);

  // Keep home cycles live and updated instantly whenever fresh submissions arrive
  useEffect(() => {
    if (!data?.home_cycles) return;
    const currentJson = JSON.stringify(data.home_cycles);
    if (lastHomeCyclesJsonRef.current === currentJson) return;
    lastHomeCyclesJsonRef.current = currentJson;

    const el = document.getElementById('report-editable-body');
    // If user is currently focused/typing anywhere in the report, defer until blur to never bounce cursor
    if (el && document.activeElement && el.contains(document.activeElement)) {
      return;
    }
    updateHomeCyclesSectionInDom(data.home_cycles);
  }, [data?.home_cycles]);

  // Global keyboard shortcut for Undo (Cmd+Z / Ctrl+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (undoStackRef.current && undoStackRef.current.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const fetchActiveIssues = async () => {
    try {
      const { start, end } = getCurrentShiftWindow(selectedDate);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .eq('condition', 'issue')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
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
    } catch (err) {
      console.error("fetchActiveIssues error:", err);
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

    setIsAuthenticated(true);
    setLoading(false);
    fetchDashboardData();
  };

  const handleDeleteRecord = async (table, id) => {
    if (!window.confirm(`Are you sure you want to delete this record from ${table}? This cannot be undone.`)) return;
    
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      
      alert('Record deleted successfully!');
      setGlobalData(prev => prev.filter(item => !(item.source === table && item.id === id)));
      setRepairedIssuesData(prev => prev.filter(item => !(item.source === table && item.id === id)));
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
      } else if (table === 'battery_swaps' || table === 'home_cycles') {
        alert('Editing is not fully supported for this record type yet.');
        setIsSavingEdit(false);
        return;
      }
      
      const { error } = await supabase.from(table).update(updates).eq('id', editingRecord.id);
      if (error) throw error;
      
      alert('Record updated successfully!');
      setEditingRecord(null);
      fetchGlobal();
      fetchRepairedAndIssues();
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
      fetchRepairedAndIssues();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleOpenGeminiModal = () => {
    scanReportSections();
    setGeminiStatusMsg('');
    setShowGeminiModal(true);
  };

  const handleRefineSpecificTitleBody = async (sectionIdx) => {
    const nodes = getEditableSectionNodes();
    const targetSec = nodes[sectionIdx];
    if (!targetSec) return;

    const heading = targetSec.querySelector('h3, h2');
    const secTitle = heading ? heading.innerText.trim() : `Section ${sectionIdx + 1}`;
    const activeKey = getStoredGeminiApiKey(geminiApiKey);

    setRefiningSectionIdx(sectionIdx);
    setGeminiStatusMsg(`✨ Refining "${secTitle}" body...`);

    try {
      const paragraphs = Array.from(targetSec.querySelectorAll('p')).filter(p => {
        const t = (p.innerText || '').trim();
        return t.length > 3 && !t.includes('Total Cycles:');
      });
      const descCells = Array.from(targetSec.querySelectorAll('tbody td')).filter(td => {
        const t = (td.innerText || '').trim();
        return t.split(/\s+/).length >= 2 && t !== '—' && !/^no\s+.*recorded\s+for\s+this\s+shift\.?$/i.test(t);
      });

      const allTargets = [...paragraphs, ...descCells];
      if (allTargets.length === 0) {
        setGeminiStatusMsg(`ℹ️ No text paragraphs found inside "${secTitle}" to refine.`);
        setRefiningSectionIdx(null);
        return;
      }

      if (allTargets.length === 1) {
        const refinedSingle = await refineTextWithAI(allTargets[0].innerText.trim(), activeKey, geminiRefineStyle, secTitle);
        if (refinedSingle) allTargets[0].innerText = refinedSingle;
      } else {
        const rawList = allTargets.map(n => n.innerText.trim());
        const refinedList = await refineReportParagraphsWithAI(rawList, activeKey, geminiRefineStyle);
        refinedList.forEach((txt, i) => {
          if (txt && allTargets[i]) allTargets[i].innerText = txt;
        });
      }

      saveCurrentReportHtml();
      setGeminiStatusMsg(`✅ Refined "${secTitle}" body!`);
      setTimeout(() => setGeminiStatusMsg(''), 3500);
    } catch (err) {
      setGeminiStatusMsg('❌ ' + err.message);
    } finally {
      setRefiningSectionIdx(null);
    }
  };

  const buildLiveReportSnapshot = () => {
    const nodes = getEditableSectionNodes();
    const liveStaffWorkList = Array.from(staffWork.entries()).map(([staff, acts]) => `${staff}: ${acts.join('; ')}.`);

    const sections = nodes.map((sec, idx) => {
      const heading = sec.querySelector('h3, h2');
      const title = heading ? heading.innerText.trim() : `Section ${idx + 1}`;
      const paragraphs = Array.from(sec.querySelectorAll('p'))
        .map(p => (p.innerText || '').trim())
        .filter(Boolean);

      const tables = [];
      const tableEls = sec.querySelectorAll('table');
      tableEls.forEach(tbl => {
        const headers = Array.from(tbl.querySelectorAll('thead th')).map(th => (th.innerText || '').trim());
        const rows = [];
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          if (tr.getAttribute('data-placeholder-row') === 'true') return;
          const cells = Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || '').trim());
          if (cells.length === 1 && /^no\s+.*recorded/i.test(cells[0])) return;
          if (cells.some(c => c && c !== '—')) {
            rows.push(cells);
          }
        });
        if (rows.length > 0) {
          tables.push({ headers, rows });
        }
      });
      const rows = tables.flatMap(t => t.rows);
      return { title, paragraphs, tables, rows };
    });
    return { date: todayStr, sections, staffWorkLive: liveStaffWorkList };
  };

  const handleAnalyzeReportAndGenerateSummaries = async (target = 'all') => {
    const activeKey = getStoredGeminiApiKey(geminiApiKey);
    const nodes = getEditableSectionNodes();
    if (nodes.length === 0) return;

    setIsAnalyzingSummaries(true);
    setGeminiStatusMsg('✨ Analyzing report tables & sections to write summaries...');

    try {
      const snapshot = buildLiveReportSnapshot();
      const generated = await analyzeReportAndGenerateSummariesWithAI(snapshot, activeKey);

      const updateSectionParagraphs = (node, textOrArray) => {
        if (!node) return;
        const heading = node.querySelector('h3, h2');
        const headingHtml = heading
          ? heading.outerHTML
          : `<h3 class="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">Summary</h3>`;

        let bodyHtml = '';
        if (Array.isArray(textOrArray)) {
          bodyHtml = `<div class="flex flex-col gap-2.5">${textOrArray
            .map(line => {
              const parts = String(line).split(':');
              if (parts.length > 1) {
                const staffPart = parts.shift();
                return `<p class="text-sm leading-relaxed text-gray-900"><span class="font-bold">${staffPart}:</span>${parts.join(':')}</p>`;
              }
              return `<p class="text-sm leading-relaxed text-gray-900">${line}</p>`;
            })
            .join('')}</div>`;
        } else {
          const paras = String(textOrArray)
            .split(/\n\n+/)
            .map(p => p.trim())
            .filter(Boolean);
          bodyHtml = paras
            .map((p, i) => `<p class="text-sm leading-relaxed text-gray-900 ${i > 0 ? 'mt-3' : ''}">${p}</p>`)
            .join('');
        }
        node.innerHTML = headingHtml + bodyHtml;
      };

      // 1. Opening / Executive Summary
      if ((target === 'all' || target === 'opening') && generated.opening) {
        const openingNode =
          nodes.find(n => /executive\s*operations\s*summary|opening/i.test(n.querySelector('h3, h2')?.innerText || '')) ||
          nodes[0];
        updateSectionParagraphs(openingNode, generated.opening);
      }

      // 2. Individual Staff Work Summary
      if ((target === 'all' || target === 'individual') && generated.individual) {
        const individualNode = nodes.find(n =>
          /individual\s*staff\s*work/i.test(n.querySelector('h3, h2')?.innerText || '')
        );
        updateSectionParagraphs(individualNode, generated.individual);
      }

      // 3. Operational Closing Summary
      if ((target === 'all' || target === 'closing') && generated.closing) {
        const closingNode =
          nodes.find(n => /closing\s*summary/i.test(n.querySelector('h3, h2')?.innerText || '')) ||
          nodes[nodes.length - 1];
        updateSectionParagraphs(closingNode, generated.closing);
      }

      saveCurrentReportHtml();
      const label =
        target === 'opening'
          ? 'Opening Summary'
          : target === 'individual'
          ? 'Individual Staff Work Summary'
          : target === 'closing'
          ? 'Closing Summary'
          : 'Opening, Individual Staff Work & Closing Summaries';
      setGeminiStatusMsg(`✅ Auto-generated ${label} from live report analysis!`);
      setTimeout(() => setGeminiStatusMsg(''), 4000);
    } catch (err) {
      setGeminiStatusMsg('❌ ' + err.message);
    } finally {
      setIsAnalyzingSummaries(false);
    }
  };

  const handleSaveGeminiKey = (val) => {
    setGeminiApiKey(val);
    try {
      if (val.trim()) {
        localStorage.setItem('zum_gemini_api_key', val.trim());
      } else {
        localStorage.removeItem('zum_gemini_api_key');
      }
    } catch (e) {}
  };

  const handleRefineEntireReportLanguage = async (styleOverride = null) => {
    const activeKey = getStoredGeminiApiKey(geminiApiKey);
    if (!activeKey) {
      setShowGeminiModal(true);
      setGeminiStatusMsg('⚠️ Please enter your Google Gemini AI API Key below first.');
      return;
    }

    const el = document.getElementById('report-editable-body');
    if (!el) return;
    pushUndoState();

    setIsRefiningEntireReport(true);
    setGeminiStatusMsg('✨ Refining report language with Google Gemini AI...');

    try {
      // Collect paragraphs and descriptive table cells inside report sections
      const targetNodes = [];
      const sectionDivs = getEditableSectionNodes();
      sectionDivs.forEach(sec => {
        const paragraphs = sec.querySelectorAll('p');
        paragraphs.forEach(p => {
          const text = (p.innerText || '').trim();
          // Skip short meta lines like "Staff: ... | Total Cycles: ..."
          if (text.length > 12 && !text.includes('Total Cycles:')) {
            targetNodes.push(p);
          }
        });
        const tds = sec.querySelectorAll('tbody td');
        tds.forEach(td => {
          const text = (td.innerText || '').trim();
          // Only refine descriptive sentences/phrases (more than 2 words, not just numbers/names)
          if (text.split(/\s+/).length >= 3 && !/^no\s+.*recorded\s+for\s+this\s+shift\.?$/i.test(text)) {
            targetNodes.push(td);
          }
        });
      });

      if (targetNodes.length === 0) {
        setGeminiStatusMsg('ℹ️ No paragraphs found to refine.');
        setIsRefiningEntireReport(false);
        return;
      }

      const originalTexts = targetNodes.map(n => n.innerText.trim());
      const refinedTexts = await refineReportParagraphsWithAI(
        originalTexts,
        activeKey,
        styleOverride || geminiRefineStyle
      );

      refinedTexts.forEach((newText, idx) => {
        if (newText && typeof newText === 'string' && targetNodes[idx]) {
          targetNodes[idx].innerText = newText;
        }
      });

      saveCurrentReportHtml();
      setGeminiStatusMsg('✅ Entire report language refined with Google Gemini AI!');
      setTimeout(() => setGeminiStatusMsg(''), 4000);
    } catch (err) {
      setGeminiStatusMsg('❌ ' + err.message);
    } finally {
      setIsRefiningEntireReport(false);
    }
  };

  const handleRefineNewSectionContentWithAI = async () => {
    if (!newSectionContent.trim()) {
      alert('Write some rough text in the Description box first, then click Refine with Gemini AI.');
      return;
    }
    const activeKey = getStoredGeminiApiKey(geminiApiKey);
    if (!activeKey) {
      setShowGeminiModal(true);
      return;
    }
    setIsRefiningNewSectionText(true);
    try {
      const refined = await refineTextWithAI(newSectionContent, activeKey, geminiRefineStyle);
      setNewSectionContent(refined);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsRefiningNewSectionText(false);
    }
  };

  const handleRefine = async () => {
    const currentText = overrides[activeEditSection];
    if (!currentText || !currentText.trim()) return;
    
    setIsRefining(true);
    try {
      const refinedText = await refineTextWithAI(currentText, geminiApiKey, geminiRefineStyle);
      setOverrides(prev => ({ ...prev, [activeEditSection]: refinedText }));
    } catch (err) {
      alert(err.message);
    } finally {
      setIsRefining(false);
    }
  };

  const handleAICommand = async () => {
    if (!aiCommand.trim()) return;
    setIsProcessingCommand(true);
    try {
      const updatedOverrides = await executeAICommand(overrides, aiCommand, geminiApiKey);
      setOverrides(prev => ({ ...prev, ...updatedOverrides }));
      setAiCommand('');
      setIsEditingNotes(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsProcessingCommand(false);
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] px-4 font-sans antialiased">
        <div className="w-full max-w-[360px] bg-white rounded-[28px] p-8 border border-black/[0.06] text-center">
          <div className="w-12 h-12 bg-[#1D1D1F] text-white flex items-center justify-center rounded-2xl font-semibold text-lg mx-auto mb-5">
            Z
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[#1D1D1F] mb-1">Zum Operations</h2>
          <p className="text-xs text-[#86868B] mb-7">Sign in to Admin Console</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            {error && <p className="text-[#FF3B30] text-xs font-medium bg-[#FF3B30]/10 py-2 px-3 rounded-xl">{error}</p>}
            <input
              type="password"
              placeholder="Enter admin password"
              className="w-full px-4 py-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent focus:border-black/15 focus:bg-white outline-none text-sm text-center text-[#1D1D1F] placeholder:text-[#86868B] transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              disabled={loading}
              type="submit"
              className="w-full py-3.5 bg-[#1D1D1F] text-white rounded-2xl text-sm font-medium hover:bg-black active:scale-[0.99] transition-all disabled:opacity-50 mt-1"
            >
              {loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

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
    <div className="flex h-screen print:h-auto w-full bg-[#F5F5F7] print:bg-white font-sans antialiased text-[#1D1D1F] overflow-hidden print:overflow-visible print:block relative">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-40 md:hidden print:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide-Over Drawer (Apple iPadOS Sidebar Style) */}
      <div className={`fixed top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-[#FBFBFD]/95 backdrop-blur-2xl border-r border-black/[0.06] z-50 flex flex-col transition-transform duration-300 ease-in-out md:hidden print:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-5 py-4 flex items-center justify-between border-b border-black/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#1D1D1F] text-white flex items-center justify-center rounded-[11px] font-semibold text-sm">
              Z
            </div>
            <div>
              <div className="text-[13px] font-semibold tracking-tight text-[#1D1D1F]">Zum Operations</div>
              <div className="text-[11px] text-[#86868B]">Admin Console</div>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setIsMobileMenuOpen(false)} 
            className="p-1.5 rounded-full text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.05] active:scale-95 transition"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="p-3.5 flex-1 overflow-y-auto">
          <div className="px-2.5 text-[10px] text-[#86868B] mb-2 uppercase tracking-wider font-semibold">Workspace</div>
          <nav className="flex flex-col gap-1">
            <button 
              onClick={() => { setActiveTab('reports'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'reports' ? 'text-[#1D1D1F] bg-white font-semibold border border-black/[0.06]' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <ClipboardList size={17} strokeWidth={1.8} /> Daily Reports
            </button>
            <button 
              onClick={() => { setActiveTab('assign'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'assign' ? 'text-[#1D1D1F] bg-white font-semibold border border-black/[0.06]' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <Users size={17} strokeWidth={1.8} /> Assign Cycles
            </button>
            <button 
              onClick={() => { setActiveTab('manage_data'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'manage_data' ? 'text-[#1D1D1F] bg-white font-semibold border border-black/[0.06]' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <Database size={17} strokeWidth={1.8} /> Master Archive
            </button>
            <button 
              onClick={() => { setActiveTab('issues'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between px-3 py-2.5 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'issues' ? 'text-[#1D1D1F] bg-white font-semibold border border-black/[0.06]' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <span className="flex items-center gap-3">
                <AlertTriangle size={17} strokeWidth={1.8} className={activeIssuesList.length > 0 ? 'text-[#FF3B30]' : ''} />
                <span>Active Issues</span>
              </span>
              {activeIssuesList.length > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#FF3B30]/10 text-[#FF3B30] font-semibold">{activeIssuesList.length}</span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]/70"></span>
              )}
            </button>
            <button 
              onClick={() => { setActiveTab('repaired_issues'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'repaired_issues' ? 'text-[#1D1D1F] bg-white font-semibold border border-black/[0.06]' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <Wrench size={17} strokeWidth={1.8} /> Repaired & Issues
            </button>
          </nav>
        </div>
      </div>

      {/* Desktop Sidebar (macOS Sonoma / Sequoia Translucent Sidebar) */}
      <div className="w-60 bg-[#FBFBFD]/90 backdrop-blur-2xl border-r border-black/[0.06] flex flex-col overflow-y-auto hidden md:flex print:hidden shrink-0 select-none">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-black/[0.05]">
          <div className="w-9 h-9 bg-[#1D1D1F] text-white flex items-center justify-center rounded-[11px] font-semibold text-sm">
            Z
          </div>
          <div>
            <div className="text-[13px] font-semibold tracking-tight text-[#1D1D1F]">Zum Operations</div>
            <div className="text-[11px] text-[#86868B]">Administrator</div>
          </div>
        </div>
        
        <div className="p-3.5 flex-1">
          <div className="relative mb-5">
            <Search className="absolute left-3 top-2.5 text-[#86868B]" size={14} />
            <input
              type="text"
              placeholder="Search"
              value={dataSearch}
              onChange={e => setDataSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-black/[0.04] focus:bg-white rounded-xl text-xs text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:border-black/15 outline-none transition-all"
            />
          </div>
          
          <div className="px-2.5 text-[10px] text-[#86868B] mb-1.5 uppercase tracking-wider font-semibold">Workspace</div>
          <nav className="flex flex-col gap-1">
            <button 
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'reports' ? 'text-[#1D1D1F] bg-white border border-black/[0.06] font-semibold' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <ClipboardList size={16} strokeWidth={1.8} /> Daily Reports
            </button>
            <button 
              onClick={() => setActiveTab('assign')}
              className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'assign' ? 'text-[#1D1D1F] bg-white border border-black/[0.06] font-semibold' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <Users size={16} strokeWidth={1.8} /> Assign Cycles
            </button>
            <button 
              onClick={() => setActiveTab('manage_data')}
              className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'manage_data' ? 'text-[#1D1D1F] bg-white border border-black/[0.06] font-semibold' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <Database size={16} strokeWidth={1.8} /> Master Archive
            </button>
            <button 
              onClick={() => setActiveTab('issues')}
              className={`flex items-center justify-between px-3 py-2 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'issues' ? 'text-[#1D1D1F] bg-white border border-black/[0.06] font-semibold' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <span className="flex items-center gap-2.5">
                <AlertTriangle size={16} strokeWidth={1.8} className="text-[#FF3B30]" />
                <span>Active Issues</span>
              </span>
              {activeIssuesList.length > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#FF3B30]/10 text-[#FF3B30] font-semibold">{activeIssuesList.length}</span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]"></span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('repaired_issues')}
              className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl w-full text-left transition-all ${activeTab === 'repaired_issues' ? 'text-[#1D1D1F] bg-white border border-black/[0.06] font-semibold' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium'}`}
            >
              <Wrench size={16} strokeWidth={1.8} /> Repaired & Issues
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:h-auto print:block bg-[#F5F5F7] print:bg-white min-w-0">
        {/* Top Header (Apple Translucent Navigation Bar) */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-black/[0.06] bg-white/80 backdrop-blur-2xl z-10 shrink-0 print:hidden">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <button 
              type="button" 
              onClick={() => setIsMobileMenuOpen(true)} 
              className="p-2 -ml-2 rounded-xl text-[#1D1D1F] hover:bg-black/[0.04] md:hidden active:scale-95 transition"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-[17px] sm:text-[19px] font-semibold tracking-tight text-[#1D1D1F] truncate">
                {activeTab === 'reports' ? 'Daily Operations' : activeTab === 'assign' ? 'Cycle Assignments' : activeTab === 'manage_data' ? 'Master Archive' : activeTab === 'repaired_issues' ? 'Repaired & Issues' : 'Active Issues'}
              </h1>
            </div>
            <div className="w-7 md:hidden"></div>
          </div>
          {activeTab === 'reports' && (
            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center w-full sm:w-auto">
              <div className="flex-1 sm:flex-initial flex items-center bg-[#F5F5F7] hover:bg-[#EBEBED] border border-black/[0.04] rounded-full px-3.5 py-1.5 gap-2 transition justify-between sm:justify-start">
                <div className="flex items-center gap-2 w-full">
                  <Calendar size={14} className="text-[#6E6E73] shrink-0" />
                  <input 
                    type="date"
                    value={getLocalDateKey(selectedDate)}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setSelectedDate(new Date(y, m - 1, d));
                      }
                    }}
                    className="bg-transparent border-none text-[#1D1D1F] text-xs font-medium outline-none cursor-pointer w-full"
                  />
                </div>
              </div>
              <button
                onClick={generatePDF}
                className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-[#1D1D1F] hover:bg-black text-white rounded-full text-xs font-medium transition active:scale-[0.98]"
              >
                <FileText size={14} strokeWidth={1.8} /> Export PDF
              </button>
            </div>
          )}
        </div>

        {/* Mobile Horizontal Quick Navigation Tab Bar */}
        <div className="flex md:hidden print:hidden overflow-x-auto gap-1.5 px-3 py-2 bg-white/70 backdrop-blur-xl border-b border-black/[0.06] shrink-0 no-scrollbar">
          {[
            { id: 'reports', label: 'Daily Reports' },
            { id: 'assign', label: 'Assign Cycles' },
            { id: 'manage_data', label: 'Master Archive' },
            { id: 'issues', label: 'Active Issues', isAlert: true },
            { id: 'repaired_issues', label: 'Repaired & Issues' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === t.id
                  ? 'bg-[#1D1D1F] text-white'
                  : 'bg-[#F5F5F7] text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              {t.isAlert && <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]"></span>}
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content — Full width with just a little gap, zero drop shadow */}
        <div className="flex-1 overflow-y-auto print:overflow-visible print:h-auto print:p-0 p-2.5 sm:p-4">
          <div className="w-full print:max-w-none print:w-full print:block flex flex-col gap-3.5">

            {connectionError && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-900 flex items-start justify-between gap-4 print:hidden">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-950">Supabase Connection Warning</p>
                    <p className="mt-1 text-amber-800 leading-relaxed">{connectionError}</p>
                    <p className="mt-1.5 text-xs text-amber-700">
                      If your project is paused, sign in to{' '}
                      <a
                        href="https://supabase.com/dashboard"
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-semibold hover:text-amber-950"
                      >
                        supabase.com/dashboard
                      </a>{' '}
                      and click <strong>Restore / Unpause project</strong>.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsRetryingConnection(true);
                    fetchDashboardData().finally(() => setIsRetryingConnection(false));
                  }}
                  disabled={isRetryingConnection}
                  className="shrink-0 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isRetryingConnection ? <Loader2 size={14} className="animate-spin" /> : null}
                  Retry Connection
                </button>
              </div>
            )}

            {/* Assignments Card */}
            {activeTab === 'assign' && (
              <div className="flex flex-col gap-3.5">
                {/* 1. Multi-Row Routine Checkup Assigner (Single or Multiple Staff & Cycles at One Time) */}
                <div className="bg-white p-5 sm:p-6 rounded-2xl border border-black/[0.06]">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
                    <div>
                      <h3 className="text-[#1D1D1F] text-[17px] font-semibold tracking-tight">Routine Checkup — Assign Cycles to Staff</h3>
                      <p className="text-[13px] text-[#86868B] mt-0.5">
                        Type any staff name and assign a single cycle (e.g. 101) or multiple cycles (e.g. 101, 55, 89) at one time.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssignmentRows([...assignmentRows, { id: Date.now() + Math.random(), staff: '', cycles: '' }])}
                      className="self-start sm:self-auto px-3.5 py-2 bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] rounded-full text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Plus size={14} /> Add Another Person
                    </button>
                  </div>

                  <datalist id="admin-staff-suggestions">
                    <option value="Kabir" />
                    <option value="Laxman" />
                    <option value="Anish" />
                    <option value="Surya" />
                    <option value="Dipesh" />
                    <option value="Ram" />
                    <option value="Kiran" />
                    <option value="Sandesh" />
                  </datalist>

                  <div className="flex flex-col gap-3 mb-5">
                    {assignmentRows.map((row, idx) => (
                      <div key={row.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3 items-end bg-[#F5F5F7]/70 p-3 sm:p-3.5 rounded-2xl border border-black/[0.04]">
                        <div className="sm:col-span-5">
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">
                            Staff Name {assignmentRows.length > 1 ? `#${idx + 1}` : '(Type or Select)'}
                          </label>
                          <input
                            type="text"
                            list="admin-staff-suggestions"
                            placeholder="Type any name (e.g. Kabir, Ram...)"
                            value={row.staff}
                            onChange={e => setAssignmentRows(assignmentRows.map(r => r.id === row.id ? { ...r, staff: e.target.value } : r))}
                            className="w-full p-3 rounded-xl border border-black/[0.08] outline-none focus:ring-2 focus:ring-black/10 text-[#1D1D1F] text-sm bg-white transition"
                          />
                        </div>
                        <div className={assignmentRows.length > 1 ? 'sm:col-span-6' : 'sm:col-span-7'}>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">
                            Single or Multiple Cycle IDs
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 101  or  101, 55, 89"
                            value={row.cycles}
                            onChange={e => setAssignmentRows(assignmentRows.map(r => r.id === row.id ? { ...r, cycles: e.target.value } : r))}
                            className="w-full p-3 rounded-xl border border-black/[0.08] outline-none focus:ring-2 focus:ring-black/10 text-[#1D1D1F] text-sm bg-white transition"
                          />
                        </div>
                        {assignmentRows.length > 1 && (
                          <div className="sm:col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setAssignmentRows(assignmentRows.filter(r => r.id !== row.id))}
                              className="p-2.5 text-[#86868B] hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                              title="Remove row"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      disabled={assigning}
                      onClick={handleBulkAssign}
                      className="w-full sm:w-auto px-6 py-2.5 bg-[#1D1D1F] text-white rounded-full hover:bg-black transition text-[13px] font-semibold disabled:opacity-50 active:scale-[0.98]"
                    >
                      {assigning ? 'Assigning...' : assignmentRows.length > 1 ? `Assign All (${assignmentRows.length} Staff)` : 'Assign Cycles'}
                    </button>
                    {assignMsg && <span className="text-[13px] font-medium text-[#1D1D1F] bg-[#F5F5F7] px-3 py-1 rounded-full">{assignMsg}</span>}
                  </div>
                </div>

                {/* 2. Blank Paper — Write Anything & Free-Form Routine Assignment Notepad */}
                <div className="bg-white p-5 sm:p-6 rounded-2xl border border-black/[0.06]">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[#1D1D1F] text-[17px] font-semibold tracking-tight">Blank Paper — Routine Checkup Notepad</h3>
                        {blankPaperSavedMsg && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F5F5F7] text-[#1D1D1F]">
                            <Check size={11} /> {blankPaperSavedMsg}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-[#86868B] mt-0.5">
                        Write anything freely like a blank paper on mobile or desktop. Format <code className="bg-[#F5F5F7] px-1.5 py-0.5 rounded text-[#1D1D1F] text-xs">Name: 101, 55, 89</code> syncs in 1 tap.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSyncBlankPaperToAssignments}
                        className="px-4 py-2 bg-[#1D1D1F] hover:bg-black text-white rounded-full text-xs font-semibold transition active:scale-95"
                      >
                        Sync Lines to Assignments
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Clear this blank paper?")) {
                            handleSaveBlankPaper('');
                          }
                        }}
                        className="px-3.5 py-2 bg-[#F5F5F7] hover:bg-red-50 text-[#6E6E73] hover:text-red-600 rounded-full text-xs font-medium transition active:scale-95"
                      >
                        Clear Paper
                      </button>
                    </div>
                  </div>

                  <div className="relative rounded-2xl border border-black/[0.07] bg-[#FBFBFD] overflow-hidden focus-within:ring-2 focus-within:ring-black/10 transition">
                    <textarea
                      rows={7}
                      value={blankPaperText}
                      onChange={e => handleSaveBlankPaper(e.target.value)}
                      placeholder={"Write anything here like a blank paper...\n\nExample:\nKabir: 101, 55, 89\nLaxman: 204\nRam: 12, 18, 25\n\nNotes: Check brakes and battery lock on Cycle 55 today."}
                      className="w-full p-4 sm:p-5 bg-transparent border-none outline-none text-[15px] text-[#1D1D1F] placeholder-[#86868B] leading-relaxed resize-y font-sans"
                    />
                  </div>
                </div>

                {/* 3. Today's Assigned Cycles Display with Mobile & Desktop Inline Edit / Delete */}
                <div className="bg-white p-5 sm:p-6 rounded-2xl border border-black/[0.06]">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-[#1D1D1F] text-[17px] font-semibold tracking-tight">Today's Assigned Cycles</h3>
                    {Object.keys(currentAssignments).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Clear all assigned cycles for today?")) {
                            persistAssignments({}, []);
                          }
                        }}
                        className="text-xs font-medium text-[#86868B] hover:text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50 transition"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {Object.keys(currentAssignments).length === 0 ? (
                    <p className="text-sm text-[#86868B]">No cycles have been assigned to anyone for today.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      {Object.entries(currentAssignments).map(([staff, cycles]) => {
                        const isEditingThis = editingAssignment && editingAssignment.originalStaff === staff;
                        return (
                          <div key={staff} className="p-4 bg-[#F5F5F7]/70 rounded-2xl border border-black/[0.05] flex flex-col justify-between gap-3">
                            {isEditingThis ? (
                              <div className="flex flex-col gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">Staff Name</label>
                                  <input
                                    type="text"
                                    list="admin-staff-suggestions"
                                    value={editingAssignment.staff}
                                    onChange={e => setEditingAssignment({ ...editingAssignment, staff: e.target.value })}
                                    className="w-full p-2.5 rounded-xl bg-white border border-black/[0.08] text-sm text-[#1D1D1F] outline-none focus:ring-2 focus:ring-black/10"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">Assigned Cycles</label>
                                  <input
                                    type="text"
                                    value={editingAssignment.cycles}
                                    onChange={e => setEditingAssignment({ ...editingAssignment, cycles: e.target.value })}
                                    placeholder="e.g. 101, 55, 89"
                                    className="w-full p-2.5 rounded-xl bg-white border border-black/[0.08] text-sm text-[#1D1D1F] outline-none focus:ring-2 focus:ring-black/10"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-2 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingAssignment(null)}
                                    className="px-3 py-1.5 rounded-full bg-black/[0.06] text-[#1D1D1F] text-xs font-medium hover:bg-black/[0.1] transition"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveEditAssignment}
                                    className="px-3.5 py-1.5 rounded-full bg-[#1D1D1F] text-white text-xs font-semibold hover:bg-black transition"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <h4 className="font-semibold text-[#1D1D1F] text-[15px] tracking-tight">{staff}</h4>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => setEditingAssignment({ originalStaff: staff, staff, cycles })}
                                        className="p-1.5 text-[#86868B] hover:text-[#1D1D1F] hover:bg-white rounded-lg transition"
                                        title="Edit name or cycles"
                                      >
                                        <Edit3 size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAssignment(staff)}
                                        className="p-1.5 text-[#86868B] hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                        title="Delete assignment"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {String(cycles).split(',').map((c, i) => c.trim()).filter(Boolean).map((cId, i) => (
                                      <span key={i} className="px-2.5 py-1 bg-white border border-black/[0.06] rounded-lg text-xs font-semibold text-[#1D1D1F]">
                                        #{cId}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2-Week Schedule UI */}
                <div className="bg-white p-5 sm:p-6 rounded-2xl border border-black/[0.06]">
                  <h3 className="text-[#1D1D1F] text-[17px] font-semibold tracking-tight mb-4">Upcoming Schedule (Next 14 Days)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="border-b border-black/[0.06] text-[11px] text-[#86868B] uppercase tracking-wider">
                          <th className="py-3 px-4 font-semibold">Date</th>
                          <th className="py-3 px-4 font-semibold">Overall Visit</th>
                          <th className="py-3 px-4 font-semibold">Station Visit</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-black/[0.04]">
                        {upcomingSchedule.map((day, idx) => (
                          <tr key={idx} className="hover:bg-[#F5F5F7]/60 transition">
                            <td className="py-3.5 px-4 font-medium text-[#1D1D1F]">
                              {day.dateString}
                              {idx === 0 && <span className="ml-2.5 px-2.5 py-0.5 bg-[#1D1D1F] text-white rounded-full text-[10px] uppercase font-semibold tracking-wider">Today</span>}
                              {idx === 1 && <span className="ml-2.5 px-2.5 py-0.5 bg-[#F5F5F7] text-[#6E6E73] rounded-full text-[10px] uppercase font-semibold tracking-wider">Tomorrow</span>}
                            </td>
                            <td className="py-3.5 px-4 text-[#1D1D1F]">
                              {day.overall ? (
                                <div className="flex items-center gap-3">
                                  {idx === 0 ? (
                                    <select 
                                      value={day.overall}
                                      onChange={(e) => handleOverrideAssign(day.dateKey, 'overall', e.target.value)}
                                      className="font-medium text-[#1D1D1F] bg-[#F5F5F7] border border-black/[0.08] rounded-lg px-2.5 py-1 outline-none focus:ring-2 focus:ring-black/10 text-sm"
                                    >
                                      {['Kabir', 'Laxman', 'Anish', 'Surya', 'Dipesh'].map(name => (
                                        <option key={name} value={name}>{name}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="font-medium text-[#1D1D1F]">{day.overall}</span>
                                  )}
                                  {idx === 0 && <button onClick={() => handlePostpone(day.dateKey, 'overall')} className="px-2.5 py-1 bg-[#F5F5F7] hover:bg-red-50 text-[#6E6E73] hover:text-red-600 rounded-full text-xs font-medium transition">Postpone</button>}
                                </div>
                              ) : postponements.overall.includes(day.dateKey) ? (
                                <div className="flex items-center gap-3">
                                  <span className="text-red-600 font-medium text-xs">Postponed</span>
                                  <button onClick={() => handleUndoPostpone(day.dateKey, 'overall')} className="px-2.5 py-1 bg-[#F5F5F7] text-[#1D1D1F] rounded-full text-xs hover:bg-[#E8E8ED] font-medium transition">Undo</button>
                                </div>
                              ) : <span className="text-[#86868B]">—</span>}
                            </td>
                            <td className="py-3.5 px-4 text-[#1D1D1F]">
                              {day.station ? (
                                <div className="flex items-center gap-3">
                                  {idx === 0 ? (
                                    <select 
                                      value={day.station}
                                      onChange={(e) => handleOverrideAssign(day.dateKey, 'station', e.target.value)}
                                      className="font-medium text-[#1D1D1F] bg-[#F5F5F7] border border-black/[0.08] rounded-lg px-2.5 py-1 outline-none focus:ring-2 focus:ring-black/10 text-sm"
                                    >
                                      {['Kabir', 'Laxman', 'Anish', 'Surya', 'Dipesh'].map(name => (
                                        <option key={name} value={name}>{name}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="font-medium text-[#1D1D1F]">{day.station}</span>
                                  )}
                                  {idx === 0 && <button onClick={() => handlePostpone(day.dateKey, 'station')} className="px-2.5 py-1 bg-[#F5F5F7] hover:bg-red-50 text-[#6E6E73] hover:text-red-600 rounded-full text-xs font-medium transition">Postpone</button>}
                                </div>
                              ) : postponements.station.includes(day.dateKey) ? (
                                <div className="flex items-center gap-3">
                                  <span className="text-red-600 font-medium text-xs">Postponed</span>
                                  <button onClick={() => handleUndoPostpone(day.dateKey, 'station')} className="px-2.5 py-1 bg-[#F5F5F7] text-[#1D1D1F] rounded-full text-xs hover:bg-[#E8E8ED] font-medium transition">Undo</button>
                                </div>
                              ) : <span className="text-[#86868B]">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Settings / Visibility UI */}
                <div className="bg-white p-5 sm:p-6 rounded-2xl border border-black/[0.06]">
                  <h3 className="text-[#1D1D1F] text-[17px] font-semibold tracking-tight mb-1">App Visibility Controls</h3>
                  <p className="text-[13px] text-[#86868B] mb-4">Toggle which task forms are visible in the main staff portal.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {[
                      { key: 'routine', label: 'Routine' },
                      { key: 'pretask', label: 'Check List' },
                      { key: 'overall', label: 'Overall' },
                      { key: 'station', label: 'Station' },
                      { key: 'maintenance', label: 'Maintenance' },
                      { key: 'battery_swap', label: 'Standard Battery Swap' },
                      { key: 'home_battery_swap', label: 'Home Battery Swap' },
                      { key: 'home_cycle', label: 'Home Cycle' },
                      { key: 'battery_test', label: 'Battery Test' },
                      { key: 'offline_cycles', label: 'Offline Cycles' },
                      { key: 'feedback', label: 'Cycle Feedback' }
                    ].map(form => {
                      const isHidden = hiddenForms[form.key];
                      return (
                        <div key={form.key} className="flex justify-between items-center bg-[#F5F5F7]/70 px-3.5 py-3 rounded-2xl border border-black/[0.04]">
                          <span className="font-medium text-[#1D1D1F] text-[13px]">{form.label}</span>
                          <button 
                            onClick={() => handleToggleFormVisibility(form.key)} 
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${isHidden ? 'bg-black/[0.06] text-[#86868B] hover:bg-black/[0.1]' : 'bg-[#1D1D1F] text-white hover:bg-black'}`}
                          >
                            {isHidden ? 'Hidden' : 'Visible'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

            {/* Master Database UI */}
            {activeTab === 'manage_data' && (
              <div className="w-full">
                {/* Header Section */}
                <div className="flex flex-col gap-4 mb-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div>
                      <h3 className="text-[#1D1D1F] text-lg font-semibold tracking-tight">Master Data Archive</h3>
                      <p className="text-xs text-[#86868B]">Browse, filter, inspect, or edit all submitted operational logs.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                      <div className="relative w-full sm:w-64">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
                        <input 
                          type="text"
                          placeholder="Search cycle, staff..."
                          value={dataSearch}
                          onChange={e => setDataSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-white border border-black/[0.08] outline-none focus:ring-2 focus:ring-black/10 text-[13px] rounded-full text-[#1D1D1F] placeholder-[#86868B] transition-all"
                        />
                      </div>
                      <div className="relative">
                        <div className="flex items-center bg-white border border-black/[0.08] rounded-full px-3.5 py-2 transition-all focus-within:ring-2 focus-within:ring-black/10 justify-between sm:justify-start">
                          <div className="flex items-center">
                            <Filter size={14} className="text-[#86868B] mr-2 shrink-0" />
                            <input 
                              type="date"
                              value={dataDateFilter}
                              onChange={e => setDataDateFilter(e.target.value)}
                              className="bg-transparent border-none outline-none text-[13px] text-[#1D1D1F] w-full sm:w-[125px] cursor-pointer"
                            />
                          </div>
                          {dataDateFilter && (
                            <button onClick={() => setDataDateFilter('')} className="ml-1.5 text-[#86868B] hover:text-[#1D1D1F]">
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Pills */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide no-scrollbar">
                    {['All', 'Routine Checkup', 'Pre-Task Check', 'Overall Checkup', 'Station Visit', 'Maintenance', 'Battery Swap', 'Home Cycle', 'Battery Test'].map(filter => (
                      <button 
                        key={filter}
                        onClick={() => setDataFilter(filter)}
                        className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border ${
                          dataFilter === filter
                            ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]'
                            : 'bg-white text-[#6E6E73] border-black/[0.07] hover:text-[#1D1D1F] hover:border-black/15'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table Section */}
                <div className="overflow-x-auto bg-white rounded-2xl border border-black/[0.06]">
                  <table className="w-full text-left min-w-[640px]">
                    <thead>
                      <tr className="text-[11px] text-[#86868B] uppercase tracking-wider border-b border-black/[0.06]">
                        <th className="py-3.5 px-4 font-semibold">Cycle</th>
                        <th className="py-3.5 px-4 font-semibold">Type</th>
                        <th className="py-3.5 px-4 font-semibold">Staff</th>
                        <th className="py-3.5 px-4 font-semibold">Date &amp; Time</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04] text-sm">
                      {isLoadingGlobal ? (
                        <tr><td colSpan="5" className="py-12 text-center text-[#86868B]">Loading master database...</td></tr>
                      ) : (
                        globalData
                          .filter(item => dataFilter === 'All' || item.task_type === dataFilter)
                          .filter(item => {
                            if (!dataSearch.trim()) return true;
                            const term = dataSearch.toLowerCase();
                            return String(item.cycle_id).includes(term) || item.staff_name.toLowerCase().includes(term);
                          })
                          .filter(item => {
                            if (!dataDateFilter) return true;
                            const itemDate = new Date(item.created_at).toISOString().split('T')[0];
                            return itemDate === dataDateFilter;
                          })
                          .map(item => {
                            const hasIssue = item.condition === 'issue' || !!item.issue;
                            return (
                          <tr key={`${item.source}-${item.id}`} className="hover:bg-[#F5F5F7]/60 transition-colors group">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[#1D1D1F] text-[14px]">#{item.cycle_id}</span>
                                {hasIssue && (
                                  <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 border border-red-200/60 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                    <AlertTriangle size={10} /> Issue
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#F5F5F7] text-[#1D1D1F] border border-black/[0.05]">
                                {item.task_type}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-[#1D1D1F] font-medium text-[13px] flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-[#F5F5F7] border border-black/[0.06] flex items-center justify-center text-[11px] font-semibold text-[#1D1D1F]">
                                {item.staff_name.charAt(0)}
                              </div>
                              {item.staff_name}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-[#1D1D1F] font-medium block text-[13px]">{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              <span className="text-[#86868B] text-[11px]">{new Date(item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setViewingRecord(item)} className="p-1.5 text-[#86868B] hover:text-[#1D1D1F] hover:bg-white rounded-lg transition" title="View Details">
                                  <Eye size={15} />
                                </button>
                                <button onClick={() => setEditingRecord(item)} className="p-1.5 text-[#86868B] hover:text-[#1D1D1F] hover:bg-white rounded-lg transition" title="Edit">
                                  <Edit3 size={15} />
                                </button>
                                <button onClick={() => handleDeleteRecord(item.source, item.id)} className="p-1.5 text-[#86868B] hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          )
                        })
                      )}
                      {(!isLoadingGlobal && globalData.length === 0) && (
                        <tr><td colSpan="5" className="py-12 text-center text-[#86868B]">No records found matching your search.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Active Issues UI */}
            {activeTab === 'issues' && (
              <div className="w-full">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-[#1D1D1F] text-lg font-semibold tracking-tight">Active Cycle Issues</h3>
                    <p className="text-xs text-[#86868B]">Cycles flagged with unresolved maintenance or operational issues.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {activeIssuesList.length === 0 ? (
                    <div className="col-span-full p-10 text-center bg-white rounded-2xl border border-black/[0.06]">
                      <p className="text-[#86868B] text-sm">No active issues found. All cycles are operating smoothly.</p>
                    </div>
                  ) : activeIssuesList.map(issue => (
                    <div key={issue.id} className="bg-white p-5 rounded-2xl border border-black/[0.06] flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                              <h4 className="text-xl font-bold text-[#1D1D1F] tracking-tight">#{issue.cycle_id}</h4>
                            </div>
                            <span className="text-[11px] font-medium text-[#86868B] uppercase tracking-wider">{issue.task_type || 'Reported Issue'}</span>
                          </div>
                          <button onClick={() => handleResolveIssue(issue)} className="px-3 py-1.5 bg-[#1D1D1F] text-white text-xs font-semibold rounded-full hover:bg-black transition active:scale-95">
                            Mark Solved
                          </button>
                        </div>
                        <p className="text-[13px] text-[#1D1D1F] bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04] leading-relaxed">{issue.issue || issue.parts_checked || 'No details provided.'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Repaired & Issues UI */}
            {activeTab === 'repaired_issues' && (
              <div className="w-full">
                <div className="flex flex-col gap-4 mb-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div>
                      <h3 className="text-[#1D1D1F] text-lg font-semibold tracking-tight">Repaired &amp; Issues Archive</h3>
                      <p className="text-xs text-[#86868B]">Historical log of all reported cycle issues and completed maintenance repairs.</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="relative w-full sm:w-64">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
                        <input 
                          type="text"
                          placeholder="Search cycle, staff..."
                          value={repairedSearch}
                          onChange={e => setRepairedSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-white border border-black/[0.08] outline-none focus:ring-2 focus:ring-black/10 text-[13px] rounded-full text-[#1D1D1F] placeholder-[#86868B] transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto bg-white rounded-2xl border border-black/[0.06]">
                  <table className="w-full text-left min-w-[680px]">
                    <thead>
                      <tr className="text-[11px] text-[#86868B] uppercase tracking-wider border-b border-black/[0.06]">
                        <th className="py-3.5 px-4 font-semibold">Cycle</th>
                        <th className="py-3.5 px-4 font-semibold">Type</th>
                        <th className="py-3.5 px-4 font-semibold">Issue / Repair Details</th>
                        <th className="py-3.5 px-4 font-semibold">Staff</th>
                        <th className="py-3.5 px-4 font-semibold">Date &amp; Time</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04] text-sm">
                      {isLoadingRepairedIssues ? (
                        <tr><td colSpan="6" className="py-12 text-center text-[#86868B]">Loading data...</td></tr>
                      ) : (
                        repairedIssuesData
                          .filter(item => {
                            if (!repairedSearch.trim()) return true;
                            const term = repairedSearch.toLowerCase();
                            return String(item.cycle_id).includes(term) || item.staff_name.toLowerCase().includes(term);
                          })
                          .map(item => {
                            const isMaintenance = item.source === 'maintenance';
                            return (
                          <tr key={`${item.source}-${item.id}`} className="hover:bg-[#F5F5F7]/60 transition-colors group">
                            <td className="py-3.5 px-4">
                              <span className="font-semibold text-[#1D1D1F] text-[14px]">#{item.cycle_id}</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                                isMaintenance
                                  ? 'bg-[#F5F5F7] text-[#1D1D1F] border-black/[0.06]'
                                  : 'bg-red-50 text-red-600 border-red-200/60'
                              }`}>
                                {isMaintenance ? 'Repair (Maintenance)' : 'Reported Issue'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-[#1D1D1F] text-[13px] max-w-[240px] truncate">
                               {item.issue || item.parts_checked || 'No details provided'}
                               {isMaintenance && item.status && <span className="ml-2 text-[10px] text-[#6E6E73] bg-[#F5F5F7] px-2 py-0.5 rounded-full">{item.status}</span>}
                            </td>
                            <td className="py-3.5 px-4 text-[#6E6E73] font-medium text-[13px]">
                              {item.staff_name}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-[#1D1D1F] font-medium block text-[13px]">{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              <span className="text-[#86868B] text-[11px]">{new Date(item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setViewingRecord(item)} className="p-1.5 text-[#86868B] hover:text-[#1D1D1F] hover:bg-white rounded-lg transition" title="View Details">
                                  <Eye size={15} />
                                </button>
                                <button onClick={() => setEditingRecord(item)} className="p-1.5 text-[#86868B] hover:text-[#1D1D1F] hover:bg-white rounded-lg transition" title="Edit">
                                  <Edit3 size={15} />
                                </button>
                                <button onClick={() => handleDeleteRecord(item.source, item.id)} className="p-1.5 text-[#86868B] hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          )
                        })
                      )}
                      {(!isLoadingRepairedIssues && repairedIssuesData.length === 0) && (
                        <tr><td colSpan="6" className="py-12 text-center text-[#86868B]">No records found matching your search.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <>
                <div className="print:hidden">
                  {/* Unified Apple Pages-Style Full-Width Control Bar (No Drop Shadow) */}
                  <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-2xl border border-black/[0.06] rounded-2xl p-2.5 sm:px-4 sm:py-3 mb-3.5 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                      {/* Left: Studio Title & Status */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-[13px] font-semibold tracking-tight text-[#1D1D1F]">
                          Report Studio
                        </span>
                        <span className="text-[11px] bg-[#F5F5F7] text-[#6E6E73] px-2 py-0.5 rounded-md font-medium border border-black/[0.04]">
                          Play
                        </span>
                        <span 
                          id="live-save-status-badge"
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium transition-opacity duration-300 opacity-0 pointer-events-none"
                        >
                          <Check size={12} /> Saved
                        </span>
                      </div>

                      {/* Right: Minimalist Monochrome Apple Capsule Controls */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isAnalyzingSummaries}
                          onClick={() => handleAnalyzeReportAndGenerateSummaries('all')}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 active:scale-[0.98] bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] disabled:opacity-50"
                          title="Automatically analyze the report and write Opening, Individual Staff Work, and Closing Summary"
                        >
                          {isAnalyzingSummaries ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-[#1D1D1F]" />}
                          {isAnalyzingSummaries ? 'Analyzing...' : 'Auto-Summarize'}
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenGeminiModal}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 active:scale-[0.98] bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F]"
                          title="Choose which title body to refine & manage Gemini AI"
                        >
                          <Wand2 size={13} className="text-[#1D1D1F]" />
                          {isRefiningEntireReport ? 'Refining...' : 'AI Refine'}
                        </button>
                        {!isEditingNotes ? (
                          <button
                            onClick={() => setIsEditingNotes(true)}
                            className="px-3 py-1.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] rounded-xl text-xs font-medium transition active:scale-[0.98]"
                          >
                            Overrides
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 bg-[#F5F5F7] p-0.5 rounded-xl">
                            <button onClick={() => setIsEditingNotes(false)} className="px-2.5 py-1 text-[#6E6E73] hover:text-[#1D1D1F] rounded-lg text-xs font-medium transition">
                              Close
                            </button>
                            <button onClick={handleUpdateNotes} className="px-2.5 py-1 bg-[#1D1D1F] text-white rounded-lg text-xs font-medium hover:bg-black transition">
                              Save
                            </button>
                            <button onClick={handleClearNotes} className="px-2.5 py-1 text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-lg text-xs font-medium transition">
                              Clear
                            </button>
                          </div>
                        )}
                        <button 
                          onClick={() => setIsLiveEditMode(!isLiveEditMode)} 
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 active:scale-[0.98] ${
                            isLiveEditMode
                              ? 'bg-[#1D1D1F] text-white'
                              : 'bg-white border border-black/[0.1] text-[#1D1D1F] hover:bg-[#F5F5F7]'
                          }`}
                        >
                          <Edit3 size={13} />
                          {isLiveEditMode ? 'Done Editing' : 'Edit Document'}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Apple Pages Formatting Ribbon (when Edit Document is active) */}
                    {isLiveEditMode && (
                      <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] flex flex-col gap-2 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Typography: Bold / Italic / Underline */}
                            <div className="flex items-center bg-[#F5F5F7] p-0.5 rounded-xl shrink-0">
                              <button
                                type="button"
                                onClick={() => handleFormat('bold')}
                                className="p-1.5 hover:bg-white text-[#1D1D1F] rounded-lg transition active:scale-90"
                                title="Bold (Ctrl+B)"
                              >
                                <Bold size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFormat('italic')}
                                className="p-1.5 hover:bg-white text-[#1D1D1F] rounded-lg transition active:scale-90"
                                title="Italic (Ctrl+I)"
                              >
                                <Italic size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFormat('underline')}
                                className="p-1.5 hover:bg-white text-[#1D1D1F] rounded-lg transition active:scale-90"
                                title="Underline (Ctrl+U)"
                              >
                                <Underline size={14} />
                              </button>
                            </div>

                            {/* Headings */}
                            <div className="flex items-center bg-[#F5F5F7] p-0.5 rounded-xl shrink-0">
                              <button
                                type="button"
                                onClick={() => handleFormat('formatBlock', '<h2>')}
                                className="px-2 py-1 hover:bg-white text-[#1D1D1F] rounded-lg text-[11px] font-semibold transition active:scale-90"
                                title="Main Heading (H2)"
                              >
                                H2
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFormat('formatBlock', '<h3>')}
                                className="px-2 py-1 hover:bg-white text-[#1D1D1F] rounded-lg text-[11px] font-semibold transition active:scale-90"
                                title="Section Heading (H3)"
                              >
                                H3
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFormat('formatBlock', '<p>')}
                                className="px-2 py-1 hover:bg-white text-[#1D1D1F] rounded-lg text-[11px] font-medium transition active:scale-90"
                                title="Body Paragraph"
                              >
                                ¶
                              </button>
                            </div>

                            {/* Font Size Scaling */}
                            <div className="flex items-center gap-0.5 bg-[#F5F5F7] p-0.5 rounded-xl shrink-0">
                              <button
                                type="button"
                                onClick={handleDecreaseFontSize}
                                className="px-2 py-1 hover:bg-white text-[#1D1D1F] rounded-lg text-[11px] font-semibold transition active:scale-90"
                                title="Decrease Font Size"
                              >
                                A-
                              </button>
                              <span className="text-[11px] font-medium text-[#6E6E73] px-1">{reportFontSize}px</span>
                              <button
                                type="button"
                                onClick={handleIncreaseFontSize}
                                className="px-2 py-1 hover:bg-white text-[#1D1D1F] rounded-lg text-[11px] font-semibold transition active:scale-90"
                                title="Increase Font Size"
                              >
                                A+
                              </button>
                            </div>

                            {/* Lists & Alignment */}
                            <div className="flex items-center bg-[#F5F5F7] p-0.5 rounded-xl shrink-0">
                              <button
                                type="button"
                                onClick={() => handleFormat('insertUnorderedList')}
                                className="p-1.5 hover:bg-white text-[#1D1D1F] rounded-lg transition active:scale-90"
                                title="Bullet List"
                              >
                                <List size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFormat('insertOrderedList')}
                                className="p-1.5 hover:bg-white text-[#1D1D1F] rounded-lg transition active:scale-90"
                                title="Numbered List"
                              >
                                <ListOrdered size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFormat('justifyLeft')}
                                className="p-1.5 hover:bg-white text-[#1D1D1F] rounded-lg transition active:scale-90"
                                title="Align Left"
                              >
                                <AlignLeft size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFormat('justifyCenter')}
                                className="p-1.5 hover:bg-white text-[#1D1D1F] rounded-lg transition active:scale-90"
                                title="Align Center"
                              >
                                <AlignCenter size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFormat('justifyRight')}
                                className="p-1.5 hover:bg-white text-[#1D1D1F] rounded-lg transition active:scale-90"
                                title="Align Right"
                              >
                                <AlignRight size={14} />
                              </button>
                            </div>

                            {/* Document & History Actions */}
                            <button
                              type="button"
                              onClick={handleUndo}
                              className="shrink-0 px-2.5 py-1.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] rounded-xl text-[11px] font-medium flex items-center gap-1 transition active:scale-95"
                              title="Undo last change (Ctrl+Z / Cmd+Z)"
                            >
                              <RotateCcw size={13} /> Undo
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAddTitleModal({ tableOnly: false })}
                              className="shrink-0 px-2.5 py-1.5 bg-[#1D1D1F] hover:bg-black text-white rounded-xl text-[11px] font-medium flex items-center gap-1 transition active:scale-95"
                              title="Add a new title (numbering managed automatically)"
                            >
                              <PlusCircle size={13} /> Title
                            </button>
                            <button
                              type="button"
                              onClick={handleRemoveActiveSection}
                              className="shrink-0 px-2.5 py-1.5 bg-[#F5F5F7] hover:bg-red-50 text-[#86868B] hover:text-red-600 rounded-xl text-[11px] font-medium flex items-center gap-1 transition active:scale-95"
                              title="Remove selected title/section and renumber automatically"
                            >
                              <MinusCircle size={13} /> - Title
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAddTitleModal({ tableOnly: true })}
                              className="shrink-0 px-2.5 py-1.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] rounded-xl text-[11px] font-medium flex items-center gap-1 transition active:scale-95"
                              title="Create and insert a new table box with custom columns and rows"
                            >
                              <TableIcon size={13} /> + Table Box
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTableInReport()}
                              className="shrink-0 px-2.5 py-1.5 bg-[#F5F5F7] hover:bg-red-50 text-[#86868B] hover:text-red-600 rounded-xl text-[11px] font-medium flex items-center gap-1 transition active:scale-95"
                              title="Delete active table box"
                            >
                              <Trash2 size={13} /> Delete Box
                            </button>
                            <button
                              type="button"
                              onClick={handleRestoreHomeCyclesSection}
                              className="shrink-0 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/60 rounded-xl text-[11px] font-medium flex items-center gap-1 transition active:scale-95"
                              title="Restore Home Cycles section if removed"
                            >
                              <RotateCcw size={13} /> Restore "Home Cycles"
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenReorderTitlesModal}
                              className="shrink-0 px-2.5 py-1.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] rounded-xl text-[11px] font-medium flex items-center gap-1 transition active:scale-95"
                              title="Manage, reorder, or delete titles (auto-renumbered)"
                            >
                              <ListFilter size={13} /> Reorder
                            </button>

                            {/* Quick Table Row & Column Controls */}
                            <div className="flex items-center bg-[#F5F5F7] p-0.5 rounded-xl shrink-0">
                              <button
                                type="button"
                                onClick={handleAddTableRowInReport}
                                className="px-2 py-1 hover:bg-white text-[#1D1D1F] rounded-lg text-[11px] font-medium transition active:scale-90"
                                title="Add row to active table"
                              >
                                +Row
                              </button>
                              <button
                                type="button"
                                onClick={handleAddTableColInReport}
                                className="px-2 py-1 hover:bg-white text-[#1D1D1F] rounded-lg text-[11px] font-medium transition active:scale-90"
                                title="Add column to active table"
                              >
                                +Col
                              </button>
                              <button
                                type="button"
                                onClick={handleRemoveTableRowInReport}
                                className="px-2 py-1 hover:bg-white text-[#6E6E73] hover:text-[#FF3B30] rounded-lg text-[11px] font-medium transition active:scale-90"
                                title="Remove last row from active table"
                              >
                                -Row
                              </button>
                              <button
                                type="button"
                                onClick={handleRemoveTableColInReport}
                                className="px-2 py-1 hover:bg-white text-[#6E6E73] hover:text-[#FF3B30] rounded-lg text-[11px] font-medium transition active:scale-90"
                                title="Remove last column from active table"
                              >
                                -Col
                              </button>
                            </div>
                          </div>

                          {/* Right: Logo & Reset Controls */}
                          <div className="flex items-center gap-1.5 shrink-0 pl-2">
                            <input 
                              type="file" 
                              ref={logoInputRef} 
                              accept="image/*" 
                              className="hidden" 
                              onChange={handleLogoUpload} 
                            />
                            <button
                              type="button"
                              onClick={() => logoInputRef.current?.click()}
                              className="px-2.5 py-1.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-[11px] font-medium rounded-xl flex items-center gap-1 transition active:scale-95"
                              title="Upload or change logo"
                            >
                              <ImageIcon size={13} /> {reportLogo ? 'Logo' : '+ Logo'}
                            </button>
                            {reportLogo && (
                              <div className="flex items-center gap-1">
                                <select
                                  value={reportLogoSize}
                                  onChange={(e) => {
                                    setReportLogoSize(e.target.value);
                                    localStorage.setItem('zum_report_logo_size', e.target.value);
                                    setTimeout(saveCurrentReportHtml, 100);
                                  }}
                                  className="text-[11px] bg-[#F5F5F7] rounded-xl px-2 py-1.5 text-[#1D1D1F] font-medium outline-none cursor-pointer"
                                  title="Logo Size"
                                >
                                  <option value="40">S</option>
                                  <option value="56">M</option>
                                  <option value="76">L</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={handleRemoveLogo}
                                  className="p-1.5 text-[#86868B] hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-lg transition"
                                  title="Remove logo"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={handleResetReport}
                              className="px-2.5 py-1.5 text-[#6E6E73] hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-xl text-[11px] font-medium transition flex items-center gap-1"
                              title="Restore original automated report"
                            >
                              <RotateCcw size={12} /> Reset
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {isEditingNotes && (
                    <div className="flex flex-col gap-4 mb-4 bg-white rounded-2xl p-5 border border-black/[0.06]">
                      {/* AI Command Box */}
                      <div className="bg-[#F5F5F7] p-4 rounded-2xl">
                        <label className="block text-xs font-semibold text-[#1D1D1F] mb-1 flex items-center gap-1.5">
                          <Wand2 size={14} /> AI Assistant
                        </label>
                        <p className="text-xs text-[#6E6E73] mb-3">Tell the AI what to add or change in the report, and it will update the section automatically.</p>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="e.g. Add that cycle 200 had a flat tire..."
                            className="flex-1 px-3.5 py-2.5 rounded-xl border border-black/[0.08] outline-none text-xs sm:text-sm text-[#1D1D1F] bg-white focus:border-black/25 transition"
                            value={aiCommand}
                            onChange={e => setAiCommand(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAICommand()}
                            disabled={isProcessingCommand}
                          />
                          <button 
                            onClick={handleAICommand}
                            disabled={isProcessingCommand || !aiCommand.trim()}
                            className="px-4 py-2.5 bg-[#1D1D1F] text-white rounded-xl text-xs font-medium hover:bg-black transition disabled:opacity-40 flex items-center gap-1.5"
                          >
                            {isProcessingCommand ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#86868B] mb-1.5">Section to Override</label>
                        <select 
                          className="w-full p-3 rounded-xl border border-black/[0.06] outline-none text-xs sm:text-sm text-[#1D1D1F] appearance-none bg-[#F5F5F7] focus:bg-white focus:border-black/20 cursor-pointer transition"
                          value={activeEditSection}
                          onChange={e => setActiveEditSection(e.target.value)}
                        >
                          {Object.entries(sectionTitles).map(([key, title]) => (
                            <option key={key} value={key}>{title}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="flex justify-between items-end mb-1.5">
                          <label className="block text-xs font-medium text-[#86868B]">Custom Text (Leave empty for automated text)</label>
                          <button 
                            onClick={handleRefine}
                            disabled={isRefining || !overrides[activeEditSection]}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] disabled:opacity-40"
                          >
                            {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                            {isRefining ? 'Refining...' : 'Polish Tone'}
                          </button>
                        </div>
                        {activeEditSection === 'individual' && staffWork.size > 0 && (
                          <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-[11px] text-[#86868B]">
                              Live detected staff ({staffWork.size}): {Array.from(staffWork.keys()).join(', ')}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const allStaffText = Array.from(staffWork.entries())
                                  .map(([staff, activities]) => `${staff}: ${activities.join('; ')}.`)
                                  .join('\n\n');
                                setOverrides(prev => ({ ...prev, individual: allStaffText }));
                              }}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                            >
                              ✨ Load All ({staffWork.size}) Staff Details
                            </button>
                          </div>
                        )}
                        <textarea 
                          className="w-full p-4 rounded-xl border border-black/[0.06] outline-none text-xs sm:text-sm text-[#1D1D1F] whitespace-pre-wrap bg-[#F5F5F7] focus:bg-white focus:border-black/20 transition"
                          rows="4"
                          placeholder={`Type custom text for ${sectionTitles[activeEditSection]}...`}
                          value={overrides[activeEditSection]}
                          onChange={e => setOverrides({ ...overrides, [activeEditSection]: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>

      {/* Full-Width Flat Apple Report Document Sheet (No Drop Shadow) */}
            <div 
              className={`report-document relative mb-6 bg-white rounded-2xl p-5 sm:p-8 md:p-10 transition-all border border-black/[0.06] ${
                isLiveEditMode ? 'ring-1 ring-[#1D1D1F]/20' : ''
              }`}
              id="pdf-report-content" 
              style={{ 
                color: '#000',
                fontFamily: "'Play', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                fontSize: `${reportFontSize}px`
              }}
            >
              {/* Floating On-Report Table Action Bar (Apple Frosted Dark Pill, No Drop Shadow) */}
              {activeTableBanner && (
                <div
                  style={{ top: `${activeTableBanner.top}px` }}
                  className="absolute right-4 sm:right-8 z-20 flex flex-wrap items-center gap-1.5 bg-[#1D1D1F]/95 backdrop-blur-xl text-white px-3 py-1.5 rounded-full text-xs print:hidden animate-in fade-in duration-150"
                >
                  <span className="text-[11px] text-white/70 font-medium mr-1 max-w-[160px] truncate">
                    {activeTableBanner.sectionTitle}
                  </span>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleAddTableRowInReport()}
                    className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-white rounded-full font-medium transition active:scale-95"
                  >
                    + Row
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleAddTableColInReport()}
                    className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-white rounded-full font-medium transition active:scale-95"
                  >
                    + Column
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleRemoveTableRowInReport()}
                    className="px-2 py-1 hover:bg-[#FF3B30]/80 text-white/80 hover:text-white rounded-full font-medium transition active:scale-95"
                    title="Remove last row"
                  >
                    - Row
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleRemoveTableColInReport()}
                    className="px-2 py-1 hover:bg-[#FF3B30]/80 text-white/80 hover:text-white rounded-full font-medium transition active:scale-95"
                    title="Remove last column"
                  >
                    - Col
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleDeleteTableInReport()}
                    className="px-2.5 py-1 bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white rounded-full font-medium transition active:scale-95 flex items-center gap-1"
                    title="Delete this entire table box"
                  >
                    <Trash2 size={12} />
                    Delete Box
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setActiveTableBanner(null)}
                    className="ml-1 text-white/60 hover:text-white p-0.5"
                    title="Close toolbar"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Top Logo Area - Always rendered at the top of the report */}
              {reportLogo && (
                <div className="report-top-logo mb-4 flex items-center justify-start">
                  <img 
                    src={reportLogo} 
                    alt="Company Logo" 
                    style={{ height: `${reportLogoSize}px`, maxWidth: '220px', objectFit: 'contain' }}
                    className="block rounded"
                  />
                </div>
              )}

              {/* Header (Always fixed, pristine & non-editable header so cursor never jumps into it) */}
              <div 
                className="report-header flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-gray-900 pb-4 mb-6 gap-3 select-none"
                contentEditable={false}
              >
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'Play', sans-serif" }}>Daily Operations Report</h2>
                  <p className="text-sm text-gray-900" style={{ fontFamily: "'Play', sans-serif" }}>Date: {todayStr} &nbsp;|&nbsp; Prepared by: Automated System</p>
                </div>
                <div className="text-right text-xs text-gray-900 shrink-0 font-medium" style={{ fontFamily: "'Play', sans-serif" }}>Zum Operations</div>
              </div>

              {/* Editable Report Body */}
              <div
                id="report-editable-body"
                className="outline-none"
                contentEditable={isLiveEditMode}
                suppressContentEditableWarning={true}
                onClick={handleReportBodyClick}
                onPaste={(e) => {
                  if (isLiveEditMode) {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                    saveCurrentReportHtml(true);
                  }
                }}
                onInput={handleReportInput}
                onBlur={handleReportBlur}
              >
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

              {/* Section 2: Routine Checkup — Summary + Issues Table */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">2. Routine Cycle Checkups</h3>
                {overrides.routine.trim() ? (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4 whitespace-pre-wrap">{overrides.routine}</p>
                ) : (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4">
                    {routineStaff.length === 0
                      ? 'No routine checkups were submitted for this shift.'
                      : `Routine condition checks were completed by ${routineStaff.join(', ')}. Together, they submitted ${recordLabel(routineTotal, 'cycle checkup record')}. The tables below show staff distribution and any recorded routine checkup issues.`}
                  </p>
                )}

                {routineStaff.length > 0 && (
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
                )}

                <table className="w-full text-sm text-left border-collapse border border-gray-400">
                  <thead>
                    <tr>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-20">Cycle ID</th>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-24">Staff</th>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Issue / Condition Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routineIssueRows.length === 0 ? (
                      <tr data-placeholder-row="true"><td colSpan="3" className="border border-gray-400 py-4 px-3 text-gray-900 italic">No routine checkup issues recorded for this shift.</td></tr>
                    ) : (
                      routineIssueRows.map((row, idx) => (
                        <tr key={`routine-issue-${idx}`}>
                          <td className="border border-gray-400 py-2 px-3 font-bold text-gray-900">{row.cycle_id}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.staff_name || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.issue || row.parts_checked || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Section 3: Pre-Task Check (Cross Check) */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">3. Pre-Task Cross Check</h3>
                {overrides.pretask.trim() ? (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4 whitespace-pre-wrap">{overrides.pretask}</p>
                ) : (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4">
                    {pretaskStaff.length === 0
                      ? 'No pre-task cross checks were submitted for this shift.'
                      : `The team submitted ${recordLabel(pretaskTotal, 'pre-task cross check')} before cycles entered operation. These records document the submitted cycle condition and any parts or issues noted during the check.`}
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
                      {rows.filter(r => r.condition !== 'issue').length > 0 && (
                        <p className="text-sm text-gray-900 mt-1 mb-2">
                          <span className="font-bold">Good Condition:</span> {rows.filter(r => r.condition !== 'issue').map(r => r.cycle_id).join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}

                <table className="w-full text-sm text-left border-collapse border border-gray-400">
                  <thead>
                    <tr>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-20">Cycle ID</th>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-24">Staff</th>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Parts Checked / Issue Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pretaskIssueRows.length === 0 ? (
                      <tr data-placeholder-row="true"><td colSpan="3" className="border border-gray-400 py-4 px-3 text-gray-900 italic">No pre-task issues recorded for this shift.</td></tr>
                    ) : (
                      pretaskIssueRows.map((row, i) => (
                        <tr key={`pretask-issue-${i}`}>
                          <td className="border border-gray-400 py-2 px-3 font-bold text-gray-900">{row.cycle_id}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.staff_name || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.issue || row.parts_checked || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Section 4: Overall Checkup */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">4. Overall Cycle Checkup</h3>
                {overrides.overall.trim() ? (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4 whitespace-pre-wrap">{overrides.overall}</p>
                ) : (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4">
                    {overallRows.length === 0
                      ? 'No overall cycle checkup was submitted for this shift.'
                      : `${data?.overall?.staff || 'Staff'} completed ${recordLabel(overallRows.length, 'overall cycle inspection')} covering cycle IDs ${cycleIds(overallRows)}. ${overallIssueCount === 0 ? 'All submitted records were marked in good condition.' : `${recordLabel(overallIssueCount, 'record')} ${overallIssueCount === 1 ? 'was' : 'were'} marked with an issue requiring follow-up.`}`}
                  </p>
                )}

                {overallRows.length > 0 && (
                  <>
                    <p className="text-sm mb-2"><span className="font-medium text-gray-900">Staff:</span> {data?.overall?.staff || 'Staff'} &nbsp;|&nbsp; <span className="font-medium text-gray-900">Total Cycles:</span> {overallRows.length}</p>
                    {overallRows.filter(r => r.condition !== 'issue').length > 0 && (
                      <p className="text-sm text-gray-900 mt-2 mb-3">
                        <span className="font-bold">Good Condition:</span> {overallRows.filter(r => r.condition !== 'issue').map(r => r.cycle_id).join(', ')}
                      </p>
                    )}
                  </>
                )}

                <table className="w-full text-sm text-left border-collapse border border-gray-400">
                  <thead>
                    <tr>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-20">Cycle ID</th>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-24">Staff</th>
                      <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Issue / Condition Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overallIssueRows.length === 0 ? (
                      <tr data-placeholder-row="true"><td colSpan="3" className="border border-gray-400 py-4 px-3 text-gray-900 italic">No overall checkup issues recorded for this shift.</td></tr>
                    ) : (
                      overallIssueRows.map((row, i) => (
                        <tr key={`overall-issue-${i}`}>
                          <td className="border border-gray-400 py-2 px-3 font-bold text-gray-900">{row.cycle_id}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.staff_name || data?.overall?.staff || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.issue || row.parts_checked || 'Unknown'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Section 5: Station Visit */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">5. Station Visit</h3>
                {stationRows.length === 0 ? (
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{overrides.station || 'No station visit was submitted for this shift.'}</p>
                ) : (
                  <>
                    {overrides.station.trim() ? (
                      <p className="text-sm leading-relaxed text-gray-900 mb-3 whitespace-pre-wrap">{overrides.station}</p>
                    ) : (
                      <p className="text-sm leading-relaxed text-gray-900 mb-3">
                        {data?.station?.staff || 'Staff'} submitted {recordLabel(stationRows.length, 'station inspection record')} for cycle IDs {cycleIds(stationRows)}. {stationIssueCount === 0 ? 'No issue was recorded in the submitted station entries.' : `${recordLabel(stationIssueCount, 'station record')} ${stationIssueCount === 1 ? 'was' : 'were'} marked with an issue.`}
                      </p>
                    )}
                    <p className="text-sm mb-2"><span className="font-medium text-gray-900">Staff:</span> {data?.station?.staff || 'Staff'} &nbsp;|&nbsp; <span className="font-medium text-gray-900">Total Cycles:</span> {stationRows.length}</p>
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

              {/* Section 9: Battery Swaps */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">9. Battery Swaps</h3>
                {!data?.battery_swaps || data.battery_swaps.length === 0 ? (
                  <p className="text-sm text-gray-900">No battery swaps were submitted for this shift.</p>
                ) : (
                  <table className="w-full text-sm text-left border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Staff</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Cycle / Category</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">In Battery</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Out Battery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.battery_swaps.map((row, i) => (
                        <tr key={`swap-${i}`}>
                          <td className="border border-gray-400 py-2 px-3 font-medium text-gray-900">{row.staff_name}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.cycle_id || 'N/A'} {row.category ? `(${row.category})` : ''}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.in_battery_id || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.out_battery_id || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Section 10: Home Cycles */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">10. Home Cycles</h3>
                {!data?.home_cycles || data.home_cycles.length === 0 ? (
                  <p className="text-sm text-gray-900">No home cycles were submitted for this shift.</p>
                ) : (
                  <table className="w-full text-sm text-left border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Name</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Cycle</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Old Battery</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">New Battery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.home_cycles.map((row, i) => (
                        <tr key={`home-${i}`}>
                          <td className="border border-gray-400 py-2 px-3 font-medium text-gray-900">{row.manual_name}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.home_cycle_id || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.old_battery_id || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.new_battery_id || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Section 11: Battery Tests */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">11. Battery Tests</h3>
                {!data?.battery_tests || data.battery_tests.length === 0 ? (
                  <p className="text-sm text-gray-900">No battery tests were submitted for this shift.</p>
                ) : (
                  <table className="w-full text-sm text-left border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Staff</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Battery</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Condition</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Fix/Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.battery_tests.map((row, i) => (
                        <tr key={`test-${i}`}>
                          <td className="border border-gray-400 py-2 px-3 font-medium text-gray-900">{row.staff_name}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.battery_id || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.condition}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.fix_description || row.issue || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Section 12: Extra Remarks */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">12. Extra Work &amp; Remarks</h3>
                {overrides.extra.trim() ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-900 p-4 ">{overrides.extra}</p>
                ) : (
                  <p className="text-sm text-gray-900">No additional work or remarks were recorded for this shift.</p>
                )}
              </div>

              {/* Section 13: Closing Summary */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">13. Operational Closing Summary</h3>
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
            </div>
              </>
            )}



          </div>
        </div>
      </div>

      {/* Add New Title & Multi-Row/Column Table Builder Popup Modal Window */}
      {showAddTitleModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-[28px] w-full max-w-2xl p-5 sm:p-7 border border-black/[0.06] relative animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-5 pb-3.5 border-b border-black/[0.06]">
              <div>
                <h3 className="text-lg sm:text-[19px] font-semibold tracking-tight text-[#1D1D1F]">
                  {includeTableInNewSection && !newSectionTitle ? 'Insert Table & Section in Report' : 'Add New Title & Table to Report'}
                </h3>
                <p className="text-xs text-[#86868B] mt-0.5">
                  Add a new title, write content, build a multi-row/column table, and choose where it appears.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTitleModal(false)}
                className="p-2 rounded-full text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmAddSectionOrTable} className="flex flex-col gap-4">
              {/* 1. Title Name */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">
                  Title / Section Heading (Number is managed automatically)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Special Fleet Inspection (number is managed automatically)"
                  value={newSectionTitle}
                  onChange={e => setNewSectionTitle(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent focus:bg-white focus:border-black/15 outline-none focus:ring-2 focus:ring-black/5 text-sm text-[#1D1D1F] font-semibold transition"
                />
              </div>

              {/* 2. Where to Place This Title */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">
                  Where to Place in Report (Default: Above Extra Work &amp; Closing Summary)
                </label>
                <select
                  value={newSectionPlacement}
                  onChange={e => setNewSectionPlacement(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent focus:bg-white focus:border-black/15 outline-none focus:ring-2 focus:ring-black/5 text-sm text-[#1D1D1F] font-medium cursor-pointer transition"
                >
                  <option value="above_extra">Above Extra Work &amp; Remarks and Closing Summary (Recommended)</option>
                  <option value="above_closing">Above Operational Closing Summary</option>
                  {reportSectionsSnapshot.map((sec) => (
                    <option key={sec.index} value={`before_${sec.index}`}>
                      Before: {sec.title}
                    </option>
                  ))}
                  <option value="end">At the Very End (Before Footer)</option>
                </select>
              </div>

              {/* 3. Paragraph / Description Text with Gemini AI Refine */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">
                    Description / Paragraph Text (Optional)
                  </label>
                  <button
                    type="button"
                    disabled={isRefiningNewSectionText || !newSectionContent.trim()}
                    onClick={handleRefineNewSectionContentWithAI}
                    className="px-3 py-1 rounded-full bg-[#F5F5F7] hover:bg-[#1D1D1F] text-[#1D1D1F] hover:text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
                  >
                    {isRefiningNewSectionText ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    {isRefiningNewSectionText ? 'Refining...' : 'Refine with AI'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  placeholder="Write any text or summary for this section (click 'Refine with AI' to polish grammar & tone)..."
                  value={newSectionContent}
                  onChange={e => setNewSectionContent(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent focus:bg-white focus:border-black/15 outline-none focus:ring-2 focus:ring-black/5 text-sm text-[#1D1D1F] transition"
                />
              </div>

              {/* 4. Multi-Row & Multi-Column Table Builder */}
              <div className="rounded-2xl border border-black/[0.06] bg-[#F5F5F7]/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeTableInNewSection}
                      onChange={e => setIncludeTableInNewSection(e.target.checked)}
                      className="w-4 h-4 rounded text-[#1D1D1F] focus:ring-black"
                    />
                    <span className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-1.5">
                      <TableIcon size={15} className="text-[#1D1D1F]" /> Include Table (Multiple Rows &amp; Columns)
                    </span>
                  </label>

                  {includeTableInNewSection && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTableBuilderRows([...tableBuilderRows, Array(tableBuilderHeaders.length).fill('')]);
                        }}
                        className="px-2.5 py-1 bg-white border border-black/[0.08] hover:bg-[#F5F5F7] rounded-lg text-xs font-semibold text-[#1D1D1F] transition"
                      >
                        + Add Row ({tableBuilderRows.length})
                      </button>
                      {tableBuilderRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setTableBuilderRows(tableBuilderRows.slice(0, -1))}
                          className="px-2 py-1 bg-white border border-black/[0.08] hover:bg-red-50 rounded-lg text-xs font-medium text-red-600 transition"
                        >
                          - Row
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTableBuilderHeaders([...tableBuilderHeaders, `Column ${tableBuilderHeaders.length + 1}`]);
                          setTableBuilderRows(tableBuilderRows.map(r => [...r, '']));
                        }}
                        className="px-2.5 py-1 bg-white border border-black/[0.08] hover:bg-[#F5F5F7] rounded-lg text-xs font-semibold text-[#1D1D1F] transition"
                      >
                        + Add Column ({tableBuilderHeaders.length})
                      </button>
                      {tableBuilderHeaders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTableBuilderHeaders(tableBuilderHeaders.slice(0, -1));
                            setTableBuilderRows(tableBuilderRows.map(r => r.slice(0, -1)));
                          }}
                          className="px-2 py-1 bg-white border border-black/[0.08] hover:bg-red-50 rounded-lg text-xs font-medium text-red-600 transition"
                        >
                          - Col
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {includeTableInNewSection && (
                  <div className="overflow-x-auto bg-white rounded-xl border border-black/[0.06] p-2.5">
                    <p className="text-[11px] text-[#86868B] mb-2">
                      Write inside the headers and cells below (you can also edit them directly inside the report after inserting):
                    </p>
                    <table className="w-full border-collapse min-w-[420px]">
                      <thead>
                        <tr>
                          {tableBuilderHeaders.map((header, colIdx) => (
                            <th key={colIdx} className="border border-black/[0.08] bg-[#F5F5F7] p-1.5">
                              <input
                                type="text"
                                value={header}
                                onChange={e => {
                                  const next = [...tableBuilderHeaders];
                                  next[colIdx] = e.target.value;
                                  setTableBuilderHeaders(next);
                                }}
                                placeholder={`Header ${colIdx + 1}`}
                                className="w-full bg-white px-2 py-1.5 rounded-lg border border-black/[0.06] text-xs font-semibold text-[#1D1D1F] outline-none focus:ring-2 focus:ring-black/10"
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableBuilderRows.map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {row.map((cell, colIdx) => (
                              <td key={colIdx} className="border border-black/[0.08] p-1.5">
                                <input
                                  type="text"
                                  value={cell}
                                  onChange={e => {
                                    const next = tableBuilderRows.map((r, rI) =>
                                      rI === rowIdx ? r.map((c, cI) => (cI === colIdx ? e.target.value : c)) : r
                                    );
                                    setTableBuilderRows(next);
                                  }}
                                  placeholder={`Row ${rowIdx + 1}, Col ${colIdx + 1}`}
                                  className="w-full bg-[#F5F5F7]/70 focus:bg-white px-2 py-1.5 rounded-lg border border-transparent focus:border-black/15 text-xs text-[#1D1D1F] outline-none transition"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2.5 mt-2 pt-3.5 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowAddTitleModal(false)}
                  className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold bg-[#1D1D1F] text-white hover:bg-black transition"
                >
                  Insert into Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit & Reorder Report Titles ("Edit Which Title in Where") Popup Modal Window */}
      {showReorderTitlesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-[28px] w-full max-w-xl p-5 sm:p-7 border border-black/[0.06] relative animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3.5 border-b border-black/[0.06]">
              <div>
                <h3 className="text-lg sm:text-[19px] font-semibold tracking-tight text-[#1D1D1F]">Edit &amp; Move Report Titles</h3>
                <p className="text-xs text-[#86868B] mt-0.5">
                  Rename any title or move sections up and down to choose which title goes where.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReorderTitlesModal(false)}
                className="p-2 rounded-full text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">
                {reportSectionsSnapshot.length} Sections in Report
              </span>
              <div className="flex items-center gap-1.5">
                {!reportSectionsSnapshot.some(s => /home\s*cycles/i.test(s.title)) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleRestoreHomeCyclesSection();
                      setShowReorderTitlesModal(false);
                    }}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/60 rounded-full text-xs font-semibold transition active:scale-95 flex items-center gap-1"
                  >
                    <RotateCcw size={12} /> + Restore "Home Cycles"
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAutoNumberReportSections}
                  className="px-3.5 py-1.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] rounded-full text-xs font-semibold transition active:scale-95"
                >
                  Auto-Number Titles (1, 2, 3...)
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 max-h-[58vh] overflow-y-auto pr-1">
              {reportSectionsSnapshot.map((sec, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2.5 rounded-2xl bg-[#F5F5F7]/70 border border-black/[0.05]"
                >
                  <span className="w-6 h-6 rounded-full bg-white border border-black/[0.06] text-[#1D1D1F] text-xs font-semibold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={sec.title.replace(/^\d+[\.\)]\s*/, '')}
                    onChange={e => handleRenameReportSection(idx, e.target.value)}
                    className="flex-1 min-w-0 bg-white px-3 py-2 rounded-xl border border-black/[0.06] text-xs sm:text-sm font-medium text-[#1D1D1F] outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveReportSection(idx, idx - 1)}
                      className="p-1.5 rounded-lg bg-white border border-black/[0.06] text-[#1D1D1F] hover:bg-[#F5F5F7] disabled:opacity-30 transition"
                      title="Move Up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === reportSectionsSnapshot.length - 1}
                      onClick={() => handleMoveReportSection(idx, idx + 1)}
                      className="p-1.5 rounded-lg bg-white border border-black/[0.06] text-[#1D1D1F] hover:bg-[#F5F5F7] disabled:opacity-30 transition"
                      title="Move Down"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove section "${sec.title}"? All remaining titles will be automatically renumbered.`)) {
                          handleDeleteReportSection(idx);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-white border border-black/[0.06] text-[#86868B] hover:text-red-600 hover:bg-red-50 transition"
                      title="Delete Section (Auto-renumbers remaining)"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-3.5 border-t border-black/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setShowReorderTitlesModal(false);
                  handleOpenAddTitleModal({ tableOnly: false });
                }}
                className="px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] transition"
              >
                + Add Another Title
              </button>
              <button
                type="button"
                onClick={() => setShowReorderTitlesModal(false)}
                className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold bg-[#1D1D1F] text-white hover:bg-black transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Gemini AI Language Refiner & Auto-Analyzer Popup Modal Window */}
      {showGeminiModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-[28px] w-full max-w-xl p-5 sm:p-7 border border-black/[0.06] relative animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3.5 border-b border-black/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#1D1D1F] text-white flex items-center justify-center shrink-0">
                  <Wand2 size={18} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-[19px] font-semibold tracking-tight text-[#1D1D1F]">AI Intelligence — Refine &amp; Summarize</h3>
                  <p className="text-xs text-[#86868B]">
                    Refine individual section bodies or auto-summarize Opening, Staff Work &amp; Closing.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGeminiModal(false)}
                className="p-2 rounded-full text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {geminiStatusMsg && (
                <div className="p-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.06] text-[#1D1D1F] text-xs font-semibold text-center">
                  {geminiStatusMsg}
                </div>
              )}

              {/* 1. Auto-Analyze Report: Opening, Individual Staff Work & Closing Summary */}
              <div className="p-4 rounded-2xl bg-[#F5F5F7]/80 border border-black/[0.06] flex flex-col gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-1.5">
                    <Sparkles size={15} className="text-[#1D1D1F]" /> Auto-Analyze Report (Opening, Staff Work &amp; Closing)
                  </h4>
                  <p className="text-xs text-[#6E6E73] mt-0.5">
                    Reads all sections and tables in your report and automatically writes the Opening Summary, Individual Staff Work Summary, and Closing Summary.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isAnalyzingSummaries}
                  onClick={() => handleAnalyzeReportAndGenerateSummaries('all')}
                  className="w-full py-2.5 px-4 rounded-full bg-[#1D1D1F] hover:bg-black text-white text-xs sm:text-[13px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 active:scale-[0.99]"
                >
                  {isAnalyzingSummaries ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Analyzing Entire Report...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Auto-Write All 3 (Opening + Staff Work + Closing)
                    </>
                  )}
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isAnalyzingSummaries}
                    onClick={() => handleAnalyzeReportAndGenerateSummaries('opening')}
                    className="py-2 px-3 rounded-xl bg-white hover:bg-black/[0.03] border border-black/[0.07] text-[#1D1D1F] text-xs font-semibold transition"
                  >
                    Opening Summary
                  </button>
                  <button
                    type="button"
                    disabled={isAnalyzingSummaries}
                    onClick={() => handleAnalyzeReportAndGenerateSummaries('individual')}
                    className="py-2 px-3 rounded-xl bg-white hover:bg-black/[0.03] border border-black/[0.07] text-[#1D1D1F] text-xs font-semibold transition"
                  >
                    Individual Staff Work
                  </button>
                  <button
                    type="button"
                    disabled={isAnalyzingSummaries}
                    onClick={() => handleAnalyzeReportAndGenerateSummaries('closing')}
                    className="py-2 px-3 rounded-xl bg-white hover:bg-black/[0.03] border border-black/[0.07] text-[#1D1D1F] text-xs font-semibold transition"
                  >
                    Closing Summary
                  </button>
                </div>
              </div>

              {/* 2. Choose Which Specific Title Body to Refine from the Report */}
              <div className="p-4 rounded-2xl bg-[#F5F5F7]/80 border border-black/[0.06] flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1D1D1F]">Choose Which Title Body to Refine</h4>
                    <p className="text-xs text-[#6E6E73]">
                      Click <strong>Refine Body</strong> next to any title below to polish that section's language.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isRefiningEntireReport}
                    onClick={() => handleRefineEntireReportLanguage()}
                    className="px-3.5 py-1.5 rounded-full bg-[#1D1D1F] hover:bg-black text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {isRefiningEntireReport ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    Refine All Titles
                  </button>
                </div>

                {/* Refinement Tone Selector */}
                <div className="grid grid-cols-3 gap-1.5 bg-black/[0.05] p-1 rounded-xl">
                  {[
                    { id: 'professional', label: 'Executive & Formal' },
                    { id: 'grammar', label: 'Fix Grammar Only' },
                    { id: 'concise', label: 'Short & Concise' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setGeminiRefineStyle(opt.id)}
                      className={`py-1.5 px-2.5 rounded-lg text-[11px] font-semibold transition ${
                        geminiRefineStyle === opt.id
                          ? 'bg-white text-[#1D1D1F]'
                          : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Per-Title List with One-Tap "Refine Body" button */}
                <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                  {reportSectionsSnapshot.map((sec, idx) => {
                    const isRefiningThis = refiningSectionIdx === idx;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-black/[0.06] hover:border-black/15 transition"
                      >
                        <span className="text-xs sm:text-[13px] font-medium text-[#1D1D1F] truncate">
                          {sec.title}
                        </span>
                        <button
                          type="button"
                          disabled={isRefiningThis}
                          onClick={() => handleRefineSpecificTitleBody(idx)}
                          className="shrink-0 px-3 py-1.5 rounded-full bg-[#F5F5F7] hover:bg-[#1D1D1F] text-[#1D1D1F] hover:text-white text-xs font-semibold flex items-center gap-1 transition active:scale-95 disabled:opacity-50"
                        >
                          {isRefiningThis ? (
                            <>
                              <Loader2 size={12} className="animate-spin" /> Refining...
                            </>
                          ) : (
                            <>
                              <Wand2 size={12} /> Refine Body
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Google Gemini API Key Input (Pre-configured with your key) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">
                    Google Gemini AI API Key
                  </label>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#F5F5F7] text-[#1D1D1F]">
                    Active
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Paste your Google Gemini API key..."
                  value={geminiApiKey}
                  onChange={e => handleSaveGeminiKey(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#F5F5F7] border border-black/[0.06] outline-none focus:bg-white focus:ring-2 focus:ring-black/10 text-xs text-[#1D1D1F] font-mono transition"
                />
              </div>

              <div className="flex justify-end pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowGeminiModal(false)}
                  className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold bg-[#1D1D1F] text-white hover:bg-black transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-[28px] w-full max-w-lg p-5 sm:p-7 border border-black/[0.06] relative animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold tracking-tight text-[#1D1D1F] mb-5">Edit Record</h3>
            
            {editingRecord.source === 'tasks' && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">Task Type</label>
                  <input 
                    type="text"
                    list="task-types-list"
                    value={editingRecord.task_type || ''}
                    onChange={e => setEditingRecord({...editingRecord, task_type: e.target.value})}
                    className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent focus:bg-white focus:border-black/15 outline-none text-sm text-[#1D1D1F]"
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">Condition</label>
                  <select 
                    value={editingRecord.condition}
                    onChange={e => setEditingRecord({...editingRecord, condition: e.target.value})}
                    className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent focus:bg-white focus:border-black/15 outline-none text-sm text-[#1D1D1F]"
                  >
                    <option value="good">Good</option>
                    <option value="issue">Issue</option>
                  </select>
                </div>
                {editingRecord.condition === 'issue' && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">Issue Description (Added to Active Issues)</label>
                    <textarea 
                      value={editingRecord.issue}
                      onChange={e => setEditingRecord({...editingRecord, issue: e.target.value})}
                      className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent focus:bg-white focus:border-black/15 outline-none text-sm text-[#1D1D1F]"
                      rows="3"
                    />
                  </div>
                )}
              </div>
            )}
            
            {editingRecord.source === 'maintenance' && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">Repair Description</label>
                  <textarea 
                    value={editingRecord.fix_description}
                    onChange={e => setEditingRecord({...editingRecord, fix_description: e.target.value})}
                    className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent focus:bg-white focus:border-black/15 outline-none text-sm text-[#1D1D1F]"
                    rows="3"
                  />
                </div>
              </div>
            )}
            
            {(editingRecord.source === 'battery_swaps' || editingRecord.source === 'home_cycles') && (
              <div className="flex flex-col gap-4">
                <div className="text-sm text-[#86868B] mb-2">
                  Editing for this record type is not supported in this modal yet.
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2.5 mt-7 pt-3.5 border-t border-black/[0.06]">
              <button onClick={() => setEditingRecord(null)} className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] transition">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={isSavingEdit} className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold bg-[#1D1D1F] text-white hover:bg-black transition disabled:opacity-50 flex items-center gap-2">
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Record Modal */}
      {viewingRecord && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-[28px] w-full max-w-lg p-5 sm:p-7 border border-black/[0.06] relative animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5 pb-3.5 border-b border-black/[0.06]">
              <h3 className="text-lg font-semibold tracking-tight text-[#1D1D1F]">Record Details</h3>
              <button onClick={() => setViewingRecord(null)} className="p-1.5 rounded-full text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition">
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04]">
                  <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">Cycle ID</span>
                  <span className="font-semibold text-[#1D1D1F]">#{viewingRecord.cycle_id}</span>
                </div>
                <div className="bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04]">
                  <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">Task Type</span>
                  <span className="font-semibold text-[#1D1D1F]">{viewingRecord.task_type}</span>
                </div>
              </div>

              <div className="bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04]">
                <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1.5">Staff Member</span>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#1D1D1F] flex items-center justify-center text-xs font-semibold text-white">
                    {viewingRecord.staff_name.charAt(0)}
                  </div>
                  <span className="font-semibold text-[#1D1D1F]">{viewingRecord.staff_name}</span>
                </div>
              </div>

              <div className="bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04]">
                <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">Date &amp; Time</span>
                <span className="font-semibold text-[#1D1D1F] block text-sm">{new Date(viewingRecord.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                <span className="text-xs text-[#86868B]">{new Date(viewingRecord.created_at).toLocaleTimeString('en-US')}</span>
              </div>

              {viewingRecord.source === 'tasks' && (
                <>
                  <div className="bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04]">
                    <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">Condition</span>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${viewingRecord.condition === 'issue' ? 'bg-red-50 text-red-600' : 'bg-white text-[#1D1D1F]'}`}>
                      {viewingRecord.condition || 'good'}
                    </span>
                  </div>

                  {viewingRecord.condition === 'issue' && (
                    <div className="bg-red-50/70 p-4 rounded-2xl border border-red-200/60 text-red-950">
                      <span className="block text-[11px] font-semibold text-red-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <AlertTriangle size={12} /> Reported Issue
                      </span>
                      <p className="text-sm font-medium whitespace-pre-wrap">{viewingRecord.issue || 'No details provided.'}</p>
                    </div>
                  )}
                  
                  {viewingRecord.parts_checked && (
                    <div className="bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04]">
                      <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">Parts Checked</span>
                      <p className="text-sm text-[#1D1D1F] font-medium">{viewingRecord.parts_checked}</p>
                    </div>
                  )}
                </>
              )}

              {viewingRecord.source === 'maintenance' && (
                <div className="bg-[#F5F5F7] p-4 rounded-2xl border border-black/[0.04]">
                  <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1.5">Repair Description</span>
                  <p className="text-sm text-[#1D1D1F] font-medium whitespace-pre-wrap">{viewingRecord.fix_description}</p>
                </div>
              )}

              {viewingRecord.source === 'battery_swaps' && (
                <div className="flex gap-3.5">
                  <div className="bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04] flex-1">
                    <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">IN Battery</span>
                    <p className="text-sm text-[#1D1D1F] font-semibold">{viewingRecord.in_battery_id || 'N/A'}</p>
                  </div>
                  <div className="bg-[#F5F5F7] p-3.5 rounded-2xl border border-black/[0.04] flex-1">
                    <span className="block text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-1">OUT Battery</span>
                    <p className="text-sm text-[#1D1D1F] font-semibold">{viewingRecord.out_battery_id || 'N/A'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6 pt-3.5 border-t border-black/[0.06]">
              <button onClick={() => setViewingRecord(null)} className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold bg-[#1D1D1F] text-white hover:bg-black transition w-full">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
