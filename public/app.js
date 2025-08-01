// Global state
let currentProject = {
    name: '',
    beforeScripts: [],
    afterScripts: [],
    variables: {}
};

let availableActions = [];
let availableDisplays = [];
let availableAudioDevices = [];
let currentActionForModal = null;
let currentDeviceForModal = null;

// Theme management
function initializeTheme() {
    // Check for saved theme preference or default to system preference
    const savedTheme = localStorage.getItem('theme');
    let currentTheme;
    
    if (savedTheme) {
        currentTheme = savedTheme;
    } else {
        // Check system preference
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        currentTheme = systemPrefersDark ? 'dark' : 'light';
    }
    
    applyTheme(currentTheme);
    updateThemeToggle(currentTheme);
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            // Only update if user hasn't manually set a preference
            const newTheme = e.matches ? 'dark' : 'light';
            applyTheme(newTheme);
            updateThemeToggle(newTheme);
        }
    });
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function updateThemeToggle(currentTheme) {
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    if (currentTheme === 'dark') {
        themeIcon.className = 'fas fa-sun';
        themeText.textContent = 'Light Mode';
    } else {
        themeIcon.className = 'fas fa-moon';
        themeText.textContent = 'Dark Mode';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    applyTheme(newTheme);
    updateThemeToggle(newTheme);
    
    // Save preference
    localStorage.setItem('theme', newTheme);
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    initializeApp();
});

async function initializeApp() {
    await loadCategories();
    await loadActions();
    await loadProject();
    await loadDevices();
    await loadToolStatus();
    
    setupEventListeners();
    updateUI();
}

function updateUI() {
    // Update UI elements after loading data
    updateScriptLists();
    updateVariablesList();
}

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.dataset.tab;
            switchTab(tab);
        });
    });
    
    // Modal close on background click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal(this.id);
            }
        });
    });
    
    // Event delegation for script action buttons and variable buttons
    document.addEventListener('click', function(e) {
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const action = button.dataset.action;
        
        if (action === 'move') {
            const type = button.dataset.type;
            const index = parseInt(button.dataset.index);
            const direction = button.dataset.direction;
            moveScript(type, index, direction);
        } else if (action === 'remove') {
            const type = button.dataset.type;
            const index = parseInt(button.dataset.index);
            removeScript(type, index);
        } else if (action === 'remove-variable') {
            const name = button.dataset.name;
            removeVariable(name);
        } else if (action === 'close-notification') {
            button.parentElement.remove();
        }
    });
}

// Tab Management
function switchTab(tabName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load tab-specific data
    if (tabName === 'devices') {
        loadDevices();
    } else if (tabName === 'preview') {
        refreshPreview();
    }
}

