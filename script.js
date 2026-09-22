document.addEventListener('DOMContentLoaded', () => {
    const taskRadios = document.querySelectorAll('input[name="taskType"]');
    const sections = {
        routine: document.getElementById('section-routine'),
        station: document.getElementById('section-station'),
        overall: document.getElementById('section-overall')
    };

    const routineContainer = document.getElementById('routine-cycles-container');
    const stationContainer = document.getElementById('station-cycles-container');
    const overallContainer = document.getElementById('overall-cycles-container');
    
    const addRoutineCycleBtn = document.getElementById('addRoutineCycleBtn');
    const addStationCycleBtn = document.getElementById('addStationCycleBtn');
    const addCycleBtn = document.getElementById('addCycleBtn');
    
    const workForm = document.getElementById('workForm');
    const clearBtn = document.getElementById('clearBtn');
    const staffSelect = document.getElementById('staffName');
    const assignmentNote = document.getElementById('assignmentNote');

    // Auto-assignment logic
    const stationRotation = ['Kabir', 'Laxman', 'Anish', 'Surya'];
    const overallRotation = ['Laxman', 'Anish', 'Surya', 'Kabir'];

    function updateAssignedStaff(task) {
        const today = new Date();
        const epoch = new Date(2026, 8, 21); // Sep 21, 2026 (Month is 0-indexed)
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
            staffSelect.value = ''; // Let them pick for routine
        }
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

    // Initialize the default selected task
    updateAssignedStaff('routine');

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
            {name: 'Tires', color: '#3b82f6'},
            {name: 'Brakes', color: '#ef4444'},
            {name: 'Chain', color: '#f59e0b'},
            {name: 'Pedals', color: '#10b981'},
            {name: 'Frame', color: '#8b5cf6'},
            {name: 'Gears', color: '#ec4899'},
            {name: 'Bell', color: '#06b6d4'},
            {name: 'Lights', color: '#f43f5e'}
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

    const getOverallCycleTemplate = (id, isFirst) => `
        <div class="cycle-card" data-id="${id}">
            ${!isFirst ? `
            <div class="cycle-header" style="justify-content: flex-end;">
                <button type="button" class="btn-remove">Remove</button>
            </div>` : ''}
            <div class="form-group">
                <label class="field-label">Cycle ID</label>
                <input type="text" class="input-field" name="overall_cycleId_${id}" placeholder="e.g. CYC-200">
            </div>
            <div class="form-group">
                <label class="field-label">Parts Checked</label>
                <div class="tags-grid">
                    ${getTagsTemplate(id)}
                </div>
            </div>
            <div class="form-group">
                <label class="field-label">Condition</label>
                <select class="input-field condition-select" name="overall_condition_${id}">
                    <option value="good">All Good</option>
                    <option value="issue">Has Issue</option>
                </select>
            </div>
            <div class="form-group issue-desc hidden">
                <label class="field-label">Issue</label>
                <textarea class="input-field" name="overall_issue_${id}" rows="2" placeholder="What is the issue?"></textarea>
            </div>
        </div>
    `;

    // Init forms
    let routineTotalAdded = 1;
    routineContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('routine', routineTotalAdded, true));
    
    let stationTotalAdded = 1;
    stationContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('station', stationTotalAdded, true));
    
    let overallCycleCount = 1;
    overallContainer.insertAdjacentHTML('beforeend', getOverallCycleTemplate(overallCycleCount, true));

    // Button Listeners
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
        overallContainer.insertAdjacentHTML('beforeend', getOverallCycleTemplate(overallCycleCount, false));
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
    handleRemove(routineContainer);
    handleRemove(stationContainer, addStationCycleBtn);
    handleRemove(overallContainer);

    // Clear Button
    clearBtn.addEventListener('click', () => {
        workForm.reset();
        document.querySelectorAll('.issue-desc').forEach(el => el.classList.add('hidden'));
        document.querySelector('input[name="taskType"][value="routine"]').click(); // Triggers staff update
        
        routineContainer.innerHTML = '';
        routineTotalAdded = 1;
        routineContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('routine', routineTotalAdded, true));

        stationContainer.innerHTML = '';
        stationTotalAdded = 1;
        stationContainer.insertAdjacentHTML('beforeend', getBasicCycleTemplate('station', stationTotalAdded, true));
        addStationCycleBtn.classList.remove('hidden');

        overallContainer.innerHTML = '';
        overallCycleCount = 1;
        overallContainer.insertAdjacentHTML('beforeend', getOverallCycleTemplate(overallCycleCount, true));
    });

    // Form Submission
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';

    workForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const taskType = document.querySelector('input[name="taskType"]:checked').value;
        const staffName = formData.get('staffName');
        const timestamp = new Date().toLocaleString();
        let records = [];

        let currentContainer = null;
        let niceTaskName = '';
        
        if (taskType === 'routine') {
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
                if (cId && cId.trim() !== '') {
                    const parts = taskType === 'overall' ? formData.getAll(`parts_${id}[]`).join(', ') : '';
                    records.push({
                        timestamp: timestamp,
                        staffName: staffName,
                        taskType: niceTaskName,
                        cycleId: cId.trim(),
                        condition: formData.get(`${taskType}_condition_${id}`),
                        issue: formData.get(`${taskType}_issue_${id}`) || '',
                        partsChecked: parts
                    });
                }
            });
        }

        if (records.length === 0) {
            alert('Please enter at least one Cycle ID!');
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
        }).catch(err => {
            console.error(err);
            alert('Error adding data. Please check your internet connection.');
        }).finally(() => {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    });
});
