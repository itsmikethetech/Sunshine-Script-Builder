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

// Helper function to execute PowerShell
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

// Comprehensive script actions library
const scriptActions = [
    // Audio Actions
    {
        name: "Set Audio Device",
        category: "Audio",
        command: `powershell.exe -command "try { $device = Get-AudioDevice -List | Where-Object { $_.ID -eq '{audio_device_id}' }; if($device) { Set-AudioDevice -ID $device.ID } } catch { Write-Host 'AudioDeviceCmdlets not available, using alternative method'; $devices = Get-WmiObject -Class Win32_SoundDevice; $targetDevice = $devices | Where-Object { $_.DeviceID -eq '{audio_device_id}' }; if($targetDevice) { $targetDevice.SetAsDefault() } }"`,
        description: "Set specific audio device as default",
        variables: ["audio_device_id"]
    },
    {
        name: "Set Volume",
        category: "Audio",
        command: `powershell.exe -command "try { Set-AudioDevice -PlaybackVolume {volume} } catch { (New-Object -comObject VolumeControl.Application).Volume = {volume} }"`,
        description: "Set system volume (0-100)",
        variables: ["volume"]
    },
    {
        name: "Set Audio Device Volume",
        category: "Audio",
        command: `powershell.exe -command "try { $device = Get-AudioDevice -List | Where-Object { $_.ID -eq '{audio_device_id}' }; if($device) { Set-AudioDevice -ID $device.ID -PlaybackVolume {volume} } } catch { Write-Host 'AudioDeviceCmdlets not available' }"`,
        description: "Set volume for specific audio device",
        variables: ["audio_device_id", "volume"]
    },
    {
        name: "Mute Audio",
        category: "Audio",
        command: `powershell.exe -command "try { Set-AudioDevice -PlaybackMute $true } catch { (New-Object -comObject VolumeControl.Application).Mute = $true }"`,
        description: "Mute system audio",
        variables: []
    },
    {
        name: "Unmute Audio",
        category: "Audio",
        command: `powershell.exe -command "try { Set-AudioDevice -PlaybackMute $false } catch { (New-Object -comObject VolumeControl.Application).Mute = $false }"`,
        description: "Unmute system audio",
        variables: []
    },
    {
        name: "Set Volume (NirCmd)",
        category: "Audio",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" setsysvolume {volume_level}) else (echo NirCmd not found in Tools folder)`,
        description: "Set system volume using NirCmd (0-65535)",
        variables: ["volume_level"]
    },
    {
        name: "Mute Audio (NirCmd)",
        category: "Audio",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" mutesysvolume 1) else (echo NirCmd not found in Tools folder)`,
        description: "Mute system audio using NirCmd",
        variables: []
    },
    {
        name: "Unmute Audio (NirCmd)",
        category: "Audio",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" mutesysvolume 0) else (echo NirCmd not found in Tools folder)`,
        description: "Unmute system audio using NirCmd",
        variables: []
    },

    // Display Actions
    {
        name: "Change Resolution (QRes)",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\qres.exe" ("{TOOLS_PATH}\\qres.exe" /x {width} /y {height}) else (echo QRes not found in Tools folder)`,
        description: "Change resolution using QRes tool",
        variables: ["width", "height"]
    },
    {
        name: "Change Resolution (NirCmd)",
        category: "Display", 
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" setdisplay {width} {height} 32) else (echo NirCmd not found in Tools folder)`,
        description: "Change resolution using NirCmd tool",
        variables: ["width", "height"]
    },
    {
        name: "Set Display as Primary",
        category: "Display",
        command: `powershell.exe -command "Add-Type -AssemblyName System.Windows.Forms; Write-Host 'Setting primary display requires external tools or registry modifications for device {display_device_id}'"`,
        description: "Set specific display as primary (requires external tools)",
        variables: ["display_device_id"]
    },
    {
        name: "Display Control Info",
        category: "Display",
        command: `powershell.exe -command "Write-Host 'Display Control for: {display_device_id}'; Write-Host 'Note: Display enable/disable requires:'; Write-Host '1. Administrator privileges, OR'; Write-Host '2. External tools like DisplayChanger, MultiMonitorTool, or nircmd'; Write-Host '3. Manual Windows Display Settings (Win+P)'; Write-Host 'Alternative: Use Turn Off All Displays or Lock Workstation'"`,
        description: "Show display control information and alternatives",
        variables: ["display_device_id"]
    },
    {
        name: "Open Display Settings",
        category: "Display",
        command: `ms-settings:display`,
        description: "Open Windows Display Settings for manual configuration",
        variables: []
    },
    {
        name: "Turn Off Displays (NirCmd)",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" monitor off) else (powershell.exe -command "(Add-Type '[DllImport(\\\"user32.dll\\\")]public static extern int SendMessage(int hWnd,int hMsg,int wParam,int lParam);' -Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)")`,
        description: "Turn off all displays using NirCmd or fallback method",
        variables: []
    },
    {
        name: "Turn On Displays (NirCmd)",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" monitor on) else (echo NirCmd not found in Tools folder - move mouse to wake displays)`,
        description: "Turn on all displays using NirCmd",
        variables: []
    },
    {
        name: "Lock Workstation",
        category: "Display",
        command: `rundll32.exe user32.dll,LockWorkStation`,
        description: "Lock the workstation and turn off displays",
        variables: []
    },
    {
        name: "Display Information",
        category: "Display",
        command: `powershell.exe -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { Write-Host ('Display: ' + $_.DeviceName + ' Resolution: ' + $_.Bounds.Width + 'x' + $_.Bounds.Height + ' Primary: ' + $_.Primary) }"`,
        description: "Display information about all connected monitors",
        variables: []
    },
    {
        name: "Switch Display Mode (Extend)",
        category: "Display",
        command: `DisplaySwitch.exe /extend`,
        description: "Switch to extend desktop across all displays",
        variables: []
    },
    {
        name: "Switch Display Mode (Duplicate)",
        category: "Display", 
        command: `DisplaySwitch.exe /clone`,
        description: "Duplicate primary display to all monitors",
        variables: []
    },
    {
        name: "Switch Display Mode (External Only)",
        category: "Display",
        command: `DisplaySwitch.exe /external`,
        description: "Use external displays only",
        variables: []
    },
    {
        name: "Switch Display Mode (Internal Only)",
        category: "Display",
        command: `DisplaySwitch.exe /internal`,
        description: "Use internal display only (laptops)",
        variables: []
    },
    {
        name: "Disable Display (MultiMonitorTool)",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\MultiMonitorTool.exe" ("{TOOLS_PATH}\\MultiMonitorTool.exe" /disable {display_device_id}) else (echo MultiMonitorTool not found in Tools folder)`,
        description: "Disable specific display using MultiMonitorTool",
        variables: ["display_device_id"]
    },
    {
        name: "Enable Display (MultiMonitorTool)",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\MultiMonitorTool.exe" ("{TOOLS_PATH}\\MultiMonitorTool.exe" /enable {display_device_id}) else (echo MultiMonitorTool not found in Tools folder)`,
        description: "Enable specific display using MultiMonitorTool",
        variables: ["display_device_id"]
    },

    // Process Actions
    {
        name: "Start Process",
        category: "Process",
        command: `powershell.exe -command "Start-Process '{process_name}'"`,
        description: "Start a specific process",
        variables: ["process_name"]
    },
    {
        name: "Stop Process",
        category: "Process",
        command: `powershell.exe -command "Stop-Process -Name '{process_name}' -Force"`,
        description: "Stop a specific process",
        variables: ["process_name"]
    },
    {
        name: "Kill Process by Name",
        category: "Process",
        command: `taskkill /F /IM {process_name}`,
        description: "Force kill process by name",
        variables: ["process_name"]
    },

    // Service Actions
    {
        name: "Start Service",
        category: "Service",
        command: `powershell.exe -command "Start-Service -Name '{service_name}'"`,
        description: "Start a Windows service",
        variables: ["service_name"]
    },
    {
        name: "Stop Service",
        category: "Service",
        command: `powershell.exe -command "Stop-Service -Name '{service_name}' -Force"`,
        description: "Stop a Windows service",
        variables: ["service_name"]
    },
    {
        name: "Restart Service",
        category: "Service",
        command: `powershell.exe -command "Restart-Service -Name '{service_name}' -Force"`,
        description: "Restart a Windows service",
        variables: ["service_name"]
    },

    // System Actions
    {
        name: "Sleep/Wait",
        category: "System",
        command: `timeout /t {seconds} /nobreak`,
        description: "Wait for specified seconds",
        variables: ["seconds"]
    },
    {
        name: "Show Notification",
        category: "System",
        command: `powershell.exe -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('{message}', 'Sunshine Script', 'OK', 'Information')"`,
        description: "Show a notification message",
        variables: ["message"]
    },
    {
        name: "Set Power Plan - High Performance",
        category: "System",
        command: `powercfg /s 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`,
        description: "Switch to High Performance power plan",
        variables: []
    },
    {
        name: "Set Power Plan - Balanced",
        category: "System",
        command: `powercfg /s 381b4222-f694-41f0-9685-ff5bb260df2e`,
        description: "Switch to Balanced power plan",
        variables: []
    },
    {
        name: "Custom PowerShell",
        category: "System",
        command: `powershell.exe -command "{command}"`,
        description: "Execute custom PowerShell command",
        variables: ["command"]
    },
    {
        name: "Custom Batch",
        category: "System",
        command: `{command}`,
        description: "Execute custom batch command",
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

// Enumerate displays with real device IDs
app.get('/api/displays', async (req, res) => {
    try {
        const cmd = `powershell.exe -command 'Add-Type -AssemblyName System.Windows.Forms; $screens = [System.Windows.Forms.Screen]::AllScreens; $pnpMonitors = @(); try { $pnpMonitors = Get-PnpDevice -Class Monitor | Where-Object { $_.Status -eq "OK" } } catch { }; $screenIndex = 0; foreach ($screen in $screens) { $screenIndex++; $deviceId = "fallback-id-" + $screenIndex; $friendlyName = "Display " + $screenIndex; if ($pnpMonitors.Count -ge $screenIndex) { $pnp = $pnpMonitors[$screenIndex - 1]; if ($pnp.InstanceId) { $deviceId = $pnp.InstanceId; $friendlyName = $pnp.FriendlyName } }; Write-Output ($screenIndex.ToString() + "|" + $deviceId + "|" + $screen.DeviceName + "|" + $screen.Bounds.Width + "x" + $screen.Bounds.Height + "|" + $screen.Primary + "|" + $friendlyName) }'`;
        
        const result = await executePowerShell(cmd);
        const displays = [];
        
        if (result.stdout) {
            const lines = result.stdout.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.includes('|') && !trimmedLine.startsWith('Found')) {
                    const parts = trimmedLine.split('|');
                    if (parts.length >= 6) {
                        const id = parseInt(parts[0]);
                        const deviceId = parts[1];
                        const devicePath = parts[2];
                        const resolution = parts[3];
                        const isPrimary = parts[4].toLowerCase() === 'true';
                        const friendlyName = parts[5];
                        
                        displays.push({
                            id: id,
                            deviceId: deviceId,
                            name: devicePath,
                            devicePath: devicePath,
                            resolution: resolution,
                            isPrimary: isPrimary,
                            friendlyName: `${friendlyName} - ${resolution}${isPrimary ? '*' : ''}`,
                            displayName: friendlyName
                        });
                    }
                }
            }
        }
        
        if (displays.length === 0) {
            displays.push({
                id: 1,
                deviceId: '{default-display-id}',
                name: '\\\\.\\DISPLAY1',
                devicePath: '\\\\.\\DISPLAY1',
                resolution: 'Unknown',
                isPrimary: true,
                friendlyName: 'Primary Display - Unknown*',
                displayName: 'Primary Display'
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
            displayName: 'Primary Display'
        }]);
    }
});