// API Calls
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`/api${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        showNotification('API call failed: ' + error.message, 'error');
        throw error;
    }
}

// Variable Options
async function hasVariableOptions(variableName) {
    // Variables that have predefined options
    const variablesWithOptions = [
        'device_id', 'device_name', 'audio_device_id', 'display_device_id',
        'audio_device_name', 'service_name', 'process_name', 
        'width', 'height', 'refresh_rate', 'volume', 'volume_level', 'seconds', 'message'
    ];
    return variablesWithOptions.includes(variableName);
}

async function loadVariableOptions(variableName) {
    try {
        const options = await apiCall(`/variable-options/${variableName}`);
        return options;
    } catch (error) {
        console.error(`Failed to load options for ${variableName}:`, error);
        return [];
    }
}

// Sunshine Variables Helper
function getSunshineVariables() {
    return [
        { value: '${SUNSHINE_CLIENT_WIDTH}', label: 'Sunshine Client Width' },
        { value: '${SUNSHINE_CLIENT_HEIGHT}', label: 'Sunshine Client Height' },
        { value: '${SUNSHINE_CLIENT_FPS}', label: 'Sunshine Client FPS' },
        { value: '${SUNSHINE_APP_NAME}', label: 'Sunshine App Name' }
    ];
}

// Insert Sunshine variable into the currently focused input
function insertSunshineVariable(variable) {
    // Find the currently focused input or the last input in the modal
    const modal = document.getElementById('action-modal');
    const inputs = modal.querySelectorAll('input[type="text"], select');
    let targetInput = document.activeElement;
    
    // If no focused element or it's not an input, use the last text input
    if (!targetInput || (targetInput.tagName !== 'INPUT' && targetInput.tagName !== 'SELECT')) {
        const textInputs = Array.from(inputs).filter(input => 
            input.type === 'text' && input.style.display !== 'none'
        );
        targetInput = textInputs[textInputs.length - 1];
    }
    
    if (targetInput && targetInput.type === 'text') {
        const currentValue = targetInput.value;
        const cursorPos = targetInput.selectionStart;
        const newValue = currentValue.slice(0, cursorPos) + variable + currentValue.slice(targetInput.selectionEnd);
        targetInput.value = newValue;
        targetInput.focus();
        targetInput.setSelectionRange(cursorPos + variable.length, cursorPos + variable.length);
        
        showNotification(`Inserted ${variable}`, 'success');
    } else if (targetInput && targetInput.tagName === 'SELECT') {
        // If it's a select, try to find the custom input
        const customInput = targetInput.parentElement.querySelector('.custom-input');
        if (customInput && customInput.style.display !== 'none') {
            const currentValue = customInput.value;
            customInput.value = currentValue + variable;
            customInput.focus();
            showNotification(`Inserted ${variable}`, 'success');
        } else {
            // Set to custom mode and insert
            targetInput.value = '__custom__';
            targetInput.onchange();
            setTimeout(() => {
                const newCustomInput = targetInput.parentElement.querySelector('.custom-input');
                if (newCustomInput) {
                    newCustomInput.value = variable;
                    newCustomInput.focus();
                    showNotification(`Inserted ${variable}`, 'success');
                }
            }, 100);
        }
    }
}

// Insert Sunshine variable for device modals
function insertSunshineVariableToDevice(variable) {
    // Find the currently focused input or the last input in the device modal
    const modal = document.getElementById('device-action-modal');
    const inputs = modal.querySelectorAll('input[type="text"], select');
    let targetInput = document.activeElement;
    
    // If no focused element or it's not an input, use the last text input
    if (!targetInput || (targetInput.tagName !== 'INPUT' && targetInput.tagName !== 'SELECT')) {
        const textInputs = Array.from(inputs).filter(input => 
            input.type === 'text' && input.style.display !== 'none'
        );
        targetInput = textInputs[textInputs.length - 1];
    }
    
    if (targetInput && targetInput.type === 'text') {
        const currentValue = targetInput.value;
        const cursorPos = targetInput.selectionStart;
        const newValue = currentValue.slice(0, cursorPos) + variable + currentValue.slice(targetInput.selectionEnd);
        targetInput.value = newValue;
        targetInput.focus();
        targetInput.setSelectionRange(cursorPos + variable.length, cursorPos + variable.length);
        
        showNotification(`Inserted ${variable}`, 'success');
    } else if (targetInput && targetInput.tagName === 'SELECT') {
        // If it's a select, try to find the custom input
        const customInput = targetInput.parentElement.querySelector('.custom-input');
        if (customInput && customInput.style.display !== 'none') {
            const currentValue = customInput.value;
            customInput.value = currentValue + variable;
            customInput.focus();
            showNotification(`Inserted ${variable}`, 'success');
        } else {
            // Set to custom mode and insert
            targetInput.value = '__custom__';
            targetInput.onchange();
            setTimeout(() => {
                const newCustomInput = targetInput.parentElement.querySelector('.custom-input');
                if (newCustomInput) {
                    newCustomInput.value = variable;
                    newCustomInput.focus();
                    showNotification(`Inserted ${variable}`, 'success');
                }
            }, 100);
        }
    }
}

// Categories and Actions
async function loadCategories() {
    try {
        const categories = await apiCall('/categories');
        const select = document.getElementById('category-filter');
        select.innerHTML = '';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
        
        // Set default selection to "All"
        select.value = 'All';
    } catch (error) {
        console.error('Failed to load categories:', error);
        // Add fallback categories if the API fails
        const select = document.getElementById('category-filter');
        select.innerHTML = `
            <option value="All">All Categories</option>
            <option value="Audio">Audio</option>
            <option value="Display">Display</option>
            <option value="Process">Process</option>
            <option value="Service">Service</option>
            <option value="System">System</option>
        `;
    }
}

async function loadActions(category = 'All') {
    try {
        const actions = await apiCall(`/actions?category=${category}`);
        availableActions = actions;
        renderActions(actions);
    } catch (error) {
        console.error('Failed to load actions:', error);
        // Show fallback message if actions fail to load
        const container = document.getElementById('actions-grid');
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load actions</p>
                <small>Check console for details: ${error.message}</small>
            </div>
        `;
    }
}

