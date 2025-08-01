const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper function to execute PowerShell or commands
function executePowerShell(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                resolve({ stdout: '', stderr: error.message });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

// Helper function to execute tool from Tools directory
function executeTool(toolName) {
    return new Promise((resolve, reject) => {
        const toolPath = path.join(__dirname, 'Tools', toolName);
        exec(toolPath, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                resolve({ stdout: '', stderr: error.message });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

// Enhanced monitor information gathering
async function getEnhancedMonitorInfo() {
    try {
        // Use sunshine_info_extractor.exe as the primary source
        const sunshineResult = await executeTool('sunshine_info_extractor.exe');
        
        if (!sunshineResult.stdout) {
            console.error('No output from sunshine_info_extractor.exe');
            return [];
        }
        
        // Extract JSON from the output - look for the array portion
        const output = sunshineResult.stdout;
        const jsonStartIdx = output.indexOf('[');
        const jsonEndIdx = output.lastIndexOf(']');
        
        if (jsonStartIdx === -1 || jsonEndIdx === -1) {
            console.error('Could not find JSON array in sunshine_info_extractor output');
            return [];
        }
        
        const jsonString = output.substring(jsonStartIdx, jsonEndIdx + 1);
        
        let displayData;
        try {
            displayData = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('Failed to parse JSON from sunshine_info_extractor:', parseError);
            console.error('JSON string:', jsonString);
            return [];
        }
        
        // Convert sunshine data to our format
        const monitors = displayData.map((display, index) => {
            const resolution = display.info.resolution.width + 'x' + display.info.resolution.height;
            const refreshRate = Math.round(display.info.refresh_rate.value.numerator / display.info.refresh_rate.value.denominator);
            
            return {
                id: index + 1,
                deviceId: display.device_id,
                name: display.display_name,
                devicePath: display.display_name,
                resolution: resolution,
                refreshRate: refreshRate,
                isPrimary: display.info.primary,
                friendlyName: display.friendly_name + ' - ' + resolution + '@' + refreshRate + 'Hz' + (display.info.primary ? ' *Primary*' : ''),
                displayName: display.friendly_name,
                manufacturer: 'Unknown', // sunshine_info_extractor doesn't provide manufacturer info
                adapter: 'Unknown', // sunshine_info_extractor doesn't provide adapter info
                originPoint: display.info.origin_point,
                hdrState: display.info.hdr_state,
                resolutionScale: display.info.resolution_scale
            });
        });
        
        return monitors;
    } catch (error) {
        console.error('Failed to get sunshine monitor info:', error);
        return [];
    }
}

// Comprehensive script actions library
const scriptActions = [
    // Audio Actions
    {
        name: "Switch Audio Device",
        category: "Audio",
        command: `powershell.exe -command "try { $device = Get-AudioDevice -List | Where-Object { $_.ID -eq '{audio_device_id}' }; if($device) { Set-AudioDevice -ID $device.ID } } catch { Write-Host 'AudioDeviceCmdlets not available, using alternative method'; $devices = Get-WmiObject -Class Win32_SoundDevice; $targetDevice = $devices | Where-Object { $_.DeviceID -eq '{audio_device_id}' }; if($targetDevice) { $targetDevice.SetAsDefault() } }"`,
        description: "Switch to a specific audio output device",
        variables: ["audio_device_id"]
    },
    {
        name: "Set System Volume",
        category: "Audio",
        command: `powershell.exe -command "try { Set-AudioDevice -PlaybackVolume {volume} } catch { (New-Object -comObject VolumeControl.Application).Volume = {volume} }"`,
        description: "Set system volume level (0-100%)",
        variables: ["volume"]
    },
    {
        name: "Switch Audio Device and Set Volume",
        category: "Audio",
        command: `powershell.exe -command "try { $device = Get-AudioDevice -List | Where-Object { $_.ID -eq '{audio_device_id}' }; if($device) { Set-AudioDevice -ID $device.ID -PlaybackVolume {volume} } } catch { Write-Host 'AudioDeviceCmdlets not available' }"`,
        description: "Switch to specific audio device and set its volume",
        variables: ["audio_device_id", "volume"]
    },
    {
        name: "Mute System Audio",
        category: "Audio",
        command: `powershell.exe -command "try { Set-AudioDevice -PlaybackMute $true } catch { (New-Object -comObject VolumeControl.Application).Mute = $true }"`,
        description: "Mute all system audio",
        variables: []
    },
    {
        name: "Unmute System Audio",
        category: "Audio",
        command: `powershell.exe -command "try { Set-AudioDevice -PlaybackMute $false } catch { (New-Object -comObject VolumeControl.Application).Mute = $false }"`,
        description: "Unmute system audio",
        variables: []
    },

    // Display Actions
    {
        name: "Change Primary Display Resolution",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\qres.exe" ("{TOOLS_PATH}\\qres.exe" /x {width} /y {height}) else (echo QRes not found in Tools folder)`,
        description: "Change primary display resolution (requires QRes tool)",
        variables: ["width", "height"]
    },
    {
        name: "Extend Desktop to All Displays",
        category: "Display",
        command: `DisplaySwitch.exe /extend`,
        description: "Extend desktop across all connected displays",
        variables: []
    },
    {
        name: "Duplicate Display to All Monitors",
        category: "Display", 
        command: `DisplaySwitch.exe /clone`,
        description: "Mirror primary display to all monitors",
        variables: []
    },
    {
        name: "Use External Displays Only",
        category: "Display",
        command: `DisplaySwitch.exe /external`,
        description: "Disable internal display, use external monitors only",
        variables: []
    },
    {
        name: "Use Internal Display Only",
        category: "Display",
        command: `DisplaySwitch.exe /internal`,
        description: "Use laptop's internal display only",
        variables: []
    },
    {
        name: "Enable Specific Display",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\MultiMonitorTool.exe" ("{TOOLS_PATH}\\MultiMonitorTool.exe" /enable {display_device_id}) else (echo MultiMonitorTool not found in Tools folder)`,
        description: "Enable a specific display (requires MultiMonitorTool)",
        variables: ["display_device_id"]
    },
    {
        name: "Disable Specific Display",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\MultiMonitorTool.exe" ("{TOOLS_PATH}\\MultiMonitorTool.exe" /disable {display_device_id}) else (echo MultiMonitorTool not found in Tools folder)`,
        description: "Disable a specific display (requires MultiMonitorTool)",
        variables: ["display_device_id"]
    },
    {
        name: "Turn Off All Displays",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" monitor off) else (powershell.exe -command "(Add-Type '[DllImport(\\\"user32.dll\\\")]public static extern int SendMessage(int hWnd,int hMsg,int wParam,int lParam);' -Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)")`,
        description: "Turn off all displays (monitors go to sleep)",
        variables: []
    },
    {
        name: "Turn On All Displays",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" monitor on) else (echo NirCmd not found - move mouse to wake displays)`,
        description: "Wake up all displays from sleep",
        variables: []
    },
    {
        name: "Lock Workstation",
        category: "Display",
        command: `rundll32.exe user32.dll,LockWorkStation`,
        description: "Lock Windows and turn off displays",
        variables: []
    },
    {
        name: "Open Display Settings",
        category: "Display",
        command: `ms-settings:display`,
        description: "Open Windows Display Settings for manual configuration",
        variables: []
    },

    // Process Actions
    {
        name: "Launch Application",
        category: "Process",
        command: `powershell.exe -command "Start-Process '{process_name}'"`,
        description: "Launch an application or executable",
        variables: ["process_name"]
    },
    {
        name: "Close Application",
        category: "Process",
        command: `powershell.exe -command "Stop-Process -Name '{process_name}' -Force"`,
        description: "Close a running application gracefully",
        variables: ["process_name"]
    },
    {
        name: "Force Kill Application",
        category: "Process",
        command: `taskkill /F /IM {process_name}`,
        description: "Forcefully terminate an application",
        variables: ["process_name"]
    },

    // Service Actions
    {
        name: "Start Windows Service",
        category: "Service",
        command: `powershell.exe -command "Start-Service -Name '{service_name}'"`,
        description: "Start a Windows background service",
        variables: ["service_name"]
    },
    {
        name: "Stop Windows Service",
        category: "Service",
        command: `powershell.exe -command "Stop-Service -Name '{service_name}' -Force"`,
        description: "Stop a Windows background service",
        variables: ["service_name"]
    },
    {
        name: "Restart Windows Service",
        category: "Service",
        command: `powershell.exe -command "Restart-Service -Name '{service_name}' -Force"`,
        description: "Restart a Windows background service",
        variables: ["service_name"]
    },

    // System Actions
    {
        name: "Wait/Delay",
        category: "System",
        command: `timeout /t {seconds} /nobreak`,
        description: "Pause script execution for specified seconds",
        variables: ["seconds"]
    },
    {
        name: "Show Popup Message",
        category: "System",
        command: `powershell.exe -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('{message}', 'Sunshine Script', 'OK', 'Information')"`,
        description: "Display a popup message to the user",
        variables: ["message"]
    },
    {
        name: "Enable High Performance Power Plan",
        category: "System",
        command: `powercfg /s 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`,
        description: "Switch to High Performance power plan for gaming",
        variables: []
    },
    {
        name: "Enable Balanced Power Plan",
        category: "System",
        command: `powercfg /s 381b4222-f694-41f0-9685-ff5bb260df2e`,
        description: "Switch to Balanced power plan for normal use",
        variables: []
    },
    {
        name: "Run Custom PowerShell Command",
        category: "System",
        command: `powershell.exe -command "{command}"`,
        description: "Execute a custom PowerShell command",
        variables: ["command"]
    },
    {
        name: "Run Custom Batch Command",
        category: "System",
        command: `{command}`,
        description: "Execute a custom Windows command",
        variables: ["command"]
    }
];

// Get all script actions
app.get('/api/actions', (req, res) => {
    const { category } = req.query;
    let filteredActions = scriptActions;
    
    if (category && category !== 'All') {
        filteredActions = scriptActions.filter(action => action.category === category);
    }
    
    res.json(filteredActions);
});

// Get available categories
app.get('/api/categories', (req, res) => {
    const categories = ['All', ...new Set(scriptActions.map(action => action.category))];
    res.json(categories);
});

// Enumerate displays with enhanced monitor information
app.get('/api/displays', async (req, res) => {
    try {
        const displays = await getEnhancedMonitorInfo();
        
        if (displays.length === 0) {
            displays.push({
                id: 1,
                deviceId: '{default-display-id}',
                name: '\\\\.\\DISPLAY1',
                devicePath: '\\\\.\\DISPLAY1',
                resolution: 'Unknown',
                isPrimary: true,
                friendlyName: 'Primary Display - Unknown*',
                displayName: 'Primary Display',
                manufacturer: 'Unknown',
                adapter: 'Unknown'
            });
        }
        
        res.json(displays);
    } catch (error) {
        console.error('Failed to enumerate displays:', error);
        res.json([{
            id: 1,
            deviceId: '{default-display-id}',
            name: '\\\\.\\DISPLAY1',
            devicePath: '\\\\.\\DISPLAY1',
            resolution: 'Unknown',
            isPrimary: true,
            friendlyName: 'Primary Display - Unknown*',
            displayName: 'Primary Display',
            manufacturer: 'Unknown',
            adapter: 'Unknown'
        }]);
    }
});

// Enumerate audio devices using audio-info.exe
app.get('/api/audio-devices', async (req, res) => {
    try {
        const result = await executeTool('audio-info.exe');
        const audioDevices = [];
        
        if (result.stdout) {
            const lines = result.stdout.split('\n');
            let currentDevice = {};
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (trimmedLine.startsWith('Device ID')) {
                    currentDevice.id = trimmedLine.split(':')[1].trim();
                } else if (trimmedLine.startsWith('Device name')) {
                    currentDevice.name = trimmedLine.split(':')[1].trim();
                } else if (trimmedLine.startsWith('Device state')) {
                    const state = trimmedLine.split(':')[1].trim();
                    if (state === 'Active' && currentDevice.id && currentDevice.name) {
                        audioDevices.push({
                            id: currentDevice.id,
                            index: audioDevices.length + 1,
                            name: currentDevice.name,
                            isDefault: false, // We'll determine default separately
                            friendlyName: currentDevice.name
                        });
                    }
                    currentDevice = {}; // Reset for next device
                }
            }
            
            // Mark first device as default (audio-info.exe doesn't indicate default)
            if (audioDevices.length > 0) {
                audioDevices[0].isDefault = true;
                audioDevices[0].friendlyName += ' (Default)';
            }
        }
        
        if (audioDevices.length === 0) {
            audioDevices.push({
                id: 'default-audio-device',
                index: '0',
                name: 'Default Audio Device',
                isDefault: true,
                friendlyName: 'Default Audio Device (Default)'
            });
        }
        
        res.json(audioDevices);
    } catch (error) {
        console.error('Failed to enumerate audio devices:', error);
        res.json([{
            id: 'error-fallback-device',
            index: '0',
            name: 'Default Audio Device',
            isDefault: true,
            friendlyName: 'Default Audio Device (Default)'
        }]);
    }
});

// Variable options API - this is the key feature!
app.get('/api/variable-options/:variableName', async (req, res) => {
    const { variableName } = req.params;
    let options = [];
    
    try {
        switch (variableName) {
            case 'display_device_id':
                // Use enhanced monitor information
                const displayResults = await getEnhancedMonitorInfo();
                
                displayResults.forEach(display => {
                    options.push({
                        value: display.deviceId,
                        label: `${display.displayName} - ${display.resolution}${display.isPrimary ? ' *Primary*' : ''}`
                    });
                });
                
                if (options.length === 0) {
                    options = [{ value: '{default-display-id}', label: 'Primary Display - Unknown' }];
                }
                break;
                
            case 'audio_device_id':
                // Use audio-info.exe for audio enumeration
                const audioResult = await executeTool('audio-info.exe');
                
                if (audioResult.stdout) {
                    const lines = audioResult.stdout.split('\n');
                    let currentDevice = {};
                    
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        
                        if (trimmedLine.startsWith('Device ID')) {
                            currentDevice.id = trimmedLine.split(':')[1].trim();
                        } else if (trimmedLine.startsWith('Device name')) {
                            currentDevice.name = trimmedLine.split(':')[1].trim();
                        } else if (trimmedLine.startsWith('Device state')) {
                            const state = trimmedLine.split(':')[1].trim();
                            if (state === 'Active' && currentDevice.id && currentDevice.name) {
                                const isDefault = options.length === 0; // First device is default
                                options.push({
                                    value: currentDevice.id,
                                    label: `${currentDevice.name}${isDefault ? ' *Default*' : ''}`
                                });
                            }
                            currentDevice = {}; // Reset for next device
                        }
                    }
                }
                
                if (options.length === 0) {
                    options = [{ value: 'default-audio-device', label: 'Default Audio Device' }];
                }
                break;

            case 'width':
                options = [
                    { value: '1920', label: '1920 (Full HD)' },
                    { value: '2560', label: '2560 (1440p)' },
                    { value: '3840', label: '3840 (4K)' },
                    { value: '1680', label: '1680 (1050p)' },
                    { value: '1366', label: '1366 (768p)' },
                    { value: '${SUNSHINE_CLIENT_WIDTH}', label: 'Use Sunshine Client Width' }
                ];
                break;
                
            case 'height':
                options = [
                    { value: '1080', label: '1080 (Full HD)' },
                    { value: '1440', label: '1440 (1440p)' },
                    { value: '2160', label: '2160 (4K)' },
                    { value: '1050', label: '1050 (1050p)' },
                    { value: '768', label: '768 (768p)' },
                    { value: '${SUNSHINE_CLIENT_HEIGHT}', label: 'Use Sunshine Client Height' }
                ];
                break;

            case 'service_name':
                options = [
                    { value: 'Spooler', label: 'Print Spooler' },
                    { value: 'Themes', label: 'Themes' },
                    { value: 'AudioSrv', label: 'Windows Audio' },
                    { value: 'AudioEndpointBuilder', label: 'Windows Audio Endpoint Builder' },
                    { value: 'NVIDIA Display Driver Service', label: 'NVIDIA Display Driver Service' },
                    { value: 'AMD External Events Utility', label: 'AMD External Events Utility' }
                ];
                break;

            case 'process_name':
                options = [
                    { value: 'steam.exe', label: 'Steam Gaming Client' },
                    { value: 'EpicGamesLauncher.exe', label: 'Epic Games Launcher' },
                    { value: 'uplay.exe', label: 'Ubisoft Connect' },
                    { value: 'origin.exe', label: 'EA Origin' },
                    { value: 'Battle.net.exe', label: 'Battle.net (Blizzard)' },
                    { value: 'discord.exe', label: 'Discord' },
                    { value: 'spotify.exe', label: 'Spotify Music' },
                    { value: 'chrome.exe', label: 'Google Chrome' },
                    { value: 'firefox.exe', label: 'Mozilla Firefox' },
                    { value: 'obs64.exe', label: 'OBS Studio' },
                    { value: 'MSIAfterburner.exe', label: 'MSI Afterburner' }
                ];
                break;

            case 'volume':
                options = [
                    { value: '0', label: '0% (Mute)' },
                    { value: '10', label: '10%' },
                    { value: '25', label: '25%' },
                    { value: '50', label: '50%' },
                    { value: '75', label: '75%' },
                    { value: '100', label: '100% (Max)' }
                ];
                break;

            case 'volume_level':
                options = [
                    { value: '0', label: '0 (Mute)' },
                    { value: '6553', label: '6553 (10%)' },
                    { value: '16384', label: '16384 (25%)' },
                    { value: '32768', label: '32768 (50%)' },
                    { value: '49152', label: '49152 (75%)' },
                    { value: '65535', label: '65535 (100% Max)' }
                ];
                break;

            case 'seconds':
                options = [
                    { value: '1', label: '1 second' },
                    { value: '2', label: '2 seconds' },
                    { value: '3', label: '3 seconds' },
                    { value: '5', label: '5 seconds' },
                    { value: '10', label: '10 seconds' },
                    { value: '30', label: '30 seconds' }
                ];
                break;

            case 'message':
                options = [
                    { value: 'Launching ${SUNSHINE_APP_NAME}...', label: 'Game Launch Message' },
                    { value: 'Gaming setup complete!', label: 'Setup Complete Message' },
                    { value: 'Display switched to ${SUNSHINE_CLIENT_WIDTH}x${SUNSHINE_CLIENT_HEIGHT}', label: 'Resolution Change Message' },
                    { value: 'Audio device configured for gaming', label: 'Audio Setup Message' },
                    { value: 'High performance mode enabled', label: 'Performance Mode Message' },
                    { value: 'Sunshine session initialized', label: 'Session Start Message' },
                    { value: 'Restoring previous settings...', label: 'Cleanup Message' }
                ];
                break;

            case 'command':
                options = [
                    { value: 'Get-Process | Where-Object {$_.ProcessName -eq "steam"} | Stop-Process', label: 'Stop Steam Process' },
                    { value: 'Get-Service "NVIDIA Display Driver Service" | Restart-Service', label: 'Restart NVIDIA Service' },
                    { value: 'Get-WmiObject -Class Win32_Process -Filter "name=\'discord.exe\'" | Invoke-WmiMethod -Name Terminate', label: 'Close Discord' },
                    { value: 'Start-Process "steam://launch/YOUR_GAME_ID"', label: 'Launch Steam Game by ID' },
                    { value: 'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 0', label: 'Disable Game DVR' }
                ];
                break;
                
            default:
                options = [];
        }
        
        res.json(options);
    } catch (error) {
        console.error(`Failed to get options for variable ${variableName}:`, error);
        res.json([]);
    }
});

// Basic project data (minimal for demo)
let projectData = {
    name: 'Demo Project',
    beforeScripts: [],
    afterScripts: [],
    variables: {}
};

app.get('/api/project', (req, res) => {
    res.json(projectData);
});

app.post('/api/scripts/:type', (req, res) => {
    const { type } = req.params;
    const { action } = req.body;
    
    if (type === 'before') {
        projectData.beforeScripts.push(action);
    } else if (type === 'after') {
        projectData.afterScripts.push(action);
    }
    
    res.json({ success: true });
});

// Delete script action
app.delete('/api/scripts/:type/:index', (req, res) => {
    const { type, index } = req.params;
    const idx = parseInt(index);
    
    if (type === 'before' && projectData.beforeScripts[idx]) {
        projectData.beforeScripts.splice(idx, 1);
    } else if (type === 'after' && projectData.afterScripts[idx]) {
        projectData.afterScripts.splice(idx, 1);
    }
    
    res.json({ success: true });
});

// Move script action
app.post('/api/scripts/:type/:index/move', (req, res) => {
    const { type, index } = req.params;
    const { direction } = req.body;
    const idx = parseInt(index);
    
    let scripts = type === 'before' ? projectData.beforeScripts : projectData.afterScripts;
    
    if (direction === 'up' && idx > 0) {
        [scripts[idx], scripts[idx - 1]] = [scripts[idx - 1], scripts[idx]];
    } else if (direction === 'down' && idx < scripts.length - 1) {
        [scripts[idx], scripts[idx + 1]] = [scripts[idx + 1], scripts[idx]];
    }
    
    res.json({ success: true });
});

// Variables management
app.post('/api/variables', (req, res) => {
    const { name, value, description } = req.body;
    
    if (!name || !value) {
        return res.status(400).json({ error: 'Name and value are required' });
    }
    
    projectData.variables[name] = { value, description: description || '' };
    res.json({ success: true, variables: projectData.variables });
});

app.delete('/api/variables/:name', (req, res) => {
    const { name } = req.params;
    
    if (projectData.variables[name]) {
        delete projectData.variables[name];
    }
    
    res.json({ success: true, variables: projectData.variables });
});

// Project management
app.post('/api/project', (req, res) => {
    const newProjectData = req.body;
    projectData = { ...projectData, ...newProjectData };
    res.json({ success: true, project: projectData });
});

app.post('/api/project/reset', (req, res) => {
    projectData = {
        name: '',
        beforeScripts: [],
        afterScripts: [],
        variables: {}
    };
    res.json({ success: true, project: projectData });
});

// Export functionality
app.get('/api/export/preview', (req, res) => {
    const replaceVariables = (command, variables) => {
        let result = command;
        
        // Replace TOOLS_PATH placeholder with absolute Windows path to Tools folder
        let toolsPath = path.join(__dirname, 'Tools');
        // Convert WSL path to Windows path (e.g., /mnt/c/Users... -> C:\Users...)
        if (toolsPath.startsWith('/mnt/')) {
            toolsPath = toolsPath.replace(/^\/mnt\/([a-z])\//, '$1:\\\\').replace(/\//g, '\\\\');
        } else {
            toolsPath = toolsPath.replace(/\//g, '\\\\');
        }
        result = result.replace(/{TOOLS_PATH}/g, toolsPath);
        
        // Replace user variables
        Object.entries(variables).forEach(([key, value]) => {
            result = result.replace(new RegExp(`{${key}}`, 'g'), value.value || value);
        });
        return result;
    };

    const beforeScript = projectData.beforeScripts.map(script => 
        replaceVariables(script.command, { ...projectData.variables, ...script.variables })
    ).join('\n');

    const afterScript = projectData.afterScripts.map(script => 
        replaceVariables(script.command, { ...projectData.variables, ...script.variables })
    ).join('\n');

    const jsonConfig = JSON.stringify({
        name: projectData.name,
        prep: {
            do: beforeScript || '',
            undo: afterScript || ''
        }
    }, null, 2);

    res.json({
        beforeScript,
        afterScript,
        jsonConfig
    });
});

app.get('/api/export/bat/:type', (req, res) => {
    const { type } = req.params;
    const scripts = type === 'before' ? projectData.beforeScripts : projectData.afterScripts;
    
    const replaceVariables = (command, variables) => {
        let result = command;
        
        // Replace TOOLS_PATH placeholder with absolute Windows path to Tools folder
        let toolsPath = path.join(__dirname, 'Tools');
        // Convert WSL path to Windows path (e.g., /mnt/c/Users... -> C:\Users...)
        if (toolsPath.startsWith('/mnt/')) {
            toolsPath = toolsPath.replace(/^\/mnt\/([a-z])\//, '$1:\\\\').replace(/\//g, '\\\\');
        } else {
            toolsPath = toolsPath.replace(/\//g, '\\\\');
        }
        result = result.replace(/{TOOLS_PATH}/g, toolsPath);
        
        // Replace user variables
        Object.entries(variables).forEach(([key, value]) => {
            result = result.replace(new RegExp(`{${key}}`, 'g'), value.value || value);
        });
        return result;
    };

    const batContent = `@echo off
REM Generated by Sunshine Script Builder
REM ${type.charAt(0).toUpperCase() + type.slice(1)} Script for ${projectData.name || 'Untitled Project'}

${scripts.map(script => replaceVariables(script.command, { ...projectData.variables, ...script.variables })).join('\n')}

echo ${type.charAt(0).toUpperCase() + type.slice(1)} script completed.
`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${projectData.name || 'project'}_${type}.bat"`);
    res.send(batContent);
});

app.get('/api/export/json', (req, res) => {
    const replaceVariables = (command, variables) => {
        let result = command;
        
        // Replace TOOLS_PATH placeholder with absolute Windows path to Tools folder
        let toolsPath = path.join(__dirname, 'Tools');
        // Convert WSL path to Windows path (e.g., /mnt/c/Users... -> C:\Users...)
        if (toolsPath.startsWith('/mnt/')) {
            toolsPath = toolsPath.replace(/^\/mnt\/([a-z])\//, '$1:\\\\').replace(/\//g, '\\\\');
        } else {
            toolsPath = toolsPath.replace(/\//g, '\\\\');
        }
        result = result.replace(/{TOOLS_PATH}/g, toolsPath);
        
        // Replace user variables
        Object.entries(variables).forEach(([key, value]) => {
            result = result.replace(new RegExp(`{${key}}`, 'g'), value.value || value);
        });
        return result;
    };

    const beforeScript = projectData.beforeScripts.map(script => 
        replaceVariables(script.command, { ...projectData.variables, ...script.variables })
    ).join('\n');

    const afterScript = projectData.afterScripts.map(script => 
        replaceVariables(script.command, { ...projectData.variables, ...script.variables })
    ).join('\n');

    const jsonConfig = {
        name: projectData.name,
        prep: {
            do: beforeScript || '',
            undo: afterScript || ''
        }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${projectData.name || 'project'}_sunshine_config.json"`);
    res.send(JSON.stringify(jsonConfig, null, 2));
});


// Start server
app.listen(PORT, () => {
    console.log(`Sunshine Script Builder Web running at http://localhost:${PORT}`);
    console.log('Open your browser and navigate to the URL above to use the application.');
});