// Enumerate audio devices 
app.get('/api/audio-devices', async (req, res) => {
    try {
        const cmd = `powershell.exe -command 'try { Import-Module AudioDeviceCmdlets -ErrorAction Stop; Get-AudioDevice -List | Where-Object { $_.Type -eq "Playback" } | ForEach-Object { Write-Output ($_.Index.ToString() + "|" + $_.Name + "|" + $_.Default.ToString() + "|" + $_.ID) } } catch { Write-Output "MODULE_NOT_AVAILABLE" }'`;
        
        const result = await executePowerShell(cmd);
        const audioDevices = [];
        
        if (result.stdout && !result.stdout.includes('MODULE_NOT_AVAILABLE')) {
            const lines = result.stdout.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.includes('|')) {
                    const parts = trimmedLine.split('|');
                    if (parts.length >= 4) {
                        audioDevices.push({
                            id: parts[3].trim(),
                            index: parts[0].trim(),
                            name: parts[1].trim(),
                            isDefault: parts[2].toLowerCase().trim() === 'true',
                            friendlyName: `${parts[1].trim()}${parts[2].toLowerCase().trim() === 'true' ? ' (Default)' : ''}`
                        });
                    }
                }
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
                // Reuse the displays endpoint logic
                const cmd = `powershell.exe -command 'Add-Type -AssemblyName System.Windows.Forms; $screens = [System.Windows.Forms.Screen]::AllScreens; $pnpMonitors = @(); try { $pnpMonitors = Get-PnpDevice -Class Monitor | Where-Object { $_.Status -eq "OK" } } catch { }; $screenIndex = 0; foreach ($screen in $screens) { $screenIndex++; $deviceId = "fallback-id-" + $screenIndex; $friendlyName = "Display " + $screenIndex; if ($pnpMonitors.Count -ge $screenIndex) { $pnp = $pnpMonitors[$screenIndex - 1]; if ($pnp.InstanceId) { $deviceId = $pnp.InstanceId; $friendlyName = $pnp.FriendlyName } }; Write-Output ($screenIndex.ToString() + "|" + $deviceId + "|" + $screen.DeviceName + "|" + $screen.Bounds.Width + "x" + $screen.Bounds.Height + "|" + $screen.Primary + "|" + $friendlyName) }'`;
                
                const displayResult = await executePowerShell(cmd);
                
                if (displayResult.stdout) {
                    const lines = displayResult.stdout.split('\n');
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine.includes('|') && !trimmedLine.startsWith('Found')) {
                            const parts = trimmedLine.split('|');
                            if (parts.length >= 6) {
                                const deviceId = parts[1];
                                const resolution = parts[3];
                                const isPrimary = parts[4].toLowerCase() === 'true';
                                const friendlyName = parts[5];
                                
                                options.push({
                                    value: deviceId,
                                    label: `${friendlyName} (${resolution})${isPrimary ? ' *Primary*' : ''}`
                                });
                            }
                        }
                    }
                }
                
                if (options.length === 0) {
                    options = [{ value: '{default-display-id}', label: 'Primary Display - Unknown' }];
                }
                break;
                
            case 'audio_device_id':
                // Reuse the audio-devices endpoint logic
                const audioCmd = `powershell.exe -command 'try { Import-Module AudioDeviceCmdlets -ErrorAction Stop; Get-AudioDevice -List | Where-Object { $_.Type -eq "Playback" } | ForEach-Object { Write-Output ($_.Index.ToString() + "|" + $_.Name + "|" + $_.Default.ToString() + "|" + $_.ID) } } catch { Write-Output "MODULE_NOT_AVAILABLE" }'`;
                
                const audioResult = await executePowerShell(audioCmd);
                console.log('Audio PowerShell result:', audioResult);
                
                if (audioResult.stdout && !audioResult.stdout.includes('MODULE_NOT_AVAILABLE')) {
                    const lines = audioResult.stdout.split('\n');
                    console.log('Audio lines:', lines);
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine.includes('|')) {
                            const parts = trimmedLine.split('|');
                            console.log('Audio parts:', parts);
                            if (parts.length >= 4) {
                                const deviceId = parts[3].trim();
                                const name = parts[1].trim();
                                const isDefault = parts[2].toLowerCase().trim() === 'true';
                                
                                options.push({
                                    value: deviceId,
                                    label: `${name}${isDefault ? ' *Default*' : ''}`
                                });
                            }
                        }
                    }
                }
                
                console.log(`Final audio options (${options.length}):`, options);
                
                if (options.length === 0) {
                    options = [{ value: 'default-audio-device', label: 'Default Audio Device' }];
                }
                break;

            case 'width':
            case 'height':
                options = [
                    { value: '1920', label: '1920 (1080p width)' },
                    { value: '1080', label: '1080 (1080p height)' },
                    { value: '2560', label: '2560 (1440p width)' },
                    { value: '1440', label: '1440 (1440p height)' },
                    { value: '3840', label: '3840 (4K width)' },
                    { value: '2160', label: '2160 (4K height)' }
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
                    { value: 'steam.exe', label: 'Steam' },
                    { value: 'EpicGamesLauncher.exe', label: 'Epic Games Launcher' },
                    { value: 'uplay.exe', label: 'Ubisoft Connect' },
                    { value: 'origin.exe', label: 'Origin' },
                    { value: 'discord.exe', label: 'Discord' },
                    { value: 'spotify.exe', label: 'Spotify' },
                    { value: 'chrome.exe', label: 'Google Chrome' },
                    { value: 'firefox.exe', label: 'Mozilla Firefox' }
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
                    { value: 'Game starting...', label: 'Game starting...' },
                    { value: 'Display configuration changed', label: 'Display configuration changed' },
                    { value: 'Audio device switched', label: 'Audio device switched' },
                    { value: 'Script completed successfully', label: 'Script completed successfully' },
                    { value: 'Sunshine session started', label: 'Sunshine session started' },
                    { value: 'Sunshine session ended', label: 'Sunshine session ended' }
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