function renderActions(actions) {
    const container = document.getElementById('actions-grid');
    container.innerHTML = '';
    
    if (actions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No actions found</p>
                <small>Try a different category filter</small>
            </div>
        `;
        return;
    }
    
    actions.forEach(action => {
        const actionElement = document.createElement('div');
        actionElement.className = 'action-item';
        
        actionElement.innerHTML = `
            <div class="action-category">${action.category}</div>
            <h4>${action.name}</h4>
            <p>${action.description}</p>
        `;
        
        // Use addEventListener instead of onclick for better extension compatibility
        actionElement.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showActionModal(action);
        });
        
        container.appendChild(actionElement);
    });
}

function filterActions() {
    const category = document.getElementById('category-filter').value;
    loadActions(category);
}

// Project Management
async function loadProject() {
    try {
        const project = await apiCall('/project');
        currentProject = project;
        document.getElementById('project-name').value = project.name || '';
        updateScriptLists();
        updateVariablesList();
    } catch (error) {
        console.error('Failed to load project:', error);
    }
}

async function saveProject() {
    try {
        await apiCall('/project', {
            method: 'POST',
            body: JSON.stringify(currentProject)
        });
        
        // Automatically save BAT files when project is saved
        if (currentProject.beforeScripts.length > 0 || currentProject.afterScripts.length > 0) {
            const batSaved = await exportBatFiles(false); // Don't show BAT notifications
            if (batSaved) {
                showNotification('Project and BAT files saved successfully!', 'success');
            } else {
                showNotification('Project saved, but failed to save BAT files', 'warning');
            }
        } else {
            showNotification('Project saved successfully!', 'success');
        }
    } catch (error) {
        console.error('Failed to save project:', error);
        showNotification('Failed to save project', 'error');
    }
}

async function newProject() {
    if (confirm('Create a new project? Unsaved changes will be lost.')) {
        try {
            await apiCall('/project/reset', { method: 'POST' });
            await loadProject();
            showNotification('New project created!', 'success');
        } catch (error) {
            console.error('Failed to create new project:', error);
        }
    }
}

function updateProjectName() {
    const name = document.getElementById('project-name').value;
    currentProject.name = name;
    saveProject();
}

// Action Modal
async function showActionModal(action) {
    currentActionForModal = action;
    const modal = document.getElementById('action-modal');
    const title = document.getElementById('modal-title');
    const variablesContainer = document.getElementById('modal-variables');
    
    title.textContent = `Configure ${action.name}`;
    variablesContainer.innerHTML = '';
    
    // Create input fields for variables
    for (const variable of action.variables) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.textContent = variable.charAt(0).toUpperCase() + variable.slice(1).replace('_', ' ');
        
        // Check if this variable has predefined options
        const hasOptions = await hasVariableOptions(variable);
        
        if (hasOptions) {
            const wrapper = document.createElement('div');
            wrapper.className = 'input-wrapper';
            
            const select = document.createElement('select');
            select.id = `var-${variable}`;
            select.className = 'variable-select';
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = `Choose ${variable}...`;
            select.appendChild(defaultOption);
            
            // Load options
            const options = await loadVariableOptions(variable);
            options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                select.appendChild(optionElement);
            });
            
            // Add custom input option
            const customOption = document.createElement('option');
            customOption.value = '__custom__';
            customOption.textContent = 'Custom value...';
            select.appendChild(customOption);
            
            // Custom input (hidden by default)
            const customInput = document.createElement('input');
            customInput.type = 'text';
            customInput.id = `var-${variable}-custom`;
            customInput.placeholder = `Enter custom ${variable}...`;
            customInput.style.display = 'none';
            customInput.className = 'custom-input';
            
            // Handle select change
            select.onchange = function() {
                if (this.value === '__custom__') {
                    customInput.style.display = 'block';
                    customInput.focus();
                } else {
                    customInput.style.display = 'none';
                }
            };
            
            // Pre-fill with project variables if available
            if (currentProject.variables[variable]) {
                const projectValue = currentProject.variables[variable].value;
                const matchingOption = Array.from(select.options).find(opt => opt.value === projectValue);
                if (matchingOption) {
                    select.value = projectValue;
                } else {
                    select.value = '__custom__';
                    customInput.value = projectValue;
                    customInput.style.display = 'block';
                }
            }
            
            wrapper.appendChild(select);
            wrapper.appendChild(customInput);
            formGroup.appendChild(label);
            formGroup.appendChild(wrapper);
        } else {
            // Regular text input
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `var-${variable}`;
            input.placeholder = `Enter ${variable}...`;
            
            // Pre-fill with project variables if available
            if (currentProject.variables[variable]) {
                input.value = currentProject.variables[variable].value;
            }
            
            formGroup.appendChild(label);
            formGroup.appendChild(input);
        }
        
        variablesContainer.appendChild(formGroup);
    }
    
    modal.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    currentActionForModal = null;
    currentDeviceForModal = null;
}

async function addActionToScript() {
    if (!currentActionForModal) return;
    
    const scriptType = document.querySelector('input[name="script-type"]:checked').value;
    const variables = {};
    
    // Collect variable values
    currentActionForModal.variables.forEach(variable => {
        const select = document.getElementById(`var-${variable}`);
        if (select && select.tagName === 'SELECT') {
            if (select.value === '__custom__') {
                const customInput = document.getElementById(`var-${variable}-custom`);
                variables[variable] = customInput.value || '';
            } else {
                variables[variable] = select.value || '';
            }
        } else {
            const input = document.getElementById(`var-${variable}`);
            variables[variable] = input ? input.value || '' : '';
        }
    });
    
    const actionData = {
        actionName: currentActionForModal.name,
        command: currentActionForModal.command,
        variables: variables,
        description: currentActionForModal.description
    };
    
    try {
        await apiCall(`/scripts/${scriptType}`, {
            method: 'POST',
            body: JSON.stringify({ action: actionData })
        });
        
        await loadProject();
        closeModal('action-modal');
        showNotification(`Action added to ${scriptType} script!`, 'success');
    } catch (error) {
        console.error('Failed to add action:', error);
        showNotification('Failed to add action', 'error');
    }
}

// Script Management
function updateScriptLists() {
    updateScriptList('before', currentProject.beforeScripts);
    updateScriptList('after', currentProject.afterScripts);
}

function updateScriptList(type, scripts) {
    const container = document.getElementById(`${type}-scripts`);
    const countElement = document.getElementById(`${type}-count`);
    
    countElement.textContent = `${scripts.length} action${scripts.length !== 1 ? 's' : ''}`;
    
    if (scripts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-plus-circle"></i>
                <p>No actions added yet</p>
                <small>Add actions from the library above</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    scripts.forEach((script, index) => {
        const scriptElement = document.createElement('div');
        scriptElement.className = 'script-item';
        
        // Format variables for display
        let variablesDisplay = '';
        if (script.variables && Object.keys(script.variables).length > 0) {
            const varEntries = Object.entries(script.variables)
                .filter(([key, value]) => value && value.trim() !== '')
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            if (varEntries) {
                variablesDisplay = `<small class="script-variables">${varEntries}</small>`;
            }
        }

        scriptElement.innerHTML = `
            <div class="script-info">
                <h5>${script.actionName}</h5>
                <p>${script.description}</p>
                ${variablesDisplay}
            </div>
            <div class="script-actions">
                <button data-action="move" data-direction="up" data-type="${type}" data-index="${index}" title="Move up">
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button data-action="move" data-direction="down" data-type="${type}" data-index="${index}" title="Move down">
                    <i class="fas fa-arrow-down"></i>
                </button>
                <button data-action="remove" data-type="${type}" data-index="${index}" title="Remove">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        container.appendChild(scriptElement);
    });
}

