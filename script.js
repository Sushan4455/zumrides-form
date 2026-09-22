document.addEventListener('DOMContentLoaded', () => {
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';
    
    const taskRadios = document.querySelectorAll('input[name="taskType"]');
    const sections = {
        pretask: document.getElementById('section-pretask'),
        routine: document.getElementById('section-routine'),
        station: document.getElementById('section-station'),
        overall: document.getElementById('section-overall')
    };

    const pretaskContainer = document.getElementById('pretask-cycles-container');
    const routineContainer = document.getElementById('routine-cycles-container');
    const stationContainer = document.getElementById('station-cycles-container');
    const overallContainer = document.getElementById('overall-cycles-container');
    
    const addPretaskCycleBtn = document.getElementById('addPretaskCycleBtn');
    const addRoutineCycleBtn = document.getElementById('addRoutineCycleBtn');
    const addStationCycleBtn = document.getElementById('addStationCycleBtn');
    const addCycleBtn = document.getElementById('addCycleBtn');
    
    const workForm = document.getElementById('workForm');
    const clearBtn = document.getElementById('clearBtn');
    const staffSelect = document.getElementById('staffName');
    const assignmentNote = document.getElementById('assignmentNote');

    // --- TWO-WAY SYNC FOR PRE-TASK ---
    let fetchedCycles = [];
    
    window.handleSyncData = function(response) {
        // Deduplicate cycles in case they were checked multiple times (keep latest)
        const uniqueCycles = {};
        response.data.forEach(c => {
            uniqueCycles[c.cycleId] = c;
        });
        fetchedCycles = Object.values(uniqueCycles);
        updatePretaskDropdowns();
    };

    function fetchYesterdayData() {
        const script = document.createElement('script');
        script.src = SCRIPT_URL + '?callback=handleSyncData';
        document.body.appendChild(script);
    }

    function updatePretaskDropdowns() {
        const currentStaff = staffSelect.value;
        const selects = document.querySelectorAll('.pretask-cycle-select');
        
        // Rule: Cycle must have been checked yesterday in Routine, and NOT by this current staff
        const eligible = fetchedCycles.filter(c => c.staffName !== currentStaff);
        
        selects.forEach(select => {
            const currentVal = select.value;
            select.innerHTML = '<option value="" disabled selected>Select an eligible cycle...</option>';
            
            if (fetchedCycles.length === 0) {
                select.innerHTML = '<option value="" disabled selected>Syncing data... Please wait.</option>';
                return;
            }

            if (eligible.length === 0) {
                select.innerHTML = '<option value="" disabled selected>No eligible cycles found</option>';
                return;
            }

            eligible.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.cycleId;
                opt.textContent = `${c.cycleId} (Checked by ${c.staffName || 'Unknown'})`;
                select.appendChild(opt);
            });
            
            if (currentVal && eligible.find(c => c.cycleId === currentVal)) {
                select.value = currentVal;
            }
        });
    }

    staffSelect.addEventListener('change', updatePretaskDropdowns);
    // ---------------------------------

    // Auto-assignment logic
    const stationRotation = ['Kabir', 'Laxman', 'Anish', 'Surya'];
    const overallRotation = ['Laxman', 'Anish', 'Surya', 'Kabir'];

    function updateAssignedStaff(task) {
        const today = new Date();
        const epoch = new Date(2026, 8, 21);
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysDiff = Math.floor((todayMidnight - epoch) / (1000 * 60 * 60 * 24));
        const index = ((daysDiff % 4) + 4) % 4;

        if (task === 'station') {
            staffSelect.value = stationRotation[index];
            assignmentNote.style.display = 'block';
            assignmentNote.textContent = `★ ${stationRotation[index]} is assigned to Station Visit today`;
        } else if (task === 'overall') {
            staffSelect.value = overallRotation[index];
            assignmentNote.style.display = 'block';
            assignmentNote.textContent = `★ ${overallRotation[index]} is assigned to Overall Checkup today`;
        } else {
            assignmentNote.style.display = 'none';
            // Don't auto-clear if they already selected a name, just hide the note
            if (task === 'pretask' && !staffSelect.value) {
                staffSelect.value = ''; 
            }
        }
        updatePretaskDropdowns();
    }

    // Handle task type switching
    taskRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            Object.values(sections).forEach(section => section.classList.add('hidden'));
            if (sections[e.target.value]) {
                sections[e.target.value].classList.remove('hidden');
                updateAssignedStaff(e.target.value);
            }
        });
    });

    // Toggle Issue Description visibility
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

    // Special template for Pre-Task with dynamic dropdown instead of text input
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

    // Init forms
    let pretaskTotalAdded = 1;
    pretaskContainer.insertAdjacentHTML('beforeend', getPretaskCycleTemplate(pretaskTotalAdded, true));

    let routineTotalAdded = 1;
    routineContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('routine', routineTotalAdded, true));
    
    let stationTotalAdded = 1;
    stationContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('station', stationTotalAdded, true));
    
    let overallCycleCount = 1;
    overallContainer.insertAdjacentHTML('beforeend', getComplexCycleTemplate('overall', overallCycleCount, true));

    // Fetch initial data
    updateAssignedStaff('pretask');
    fetchYesterdayData();

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

    // Delegate removes
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

    // Clear Button
    clearBtn.addEventListener('click', () => {
        workForm.reset();
        document.querySelectorAll('.issue-desc').forEach(el => el.classList.add('hidden'));
        document.querySelector('input[name="taskType"][value="pretask"]').click(); // Reset to pretask
        
        pretaskContainer.innerHTML = '';
        pretaskTotalAdded = 1;
        pretaskContainer.insertAdjacentHTML('beforeend', getPretaskCycleTemplate(pretaskTotalAdded, true));
        updatePretaskDropdowns(); // Re-populate dropdowns

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
    });

    // Form Submission
    workForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const taskType = document.querySelector('input[name="taskType"]:checked').value;
        const staffName = formData.get('staffName');
        const timestamp = new Date().toLocaleString();
        let records = [];

        let currentContainer = null;
        let niceTaskName = '';
        
        if (taskType === 'pretask') {
            currentContainer = pretaskContainer;
            niceTaskName = 'Pre-Task Check';
        } else if (taskType === 'routine') {
            currentContainer = routineContainer;
            niceTaskName = 'Routine Checkup';
        } else if (taskType === 'station') {
            currentContainer = stationContainer;
            niceTaskName = 'Station Visit';
        } else if (taskType === 'overall') {
            currentContainer = overallContainer;
            niceTaskName = 'Overall Checkup';
        }

        if (currentContainer) {
            const cycleCards = currentContainer.querySelectorAll('.cycle-card');
            cycleCards.forEach(card => {
                const id = card.dataset.id;
                const cId = formData.get(`${taskType}_cycleId_${id}`);
                const bId = formData.get(`${taskType}_batteryId_${id}`);
                if (cId && cId.trim() !== '') {
                    const parts = (taskType === 'overall' || taskType === 'pretask') ? formData.getAll(`parts_${id}[]`).join(', ') : '';
                    records.push({
                        timestamp: timestamp,
                        staffName: staffName,
                        taskType: niceTaskName,
                        cycleId: cId.trim(),
                        batteryId: bId ? bId.trim() : '',
                        condition: formData.get(`${taskType}_condition_${id}`),
                        issue: formData.get(`${taskType}_issue_${id}`) || '',
                        partsChecked: parts
                    });
                }
            });
        }

        if (records.length === 0) {
            alert('Please select or enter at least one Cycle ID!');
            return;
        }

        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Adding...';
        submitBtn.disabled = true;

        const payload = new URLSearchParams();
        payload.append('data', JSON.stringify(records));

        fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: payload
        }).then(() => {
            alert(`Successfully added ${records.length} cycle(s)!`);
            clearBtn.click();
            
            // If we just submitted routine cycles, re-fetch to update the Pre-Task dropdowns
            if (taskType === 'routine') {
                fetchYesterdayData();
            }
            
        }).catch(err => {
            console.error(err);
            alert('Error adding data. Please check your internet connection.');
        }).finally(() => {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    });
});
