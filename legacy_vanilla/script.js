document.addEventListener('DOMContentLoaded', () => {
    // --- URLs ---
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';
    
    // IMPORTANT: You need to replace this with the new Apps Script URL for the Maintenance Sheet!
    const MAINTENANCE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwdjdLFGkiE683shjT3auwewzvEvmLBUmhp6VRydHQj_6oRF6bsocTG_UDT_fLALR7rDw/exec'; 
    
    // --- DOM Elements ---
    const homeScreen = document.getElementById('home-screen');
    const formScreen = document.getElementById('workForm');
    const backBtn = document.getElementById('backBtn');
    const taskBtns = document.querySelectorAll('.task-btn');
    const hiddenTaskType = document.getElementById('hiddenTaskType');
    const staffSelect = document.getElementById('staffName');
    const assignmentNote = document.getElementById('assignmentNote');

    const sections = {
        pretask: document.getElementById('section-pretask'),
        routine: document.getElementById('section-routine'),
        station: document.getElementById('section-station'),
        overall: document.getElementById('section-overall'),
        maintenance: document.getElementById('section-maintenance')
    };

    const pretaskContainer = document.getElementById('pretask-cycles-container');
    const routineContainer = document.getElementById('routine-cycles-container');
    const stationContainer = document.getElementById('station-cycles-container');
    const overallContainer = document.getElementById('overall-cycles-container');
    const maintenanceContainer = document.getElementById('maintenance-cycles-container');
    
    const addPretaskCycleBtn = document.getElementById('addPretaskCycleBtn');
    const addRoutineCycleBtn = document.getElementById('addRoutineCycleBtn');
    const addStationCycleBtn = document.getElementById('addStationCycleBtn');
    const addCycleBtn = document.getElementById('addCycleBtn');
    const clearBtn = document.getElementById('clearBtn');

    // --- NAVIGATION LOGIC ---
    taskBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selectedTask = e.currentTarget.getAttribute('data-task');
            hiddenTaskType.value = selectedTask;
            
            // Toggle screens
            homeScreen.classList.add('hidden');
            formScreen.classList.remove('hidden');

            // Show correct section
            Object.values(sections).forEach(section => section.classList.add('hidden'));
            if (sections[selectedTask]) {
                sections[selectedTask].classList.remove('hidden');
                updateAssignedStaff(selectedTask);

                if (selectedTask === 'pretask') {
                    fetchYesterdayData();
                }
            }
        });
    });

    backBtn.addEventListener('click', () => {
        formScreen.classList.add('hidden');
        homeScreen.classList.remove('hidden');
        formScreen.reset();
        staffSelect.value = ''; // Optional: clear staff on back, or keep it. Let's keep it but clear the hidden task.
        hiddenTaskType.value = '';
        assignmentNote.style.display = 'none';
    });

    // --- DATA SYNCING LOGIC ---
    let fetchedCycles = [];
    let isSyncing = false;
    
    // 1. Pre-Task Sync
    window.handleSyncData = function(response) {
        isSyncing = false;
        const uniqueCycles = {};
        if (response && response.data) {
            response.data.forEach(c => {
                uniqueCycles[c.cycleId] = c;
            });
        }
        fetchedCycles = Object.values(uniqueCycles);
        updatePretaskDropdowns();
    };

    function fetchYesterdayData() {
        isSyncing = true;
        updatePretaskDropdowns();
        const script = document.createElement('script');
        script.src = SCRIPT_URL + '?callback=handleSyncData&t=' + new Date().getTime();
        script.onload = () => script.remove();
        script.onerror = () => { isSyncing = false; updatePretaskDropdowns(); };
        document.body.appendChild(script);
    }

    function updatePretaskDropdowns() {
        const selects = document.querySelectorAll('.pretask-cycle-select');
        
        selects.forEach(select => {
            const currentVal = select.value;
            select.innerHTML = '<option value="" disabled selected>Select an eligible cycle...</option>';
            
            if (isSyncing) {
                select.innerHTML = '<option value="" disabled selected>Syncing data... Please wait.</option>';
                return;
            }

            if (fetchedCycles.length === 0) {
                select.innerHTML = '<option value="" disabled selected>No eligible cycles found</option>';
                return;
            }

            fetchedCycles.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.cycleId;
                opt.textContent = `${c.cycleId} (Checked by ${c.staffName || 'Unknown'})`;
                select.appendChild(opt);
            });
            
            if (currentVal && fetchedCycles.find(c => c.cycleId === currentVal)) {
                select.value = currentVal;
            }
        });
    }

    // --- AUTO ASSIGNMENT LOGIC ---
    const stationRotation = ['Kabir', 'Laxman Ram', 'Anish', 'Surya'];
    const overallRotation = ['Laxman Ram', 'Anish', 'Surya', 'Kabir'];

    function getTodayAssignments() {
        const today = new Date();
        const epoch = new Date(2026, 8, 21);
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysDiff = Math.floor((todayMidnight - epoch) / (1000 * 60 * 60 * 24));
        const index = ((daysDiff % 4) + 4) % 4;
        
        return {
            station: stationRotation[index],
            overall: overallRotation[index]
        };
    }

    const todayAssigned = getTodayAssignments();

    function updateAssignedStaff(task) {
        if (task === 'station') {
            staffSelect.value = todayAssigned.station;
            assignmentNote.style.display = 'block';
            assignmentNote.textContent = `★ ${todayAssigned.station} is assigned to Station Visit today`;
        } else if (task === 'overall') {
            staffSelect.value = todayAssigned.overall;
            assignmentNote.style.display = 'block';
            assignmentNote.textContent = `★ ${todayAssigned.overall} is assigned to Overall Checkup today`;
        } else {
            assignmentNote.style.display = 'none';
        }
    }

    // --- UI TOGGLES ---
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('condition-select')) {
            const parentSection = e.target.closest('.cycle-card') || e.target.closest('.task-section');
            if (parentSection) {
                const issueDescGroup = parentSection.querySelector('.issue-desc');
                if (issueDescGroup) {
                    if (e.target.value === 'issue') {
                        issueDescGroup.classList.remove('hidden');
                    } else {
                        issueDescGroup.classList.add('hidden');
                    }
                }
            }
        }
    });

    // --- TEMPLATES ---
    const getBasicCycleTemplate = (type, index, isFirst) => `
        <div class="cycle-card" data-id="${index}">
            ${!isFirst ? `
            <div class="cycle-header" style="justify-content: flex-end;">
                <button type="button" class="btn-remove">Remove</button>
            </div>` : ''}
            <div class="form-group">
                <label class="field-label">Cycle ID</label>
                <input type="text" class="input-field" name="${type}_cycleId_${index}" placeholder="e.g. CYC-100">
            </div>
            <div class="form-group">
                <label class="field-label">Battery ID (Optional)</label>
                <input type="text" class="input-field" name="${type}_batteryId_${index}" placeholder="e.g. 70">
            </div>
            <div class="form-group">
                <label class="field-label">Condition</label>
                <select class="input-field condition-select" name="${type}_condition_${index}">
                    <option value="good">All Good</option>
                    <option value="issue">Has Issue</option>
                </select>
            </div>
            <div class="form-group issue-desc hidden">
                <label class="field-label">Issue</label>
                <textarea class="input-field" name="${type}_issue_${index}" rows="2" placeholder="What is the issue?"></textarea>
            </div>
        </div>
    `;

    const getTagsTemplate = (id) => {
        const parts = [
            {name: 'Basket', color: '#f59e0b'},
            {name: 'F. Brake', color: '#ef4444'},
            {name: 'B. Brake', color: '#dc2626'},
            {name: 'F. Air', color: '#3b82f6'},
            {name: 'B. Air', color: '#2563eb'},
            {name: 'F. Puncture', color: '#8b5cf6'},
            {name: 'B. Puncture', color: '#7c3aed'},
            {name: 'Electrical', color: '#eab308'},
            {name: 'Cleaning', color: '#06b6d4'},
            {name: 'Light/Horn', color: '#f97316'},
            {name: 'Pedals/BB', color: '#10b981'},
            {name: 'Data Check', color: '#8b5cf6'}
        ];
        return parts.map(p => `
            <label class="tag-label">
                <input type="checkbox" name="parts_${id}[]" value="${p.name}">
                <div class="tag-content">
                    <div class="tag-dot" style="background-color: ${p.color}"></div>
                    ${p.name}
                </div>
            </label>
        `).join('');
    };

    const getComplexCycleTemplate = (type, id, isFirst) => `
        <div class="cycle-card" data-id="${id}">
            ${!isFirst ? `
            <div class="cycle-header" style="justify-content: flex-end;">
                <button type="button" class="btn-remove">Remove</button>
            </div>` : ''}
            <div class="form-group">
                <label class="field-label">Cycle ID</label>
                <input type="text" class="input-field" name="${type}_cycleId_${id}" placeholder="e.g. CYC-200">
            </div>
            <div class="form-group">
                <label class="field-label">Battery ID</label>
                <input type="text" class="input-field" name="${type}_batteryId_${id}" placeholder="e.g. 70">
            </div>
            <div class="form-group">
                <label class="field-label">Parts Checked</label>
                <div class="tags-grid">
                    ${getTagsTemplate(id)}
                </div>
            </div>
            <div class="form-group">
                <label class="field-label">Condition</label>
                <select class="input-field condition-select" name="${type}_condition_${id}">
                    <option value="good">All Good</option>
                    <option value="issue">Has Issue</option>
                </select>
            </div>
            <div class="form-group issue-desc hidden">
                <label class="field-label">Issue</label>
                <textarea class="input-field" name="${type}_issue_${id}" rows="2" placeholder="What is the issue?"></textarea>
            </div>
        </div>
    `;

    const getPretaskCycleTemplate = (id, isFirst) => `
        <div class="cycle-card" data-id="${id}">
            ${!isFirst ? `
            <div class="cycle-header" style="justify-content: flex-end;">
                <button type="button" class="btn-remove">Remove</button>
            </div>` : ''}
            <div class="form-group">
                <label class="field-label">Cycle ID</label>
                <select class="input-field pretask-cycle-select" name="pretask_cycleId_${id}">
                    <option value="" disabled selected>Syncing data... Please wait.</option>
                </select>
            </div>
            <div class="form-group">
                <label class="field-label">Battery ID</label>
                <input type="text" class="input-field" name="pretask_batteryId_${id}" placeholder="e.g. 70">
            </div>
            <div class="form-group">
                <label class="field-label">Parts Checked</label>
                <div class="tags-grid">
                    ${getTagsTemplate(id)}
                </div>
            </div>
            <div class="form-group">
                <label class="field-label">Condition</label>
                <select class="input-field condition-select" name="pretask_condition_${id}">
                    <option value="good">All Good</option>
                    <option value="issue">Has Issue</option>
                </select>
            </div>
            <div class="form-group issue-desc hidden">
                <label class="field-label">Issue</label>
                <textarea class="input-field" name="pretask_issue_${id}" rows="2" placeholder="What is the issue?"></textarea>
            </div>
        </div>
    `;

    const getMaintenanceCycleTemplate = (id) => `
        <div class="cycle-card" data-id="${id}">
            <div class="form-group">
                <label class="field-label">Broken Cycle ID</label>
                <input type="text" class="input-field" name="maintenance_cycleId_${id}" placeholder="e.g. CYC-100" required>
            </div>
            <div class="form-group">
                <label class="field-label">Defect Category / Issue</label>
                <input type="text" class="input-field" name="maintenance_category_${id}" placeholder="e.g. E-10 Error, Display damaged" required>
            </div>
            <div class="form-group">
                <label class="field-label">Repair Action Taken</label>
                <textarea class="input-field" name="maintenance_fix_${id}" rows="3" placeholder="Describe how the problem was solved..." required></textarea>
            </div>
            <div class="form-group">
                <label class="field-label">Odometer</label>
                <input type="text" class="input-field" name="maintenance_odometer_${id}" placeholder="e.g. 1500">
            </div>
            <div class="form-group">
                <label class="field-label">Status</label>
                <select class="input-field condition-select" name="maintenance_status_${id}">
                    <option value="Fixed (Ready to Deploy)">Fixed (Ready to Deploy)</option>
                    <option value="Pending Parts">Pending Parts</option>
                    <option value="In Progress">In Progress</option>
                </select>
            </div>
        </div>
    `;

    // --- INIT FORMS ---
    let pretaskTotalAdded = 1;
    pretaskContainer.insertAdjacentHTML('beforeend', getPretaskCycleTemplate(pretaskTotalAdded, true));

    let routineTotalAdded = 1;
    routineContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('routine', routineTotalAdded, true));
    
    let stationTotalAdded = 1;
    stationContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('station', stationTotalAdded, true));
    
    let overallCycleCount = 1;
    overallContainer.insertAdjacentHTML('beforeend', getComplexCycleTemplate('overall', overallCycleCount, true));

    let maintenanceCount = 1;
    maintenanceContainer.insertAdjacentHTML('beforeend', getMaintenanceCycleTemplate(maintenanceCount));

    // Button Listeners
    addPretaskCycleBtn.addEventListener('click', () => {
        pretaskTotalAdded++;
        pretaskContainer.insertAdjacentHTML('beforeend', getPretaskCycleTemplate(pretaskTotalAdded, false));
        updatePretaskDropdowns();
    });

    addRoutineCycleBtn.addEventListener('click', () => {
        routineTotalAdded++;
        routineContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('routine', routineTotalAdded, false));
    });

    addStationCycleBtn.addEventListener('click', () => {
        if (stationContainer.children.length < 5) {
            stationTotalAdded++;
            stationContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('station', stationTotalAdded, false));
            if (stationContainer.children.length >= 5) {
                addStationCycleBtn.classList.add('hidden');
            }
        }
    });

    addCycleBtn.addEventListener('click', () => {
        overallCycleCount++;
        overallContainer.insertAdjacentHTML('beforeend', getComplexCycleTemplate('overall', overallCycleCount, false));
    });

    const handleRemove = (container, btnToRestore) => {
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove')) {
                e.target.closest('.cycle-card').remove();
                if (btnToRestore) btnToRestore.classList.remove('hidden');
            }
        });
    };
    handleRemove(pretaskContainer);
    handleRemove(routineContainer);
    handleRemove(stationContainer, addStationCycleBtn);
    handleRemove(overallContainer);

    // --- FORM SUBMISSION ---
    clearBtn.addEventListener('click', () => {
        formScreen.reset();
        document.querySelectorAll('.issue-desc, .issue-detail-text').forEach(el => el.classList.add('hidden'));
        
        pretaskContainer.innerHTML = '';
        pretaskTotalAdded = 1;
        pretaskContainer.insertAdjacentHTML('beforeend', getPretaskCycleTemplate(pretaskTotalAdded, true));
        updatePretaskDropdowns();

        routineContainer.innerHTML = '';
        routineTotalAdded = 1;
        routineContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('routine', routineTotalAdded, true));

        stationContainer.innerHTML = '';
        stationTotalAdded = 1;
        stationContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('station', stationTotalAdded, true));
        addStationCycleBtn.classList.remove('hidden');

        overallContainer.innerHTML = '';
        overallCycleCount = 1;
        overallContainer.insertAdjacentHTML('beforeend', getComplexCycleTemplate('overall', overallCycleCount, true));

        maintenanceContainer.innerHTML = '';
        maintenanceCount = 1;
        maintenanceContainer.insertAdjacentHTML('beforeend', getMaintenanceCycleTemplate(maintenanceCount));
    });

    formScreen.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const taskType = hiddenTaskType.value;
        const staffName = staffSelect.value;
        const timestamp = new Date().toLocaleString();
        let records = [];

        let currentContainer = null;
        let niceTaskName = '';
        let stationName = 'N/A';
        
        if (taskType === 'pretask') {
            currentContainer = pretaskContainer;
            niceTaskName = 'Pre-Task Check';
        } else if (taskType === 'routine') {
            currentContainer = routineContainer;
            niceTaskName = 'Routine Checkup';
        } else if (taskType === 'station') {
            currentContainer = stationContainer;
            niceTaskName = 'Station Visit';
            stationName = 'Lazimpat';
        } else if (taskType === 'overall') {
            currentContainer = overallContainer;
            niceTaskName = 'Overall Checkup';
            stationName = 'Dillibazar';
        } else if (taskType === 'maintenance') {
            currentContainer = maintenanceContainer;
            niceTaskName = 'Maintenance';
        }

        if (currentContainer) {
            const cycleCards = currentContainer.querySelectorAll('.cycle-card');
            cycleCards.forEach(card => {
                const id = card.dataset.id;
                
                if (taskType === 'maintenance') {
                    const cId = formData.get(`maintenance_cycleId_${id}`);
                    const fixStr = formData.get(`maintenance_fix_${id}`);
                    const odoStr = formData.get(`maintenance_odometer_${id}`);
                    const statusStr = formData.get(`maintenance_status_${id}`);
                    const defectCat = formData.get(`maintenance_category_${id}`);
                    
                    if (cId && fixStr && fixStr.trim() !== '') {
                        records.push({
                            cycleId: cId.trim(),
                            defectCategory: defectCat || 'Unknown Issue',
                            fixDescription: fixStr.trim(),
                            odometer: odoStr ? odoStr.trim() : '',
                            status: statusStr || ''
                        });
                    }
                } else {
                    const cId = formData.get(`${taskType}_cycleId_${id}`);
                    const bId = formData.get(`${taskType}_batteryId_${id}`);
                    if (cId && cId.trim() !== '') {
                        const parts = (taskType === 'overall' || taskType === 'pretask') ? formData.getAll(`parts_${id}[]`).join(', ') : '';
                        records.push({
                            timestamp: timestamp,
                            staffName: staffName,
                            taskType: niceTaskName,
                            stationName: stationName,
                            cycleId: cId.trim(),
                            batteryId: bId ? bId.trim() : '',
                            condition: formData.get(`${taskType}_condition_${id}`),
                            issue: formData.get(`${taskType}_issue_${id}`) || '',
                            partsChecked: parts
                        });
                    }
                }
            });
        }

        if (records.length === 0) {
            alert('Please fill out the required fields!');
            return;
        }

        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        const payload = new URLSearchParams();
        payload.append('data', JSON.stringify(records));

        const targetUrl = (taskType === 'maintenance') ? MAINTENANCE_SCRIPT_URL : SCRIPT_URL;

        if (targetUrl === 'YOUR_NEW_MAINTENANCE_APPS_SCRIPT_URL') {
            alert('Cannot submit! Please add the Maintenance Apps Script URL to the code.');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }

        fetch(targetUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: payload
        }).then(() => {
            alert(`Successfully added ${records.length} record(s)!`);
            backBtn.click(); // Return to home screen
        }).catch(err => {
            console.error(err);
            alert('Error adding data. Please check your internet connection.');
        }).finally(() => {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    });
});