async function removeScript(type, index) {
    if (confirm('Remove this action from the script?')) {
        try {
            await apiCall(`/scripts/${type}/${index}`, { method: 'DELETE' });
            await loadProject();
            showNotification('Action removed!', 'success');
        } catch (error) {
            console.error('Failed to remove script:', error);
        }
    }
}

async function moveScript(type, index, direction) {
    try {
        await apiCall(`/scripts/${type}/${index}/move`, {
            method: 'POST',
            body: JSON.stringify({ direction })
        });
        await loadProject();
    } catch (error) {
        console.error('Failed to move script:', error);
    }
}

// Device Management
async function loadDevices() {
    await Promise.all([
        loadDisplays(),
        loadAudioDevices()
    ]);
}

async function loadDisplays() {
    try {
        const displays = await apiCall('/displays');
        availableDisplays = displays;
        renderDisplays(displays);
    } catch (error) {
        console.error('Failed to load displays:', error);
        document.getElementById('displays-list').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load displays</p>
                <small>Check console for details</small>
            </div>
        `;
    }
}

async function loadAudioDevices() {
    try {
        const devices = await apiCall('/audio-devices');
        availableAudioDevices = devices;
        renderAudioDevices(devices);
    } catch (error) {
        console.error('Failed to load audio devices:', error);
        document.getElementById('audio-list').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load audio devices</p>
                <small>Check console for details</small>
            </div>
        `;
    }
}

