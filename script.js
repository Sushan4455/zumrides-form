document.addEventListener('DOMContentLoaded', () => {
    const taskRadios = document.querySelectorAll('input[name="taskType"]');
    const sections = {
        routine: document.getElementById('section-routine'),
        station: document.getElementById('section-station'),
        overall: document.getElementById('section-overall')
    };

    const stationContainer = document.getElementById('station-cycles-container');
    const overallContainer = document.getElementById('overall-cycles-container');
    const addCycleBtn = document.getElementById('addCycleBtn');
    const addStationCycleBtn = document.getElementById('addStationCycleBtn');
    const workForm = document.getElementById('workForm');
    const clearBtn = document.getElementById('clearBtn');

    // Handle task type switching
    taskRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            Object.values(sections).forEach(section => section.classList.add('hidden'));
            if (sections[e.target.value]) {
                sections[e.target.value].classList.remove('hidden');
            }
        });
    });

    // Toggle Issue Description visibility
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('condition-select')) {
            const parentSection = e.target.closest('.task-section') || e.target.closest('.cycle-card');
            if(parentSection) {
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

    const getStationCycleTemplate = (index, isFirst) => `
        <div class="cycle-card" data-id="${index}">
            ${!isFirst ? `
            <div class="cycle-header" style="justify-content: flex-end;">
                <button type="button" class="btn-remove">Remove</button>
            </div>` : ''}
            <div class="form-group">
                <label class="field-label">Cycle ID</label>
                <input type="text" class="input-field" name="station_cycleId_${index}" placeholder="e.g. CYC-100">
            </div>
            <div class="form-group">
                <label class="field-label">Condition</label>
                <select class="input-field condition-select" name="station_condition_${index}">
                    <option value="good">All Good</option>
                    <option value="issue">Has Issue</option>
                </select>
            </div>
            <div class="form-group issue-desc hidden">
                <label class="field-label">Issue</label>
                <textarea class="input-field" name="station_issue_${index}" rows="2" placeholder="What is the issue?"></textarea>
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
    let stationTotalAdded = 1;
    stationContainer.insertAdjacentHTML('beforeend', getStationCycleTemplate(stationTotalAdded, true));
    
    let overallCycleCount = 1;
    overallContainer.insertAdjacentHTML('beforeend', getOverallCycleTemplate(overallCycleCount, true));

    // Station add cycle
    addStationCycleBtn.addEventListener('click', () => {
        if (stationContainer.children.length < 5) {
            stationTotalAdded++;
            stationContainer.insertAdjacentHTML('beforeend', getStationCycleTemplate(stationTotalAdded, false));
            if (stationContainer.children.length >= 5) {
                addStationCycleBtn.classList.add('hidden');
            }
        }
    });

    // Delegate remove for station
    stationContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove')) {
            e.target.closest('.cycle-card').remove();
            addStationCycleBtn.classList.remove('hidden');
        }
    });

    // Delegate remove for overall
    overallContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove')) {
            e.target.closest('.cycle-card').remove();
        }
    });

    addCycleBtn.addEventListener('click', () => {
        overallCycleCount++;
        overallContainer.insertAdjacentHTML('beforeend', getOverallCycleTemplate(overallCycleCount, false));
    });

    clearBtn.addEventListener('click', () => {
        workForm.reset();
        document.querySelectorAll('.issue-desc').forEach(el => el.classList.add('hidden'));
        document.querySelector('input[name="taskType"][value="routine"]').click();
        
        stationContainer.innerHTML = '';
        stationTotalAdded = 1;
        stationContainer.insertAdjacentHTML('beforeend', getStationCycleTemplate(stationTotalAdded, true));
        addStationCycleBtn.classList.remove('hidden');

        overallContainer.innerHTML = '';
        overallCycleCount = 1;
        overallContainer.insertAdjacentHTML('beforeend', getOverallCycleTemplate(overallCycleCount, true));
    });

    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec';

    workForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const taskType = document.querySelector('input[name="taskType"]:checked').value;
        const timestamp = new Date().toLocaleString();
        let records = [];

        if (taskType === 'routine') {
            const cId = formData.get('routine_cycleId');
            if (cId && cId.trim() !== '') {
                records.push({
                    timestamp: timestamp,
                    taskType: 'Routine Checkup',
                    cycleId: cId.trim(),
                    condition: formData.get('routine_condition'),
                    issue: formData.get('routine_issue') || '',
                    partsChecked: ''
                });
            }
        } else if (taskType === 'station') {
            const cycleCards = stationContainer.querySelectorAll('.cycle-card');
            cycleCards.forEach(card => {
                const id = card.dataset.id;
                const cId = formData.get(`station_cycleId_${id}`);
                if (cId && cId.trim() !== '') {
                    records.push({
                        timestamp: timestamp,
                        taskType: 'Station Visit',
                        cycleId: cId.trim(),
                        condition: formData.get(`station_condition_${id}`),
                        issue: formData.get(`station_issue_${id}`) || '',
                        partsChecked: ''
                    });
                }
            });
        } else if (taskType === 'overall') {
            const cycleCards = overallContainer.querySelectorAll('.cycle-card');
            cycleCards.forEach(card => {
                const id = card.dataset.id;
                const cId = formData.get(`overall_cycleId_${id}`);
                if (cId && cId.trim() !== '') {
                    const parts = formData.getAll(`parts_${id}[]`).join(', ');
                    records.push({
                        timestamp: timestamp,
                        taskType: 'Overall Checkup',
                        cycleId: cId.trim(),
                        condition: formData.get(`overall_condition_${id}`),
                        issue: formData.get(`overall_issue_${id}`) || '',
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