function renderDisplays(displays) {
    const container = document.getElementById('displays-list');
    container.innerHTML = '';
    
    displays.forEach(display => {
        const displayElement = document.createElement('div');
        displayElement.className = 'device-item';
        displayElement.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showDeviceActionModal('display', display);
        });
        
        displayElement.innerHTML = `
            <div class="device-info">
                <h4>${display.displayName || display.name}</h4>
                <small class="device-id">${display.name}</small>
                <p>Device ID: ${display.deviceId}</p>
                <p>Resolution: ${display.resolution}${display.refreshRate ? `@${display.refreshRate}Hz` : ''}</p>
                ${display.originPoint ? `<p>Position: ${display.originPoint.x},${display.originPoint.y}</p>` : ''}
                ${display.manufacturer && display.manufacturer !== 'Unknown' ? `<p>Manufacturer: ${display.manufacturer}</p>` : ''}
                ${display.adapter && display.adapter !== 'Unknown' ? `<p>GPU: ${display.adapter}</p>` : ''}
                ${display.hdrState ? `<p>HDR: ${display.hdrState}</p>` : ''}
            </div>
            <div class="device-status">
                <span class="status-badge ${display.isPrimary ? 'status-primary' : 'status-secondary'}">
                    ${display.isPrimary ? 'Primary' : 'Secondary'}
                </span>
            </div>
        `;
        
        container.appendChild(displayElement);
    });
}

function renderAudioDevices(devices) {
    const container = document.getElementById('audio-list');
    container.innerHTML = '';
    
    devices.forEach(device => {
        const deviceElement = document.createElement('div');
        deviceElement.className = 'device-item';
        deviceElement.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showDeviceActionModal('audio', device);
        });
        
        deviceElement.innerHTML = `
            <div class="device-info">
                <h4>${device.name}</h4>
                <p>Device ID: ${device.id}</p>
            </div>
            <div class="device-status">
                <span class="status-badge ${device.isDefault ? 'status-primary' : 'status-secondary'}">
                    ${device.isDefault ? 'Default' : 'Available'}
                </span>
            </div>
        `;
        
        container.appendChild(deviceElement);
    });
}

async function refreshDisplays() {
    const button = event.target;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    button.disabled = true;
    
    await loadDisplays();
    
    button.innerHTML = originalHTML;
    button.disabled = false;
    showNotification('Displays refreshed!', 'success');
}

async function refreshAudioDevices() {
    const button = event.target;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    button.disabled = true;
    
    await loadAudioDevices();
    
    button.innerHTML = originalHTML;
    button.disabled = false;
    showNotification('Audio devices refreshed!', 'success');
}

// Device Action Modal
function showDeviceActionModal(deviceType, device) {
    currentDeviceForModal = { type: deviceType, device };
    
    const modal = document.getElementById('device-action-modal');
    const title = document.getElementById('device-modal-title');
    const actionSelect = document.getElementById('device-action-type');
    const additionalVars = document.getElementById('device-additional-vars');
    
    title.textContent = `Add ${deviceType === 'display' ? 'Display' : 'Audio'} Action - ${device.name}`;
    
    // Populate action types
    actionSelect.innerHTML = '';
    const relevantActions = availableActions.filter(action => {
        if (deviceType === 'display') {
            return action.category === 'Display';
        } else {
            return action.category === 'Audio';
        }
    });
    
    relevantActions.forEach(action => {
        const option = document.createElement('option');
        option.value = action.name;
        option.textContent = action.name;
        option.dataset.variables = JSON.stringify(action.variables);
        option.dataset.command = action.command;
        option.dataset.description = action.description;
        actionSelect.appendChild(option);
    });
    
    // Update additional variables when action changes
    actionSelect.onchange = updateDeviceActionVariables;
    updateDeviceActionVariables();
    
    modal.classList.add('active');
}

async function updateDeviceActionVariables() {
    const select = document.getElementById('device-action-type');
    const container = document.getElementById('device-additional-vars');
    const selectedOption = select.selectedOptions[0];
    
    if (!selectedOption) return;
    
    const variables = JSON.parse(selectedOption.dataset.variables || '[]');
    const deviceType = currentDeviceForModal.type;
    const device = currentDeviceForModal.device;
    
    container.innerHTML = '';
    
    // Filter out variables that are pre-filled by device selection
    const deviceVars = deviceType === 'display' ? ['display_device_id'] : ['audio_device_id'];
    const additionalVars = variables.filter(v => !deviceVars.includes(v));
    
    for (const variable of additionalVars) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.textContent = variable.charAt(0).toUpperCase() + variable.slice(1).replace('_', ' ');
        
        // Check if this variable has predefined options
        const hasOptions = await hasVariableOptions(variable);
        
        if (hasOptions) {
            const wrapper = document.createElement('div');
            wrapper.className = 'input-wrapper';
            
            const select = document.createElement('select');
            select.id = `device-var-${variable}`;
            select.className = 'variable-select';
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = `Choose ${variable}...`;
            select.appendChild(defaultOption);
            
            // Load options
            const options = await loadVariableOptions(variable);
            options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                select.appendChild(optionElement);
            });
            
            // Add custom input option
            const customOption = document.createElement('option');
            customOption.value = '__custom__';
            customOption.textContent = 'Custom value...';
            select.appendChild(customOption);
            
            // Custom input (hidden by default)
            const customInput = document.createElement('input');
            customInput.type = 'text';
            customInput.id = `device-var-${variable}-custom`;
            customInput.placeholder = `Enter custom ${variable}...`;
            customInput.style.display = 'none';
            customInput.className = 'custom-input';
            
            // Handle select change
            select.onchange = function() {
                if (this.value === '__custom__') {
                    customInput.style.display = 'block';
                    customInput.focus();
                } else {
                    customInput.style.display = 'none';
                }
            };
            
            wrapper.appendChild(select);
            wrapper.appendChild(customInput);
            formGroup.appendChild(label);
            formGroup.appendChild(wrapper);
        } else {
            // Regular text input
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `device-var-${variable}`;
            input.placeholder = `Enter ${variable}...`;
            
            formGroup.appendChild(label);
            formGroup.appendChild(input);
        }
        
        container.appendChild(formGroup);
    }
}

async function addDeviceAction() {
    if (!currentDeviceForModal) return;
    
    const select = document.getElementById('device-action-type');
    const selectedOption = select.selectedOptions[0];
    const scriptType = document.querySelector('input[name="device-script-type"]:checked').value;
    
    if (!selectedOption) return;
    
    const actionName = selectedOption.value;
    const command = selectedOption.dataset.command;
    const description = selectedOption.dataset.description;
    const allVariables = JSON.parse(selectedOption.dataset.variables || '[]');
    
    const device = currentDeviceForModal.device;
    const deviceType = currentDeviceForModal.type;
    
    // Prepare variables
    const variables = {};
    
    // Pre-fill device variables
    if (deviceType === 'display') {
        variables.display_device_id = device.deviceId || device.id;
    } else {
        variables.audio_device_id = device.id;
    }
    
    // Collect additional variables
    const deviceVars = deviceType === 'display' ? ['display_device_id'] : ['audio_device_id'];
    const additionalVars = allVariables.filter(v => !deviceVars.includes(v));
    
    additionalVars.forEach(variable => {
        const select = document.getElementById(`device-var-${variable}`);
        if (select && select.tagName === 'SELECT') {
            if (select.value === '__custom__') {
                const customInput = document.getElementById(`device-var-${variable}-custom`);
                variables[variable] = customInput ? customInput.value || '' : '';
            } else {
                variables[variable] = select.value || '';
            }
        } else {
            const input = document.getElementById(`device-var-${variable}`);
            variables[variable] = input ? input.value || '' : '';
        }
    });
    
    const actionData = {
        actionName,
        command,
        variables,
        description
    };
    
    try {
        await apiCall(`/scripts/${scriptType}`, {
            method: 'POST',
            body: JSON.stringify({ action: actionData })
        });
        
        await loadProject();
        closeModal('device-action-modal');
        showNotification(`Device action added to ${scriptType} script!`, 'success');
    } catch (error) {
        console.error('Failed to add device action:', error);
        showNotification('Failed to add device action', 'error');
    }
}

// Variables Management
function showAddVariableDialog() {
    document.getElementById('var-name').value = '';
    document.getElementById('var-value').value = '';
    document.getElementById('var-description').value = '';
    document.getElementById('variable-modal').classList.add('active');
}

async function addVariable() {
    const name = document.getElementById('var-name').value.trim();
    const value = document.getElementById('var-value').value.trim();
    const description = document.getElementById('var-description').value.trim();
    
    if (!name || !value) {
        showNotification('Name and value are required', 'error');
        return;
    }
    
    try {
        await apiCall('/variables', {
            method: 'POST',
            body: JSON.stringify({ name, value, description })
        });
        
        await loadProject();
        closeModal('variable-modal');
        showNotification('Variable added!', 'success');
    } catch (error) {
        console.error('Failed to add variable:', error);
        showNotification('Failed to add variable', 'error');
    }
}

async function removeVariable(name) {
    if (confirm(`Remove variable '${name}'?`)) {
        try {
            await apiCall(`/variables/${name}`, { method: 'DELETE' });
            await loadProject();
            showNotification('Variable removed!', 'success');
        } catch (error) {
            console.error('Failed to remove variable:', error);
        }
    }
}

function updateVariablesList() {
    const container = document.getElementById('variables-list');
    const variables = currentProject.variables || {};
    
    if (Object.keys(variables).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-code"></i>
                <p>No variables defined</p>
                <small>Add variables to reuse values across scripts</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    Object.entries(variables).forEach(([name, data]) => {
        const variableElement = document.createElement('div');
        variableElement.className = 'variable-item';
        
        variableElement.innerHTML = `
            <div class="variable-info">
                <h4>${name}</h4>
                <p>${data.description || 'No description'}</p>
            </div>
            <div class="variable-actions">
                <span class="variable-value">${data.value}</span>
                <button class="btn btn-danger btn-small" data-action="remove-variable" data-name="${name}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        container.appendChild(variableElement);
    });
}

// Preview and Export
async function refreshPreview() {
    try {
        const preview = await apiCall('/export/preview');
        
        document.getElementById('before-preview').textContent = 
            preview.beforeScript || 'No before scripts defined';
        document.getElementById('after-preview').textContent = 
            preview.afterScript || 'No after scripts defined';
        document.getElementById('json-preview').textContent = 
            preview.jsonConfig || '{}';
    } catch (error) {
        console.error('Failed to refresh preview:', error);
    }
}

async function exportBatFiles(showNotifications = true) {
    try {
        if (currentProject.beforeScripts.length === 0 && currentProject.afterScripts.length === 0) {
            if (showNotifications) {
                showNotification('No scripts to save', 'warning');
            }
            return false;
        }

        const response = await fetch('/api/export/bat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (result.success) {
            if (showNotifications) {
                showNotification(`${result.message}: ${result.files.join(', ')}`, 'success');
            }
            return true;
        } else {
            if (showNotifications) {
                showNotification(result.error || 'Failed to save BAT files', 'error');
            }
            return false;
        }
    } catch (error) {
        console.error('Failed to save BAT files:', error);
        if (showNotifications) {
            showNotification('Failed to save BAT files', 'error');
        }
        return false;
    }
}

async function exportJsonConfig() {
    try {
        const response = await fetch('/api/export/json');
        const blob = await response.blob();
        downloadBlob(blob, `${currentProject.name || 'project'}_sunshine_config.json`);
        showNotification('JSON configuration exported!', 'success');
    } catch (error) {
        console.error('Failed to export JSON:', error);
        showNotification('Failed to export JSON configuration', 'error');
    }
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Utility Functions
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
        <button class="notification-close" data-action="close-notification">&times;</button>
    `;
    
    // Add to page
    let container = document.getElementById('notifications');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notifications';
        container.className = 'notifications-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

// Add notification styles
const notificationStyles = `
.notifications-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.notification {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: slideInRight 0.3s ease;
    max-width: 400px;
}

.notification button {
    background: none;
    border: none;
    color: currentColor;
    cursor: pointer;
    font-size: 1.2rem;
    padding: 0;
    margin-left: auto;
}

.notification-success {
    background: linear-gradient(135deg, #10b981, #059669);
}

.notification-error {
    background: linear-gradient(135deg, #ef4444, #dc2626);
}

.notification-warning {
    background: linear-gradient(135deg, #f59e0b, #d97706);
}

.notification-info {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
}

@keyframes slideInRight {
    from {
        opacity: 0;
        transform: translateX(100%);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}
`;

// Add notification styles to head
const style = document.createElement('style');
style.textContent = notificationStyles;
document.head.appendChild(style);

// Tools Status Management
async function loadToolStatus() {
    try {
        const statusData = await apiCall('/tools/status');
        renderToolStatus(statusData);
    } catch (error) {
        console.error('Failed to load tool status:', error);
        showToolStatusError();
    }
}

async function refreshToolStatus() {
    const button = event.target;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    button.disabled = true;
    
    await loadToolStatus();
    
    button.innerHTML = originalHTML;
    button.disabled = false;
    showNotification('Tool status refreshed!', 'info');
}

function renderToolStatus(statusData) {
    const container = document.getElementById('tools-status');
    const { summary, tools } = statusData;
    
    let statusHtml = `
        <div class="tools-summary">
            <div class="summary-item">
                <span class="summary-label">Total Tools:</span>
                <span class="summary-value">${summary.total}</span>
            </div>
            <div class="summary-item ${summary.available === summary.total ? 'success' : summary.available > 0 ? 'warning' : 'error'}">
                <span class="summary-label">Available:</span>
                <span class="summary-value">${summary.available}/${summary.total}</span>
            </div>
            ${summary.missing > 0 ? `
            <div class="summary-item error">
                <span class="summary-label">Missing:</span>
                <span class="summary-value">${summary.missing}</span>
            </div>
            ` : ''}
        </div>
        <div class="tools-list">
    `;
    
    tools.forEach(tool => {
        const statusIcon = tool.available ? 
            '<i class="fas fa-check-circle tool-available"></i>' : 
            '<i class="fas fa-times-circle tool-missing"></i>';
        
        const sizeText = tool.available && tool.size ? 
            ` (${formatFileSize(tool.size)})` : '';
        
        statusHtml += `
            <div class="tool-item ${tool.available ? 'available' : 'missing'}">
                <div class="tool-info">
                    <div class="tool-header">
                        ${statusIcon}
                        <h4>${tool.name}</h4>
                        <span class="tool-filename">${tool.filename}${sizeText}</span>
                    </div>
                    <p class="tool-description">${tool.description}</p>
                    ${!tool.available ? '<small class="tool-missing-note">Place this file in the Tools/ folder to enable related functionality</small>' : ''}
                </div>
            </div>
        `;
    });
    
    statusHtml += '</div>';
    container.innerHTML = statusHtml;
}

function showToolStatusError() {
    const container = document.getElementById('tools-status');
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Failed to check tool status</p>
            <small>Could not verify tool availability</small>
        </div>
    `;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}