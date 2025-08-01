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
        exec(toolPath, { 
            maxBuffer: 1024 * 1024 * 10,
            timeout: 10000 // 10 second timeout
        }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Tool execution error for ${toolName}:`, error.message);
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
        console.log('Executing sunshine_info_extractor.exe...');
        const sunshineResult = await executeTool('sunshine_info_extractor.exe');
        
        console.log('sunshine_info_extractor.exe completed');
        console.log('stdout length:', sunshineResult.stdout ? sunshineResult.stdout.length : 0);
        console.log('stderr:', sunshineResult.stderr || 'none');
        
        if (!sunshineResult.stdout) {
            console.error('No output from sunshine_info_extractor.exe');
            return [];
        }
        
        const output = sunshineResult.stdout;
        
        // Find the JSON array more carefully - look for the array that starts after the log message
        const logLinePattern = /\]: Info: Currently available display devices:/;
        const logMatch = output.match(logLinePattern);
        
        if (!logMatch) {
            console.error('Could not find display devices log line in sunshine_info_extractor output');
            return [];
        }
        
        // Start looking for JSON after this line
        const searchStart = logMatch.index + logMatch[0].length;
        const jsonStartIdx = output.indexOf('[', searchStart);
        
        if (jsonStartIdx === -1) {
            console.error('Could not find JSON array start in sunshine_info_extractor output');
            return [];
        }
        
        // Find the matching closing bracket by counting brackets
        let bracketCount = 0;
        let jsonEndIdx = -1;
        
        for (let i = jsonStartIdx; i < output.length; i++) {
            if (output[i] === '[') bracketCount++;
            if (output[i] === ']') {
                bracketCount--;
                if (bracketCount === 0) {
                    jsonEndIdx = i;
                    break;
                }
            }
        }
        
        if (jsonEndIdx === -1) {
            console.error('Could not find JSON array end in sunshine_info_extractor output');
            return [];
        }
        
        let jsonString = output.substring(jsonStartIdx, jsonEndIdx + 1);
        
        // Fix JSON escaping issues - specifically handle Windows paths like \\.\DISPLAY1
        // The tool outputs \\.\DISPLAY1 but JSON needs \\.\\DISPLAY1
        jsonString = jsonString.replace(/"display_name": "\\\\\.\\DISPLAY/g, '"display_name": "\\\\.\\\\DISPLAY');
        
        let displayData;
        try {
            displayData = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('Failed to parse JSON from sunshine_info_extractor:', parseError);
            console.error('Extracted JSON string length:', jsonString.length);
            console.error('First 200 chars:', jsonString.substring(0, 200));
            console.error('Last 200 chars:', jsonString.substring(Math.max(0, jsonString.length - 200)));
            return [];
        }
        
        const monitors = displayData.map((display, index) => {
            const resolution = display.info.resolution.width + 'x' + display.info.resolution.height;
            const refreshRate = Math.round(display.info.refresh_rate.value.numerator / display.info.refresh_rate.value.denominator);
            const primaryText = display.info.primary ? ' *Primary*' : '';
            const friendlyName = display.friendly_name + ' - ' + resolution + '@' + refreshRate + 'Hz' + primaryText;
            
            return {
                id: index + 1,
                deviceId: display.device_id,
                name: display.display_name,
                devicePath: display.display_name,
                resolution: resolution,
                refreshRate: refreshRate,
                isPrimary: display.info.primary,
                friendlyName: friendlyName,
                displayName: display.friendly_name,
                manufacturer: 'Unknown',
                adapter: 'Unknown',
                originPoint: display.info.origin_point,
                hdrState: display.info.hdr_state,
                resolutionScale: display.info.resolution_scale
            };
        });
        
        console.log(`Successfully parsed ${monitors.length} displays from sunshine_info_extractor.exe`);
        monitors.forEach((monitor, index) => {
            console.log(`Display ${index + 1}: ${monitor.friendlyName} (${monitor.deviceId})`);
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
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" setdefaultsounddevice "{audio_device_name}") else (echo NirCmd not found in Tools folder)`,
        description: "Switch to a specific audio output device using NirCmd",
        variables: ["audio_device_name"]
    },
    {
        name: "Set System Volume",
        category: "Audio",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" setsysvolume {volume_level}) else (echo NirCmd not found in Tools folder)`,
        description: "Set system volume level (0-65535)",
        variables: ["volume_level"]
    },
    {
        name: "Set Volume Percentage",
        category: "Audio", 
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" changesysvolume {volume_change}) else (echo NirCmd not found in Tools folder)`,
        description: "Change system volume by percentage (-65535 to +65535)",
        variables: ["volume_change"]
    },
    {
        name: "Mute System Audio",
        category: "Audio",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" mutesysvolume 1) else (echo NirCmd not found in Tools folder)`,
        description: "Mute all system audio using NirCmd",
        variables: []
    },
    {
        name: "Unmute System Audio",
        category: "Audio",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" mutesysvolume 0) else (echo NirCmd not found in Tools folder)`,
        description: "Unmute system audio using NirCmd",
        variables: []
    },
    {
        name: "Toggle Audio Mute",
        category: "Audio",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" mutesysvolume 2) else (echo NirCmd not found in Tools folder)`,
        description: "Toggle system audio mute state using NirCmd",
        variables: []
    },

    // Display Actions
    {
        name: "Change Primary Display Resolution",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\QRes.exe" ("{TOOLS_PATH}\\QRes.exe" /x {width} /y {height}) else (echo QRes not found in Tools folder)`,
        description: "Change primary display resolution using QRes",
        variables: ["width", "height"]
    },
    {
        name: "Set Specific Display Resolution",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\MultiMonitorTool.exe" ("{TOOLS_PATH}\\MultiMonitorTool.exe" /SetDisplayMode "{device_id}" {width} {height} {refresh_rate}) else (echo MultiMonitorTool not found in Tools folder)`,
        description: "Set resolution and refresh rate for a specific display",
        variables: ["device_id", "width", "height", "refresh_rate"]
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
        command: `if exist "{TOOLS_PATH}\\MultiMonitorTool.exe" ("{TOOLS_PATH}\\MultiMonitorTool.exe" /enable "{device_id}") else (echo MultiMonitorTool not found in Tools folder)`,
        description: "Enable a specific display using MultiMonitorTool",
        variables: ["device_id"]
    },
    {
        name: "Disable Specific Display",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\MultiMonitorTool.exe" ("{TOOLS_PATH}\\MultiMonitorTool.exe" /disable "{device_id}") else (echo MultiMonitorTool not found in Tools folder)`,
        description: "Disable a specific display using MultiMonitorTool",
        variables: ["device_id"]
    },
    {
        name: "Set Display Primary",
        category: "Display",
        command: `if exist "{TOOLS_PATH}\\MultiMonitorTool.exe" ("{TOOLS_PATH}\\MultiMonitorTool.exe" /SetPrimary "{device_id}") else (echo MultiMonitorTool not found in Tools folder)`,
        description: "Set a specific display as the primary display",
        variables: ["device_id"]
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
        command: `start "" "{process_path}"`,
        description: "Launch an application by full path",
        variables: ["process_path"]
    },
    {
        name: "Launch Application with Parameters",
        category: "Process",
        command: `start "" "{process_path}" {process_args}`,
        description: "Launch an application with command line arguments",
        variables: ["process_path", "process_args"]
    },
    {
        name: "Close Application by Name",
        category: "Process",
        command: `taskkill /IM "{process_name}" /T`,
        description: "Close a running application by process name",
        variables: ["process_name"]
    },
    {
        name: "Force Kill Application",
        category: "Process",
        command: `taskkill /F /IM "{process_name}" /T`,
        description: "Forcefully terminate an application and child processes",
        variables: ["process_name"]
    },
    {
        name: "Close Application by Window Title",
        category: "Process",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" win close title "{window_title}") else (echo NirCmd not found in Tools folder)`,
        description: "Close application by window title using NirCmd",
        variables: ["window_title"]
    },
    {
        name: "Minimize Application Window",
        category: "Process",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" win min title "{window_title}") else (echo NirCmd not found in Tools folder)`,
        description: "Minimize application window by title using NirCmd",
        variables: ["window_title"]
    },

    // Service Actions
    {
        name: "Start Windows Service",
        category: "Service",
        command: `net start "{service_name}"`,
        description: "Start a Windows background service using net command",
        variables: ["service_name"]
    },
    {
        name: "Stop Windows Service",
        category: "Service",
        command: `net stop "{service_name}"`,
        description: "Stop a Windows background service using net command",
        variables: ["service_name"]
    },
    {
        name: "Restart Windows Service",
        category: "Service",
        command: `net stop "{service_name}" && net start "{service_name}"`,
        description: "Restart a Windows background service using net commands",
        variables: ["service_name"]
    },
    {
        name: "Start Service (SC Command)",
        category: "Service",
        command: `sc start "{service_name}"`,
        description: "Start a Windows service using sc command",
        variables: ["service_name"]
    },
    {
        name: "Stop Service (SC Command)",
        category: "Service",
        command: `sc stop "{service_name}"`,
        description: "Stop a Windows service using sc command",
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
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" infobox "{message}" "Sunshine Script") else (msg * "{message}")`,
        description: "Display a popup message to the user using NirCmd or msg",
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
        name: "Enable Power Saver Plan",
        category: "System",
        command: `powercfg /s a1841308-3541-4fab-bc81-f71556f20b4a`,
        description: "Switch to Power Saver power plan",
        variables: []
    },
    {
        name: "Set Custom Power Plan",
        category: "System",
        command: `powercfg /s {power_plan_guid}`,
        description: "Switch to a custom power plan by GUID",
        variables: ["power_plan_guid"]
    },
    {
        name: "Execute Registry Command",
        category: "System",
        command: `reg {reg_operation} "{reg_key}" {reg_options}`,
        description: "Execute a registry command (add, delete, query, etc.)",
        variables: ["reg_operation", "reg_key", "reg_options"]
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
    },
    {
        name: "Beep Sound",
        category: "System",
        command: `if exist "{TOOLS_PATH}\\nircmd.exe" ("{TOOLS_PATH}\\nircmd.exe" beep {frequency} {duration}) else (echo @echo off & echo powershell -c "[console]::beep({frequency},{duration})" | cmd)`,
        description: "Play a beep sound with specified frequency and duration",
        variables: ["frequency", "duration"]
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
            case 'device_id':
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

            case 'audio_device_name':
                // Use audio-info.exe for audio device names
                const audioNameResult = await executeTool('audio-info.exe');
                
                if (audioNameResult.stdout) {
                    const lines = audioNameResult.stdout.split('\n');
                    let currentDevice = {};
                    
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        
                        if (trimmedLine.startsWith('Device name')) {
                            currentDevice.name = trimmedLine.split(':')[1].trim();
                        } else if (trimmedLine.startsWith('Device state')) {
                            const state = trimmedLine.split(':')[1].trim();
                            if (state === 'Active' && currentDevice.name) {
                                const isDefault = options.length === 0;
                                options.push({
                                    value: currentDevice.name,
                                    label: `${currentDevice.name}${isDefault ? ' *Default*' : ''}`
                                });
                            }
                            currentDevice = {};
                        }
                    }
                }
                
                if (options.length === 0) {
                    options = [{ value: 'Default Audio Device', label: 'Default Audio Device' }];
                }
                break;


            case 'volume_change':
                options = [
                    { value: '+5', label: 'Increase by 5%' },
                    { value: '+10', label: 'Increase by 10%' },
                    { value: '+25', label: 'Increase by 25%' },
                    { value: '-5', label: 'Decrease by 5%' },
                    { value: '-10', label: 'Decrease by 10%' },
                    { value: '-25', label: 'Decrease by 25%' }
                ];
                break;

            case 'process_path':
                options = [
                    { value: 'C:\\Program Files (x86)\\Steam\\steam.exe', label: 'Steam' },
                    { value: 'C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe', label: 'Epic Games Launcher' },
                    { value: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', label: 'Google Chrome' },
                    { value: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe', label: 'Mozilla Firefox' },
                    { value: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Discord\\app-1.0.9037\\Discord.exe', label: 'Discord' },
                    { value: 'C:\\Users\\%USERNAME%\\AppData\\Roaming\\Spotify\\Spotify.exe', label: 'Spotify' },
                    { value: 'C:\\Program Files\\OBS Studio\\bin\\64bit\\obs64.exe', label: 'OBS Studio' },
                    { value: 'notepad.exe', label: 'Notepad' },
                    { value: 'calc.exe', label: 'Calculator' }
                ];
                break;

            case 'process_args':
                options = [
                    { value: '-windowed', label: 'Windowed Mode' },
                    { value: '-fullscreen', label: 'Fullscreen Mode' },
                    { value: '-width ${SUNSHINE_CLIENT_WIDTH} -height ${SUNSHINE_CLIENT_HEIGHT}', label: 'Use Sunshine Resolution' },
                    { value: '-nosound', label: 'No Sound' },
                    { value: '-console', label: 'Show Console' },
                    { value: '--minimized', label: 'Start Minimized' },
                    { value: '--disable-gpu', label: 'Disable GPU' },
                    { value: '', label: 'No Arguments' }
                ];
                break;

            case 'window_title':
                options = [
                    { value: 'Steam', label: 'Steam Window' },
                    { value: 'Discord', label: 'Discord Window' },
                    { value: 'Google Chrome', label: 'Chrome Window' },
                    { value: 'Mozilla Firefox', label: 'Firefox Window' },
                    { value: 'OBS Studio', label: 'OBS Studio Window' },
                    { value: 'Spotify', label: 'Spotify Window' },
                    { value: 'Calculator', label: 'Calculator Window' },
                    { value: 'Notepad', label: 'Notepad Window' },
                    { value: '${SUNSHINE_APP_NAME}', label: 'Current Sunshine App' }
                ];
                break;

            case 'power_plan_guid':
                options = [
                    { value: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', label: 'High Performance' },
                    { value: '381b4222-f694-41f0-9685-ff5bb260df2e', label: 'Balanced' },
                    { value: 'a1841308-3541-4fab-bc81-f71556f20b4a', label: 'Power Saver' },
                    { value: 'e9a42b02-d5df-448d-aa00-03f14749eb61', label: 'Ultimate Performance' }
                ];
                break;

            case 'reg_operation':
                options = [
                    { value: 'set', label: 'Set Registry Value' },
                    { value: 'del', label: 'Delete Registry Key/Value' }
                ];
                break;

            case 'reg_key':
                options = [
                    { value: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', label: 'Game DVR Settings' },
                    { value: 'HKCU\\Software\\Microsoft\\GameBar', label: 'Game Bar Settings' },
                    { value: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', label: 'System Profile' },
                    { value: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', label: 'Explorer Advanced' },
                    { value: 'HKCU\\Control Panel\\Desktop', label: 'Desktop Settings' },
                    { value: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', label: 'Power Management' }
                ];
                break;

            case 'reg_options':
                options = [
                    { value: '/v AppCaptureEnabled /t REG_DWORD /d 0', label: 'Disable Game DVR' },
                    { value: '/v GameDVR_Enabled /t REG_DWORD /d 0', label: 'Disable Game DVR Recording' },
                    { value: '/v AllowGameDVR /t REG_DWORD /d 0', label: 'Disallow Game DVR' },
                    { value: '/v ShowTaskViewButton /t REG_DWORD /d 0', label: 'Hide Task View Button' },
                    { value: '/v TaskbarGlomLevel /t REG_DWORD /d 0', label: 'Never Combine Taskbar Buttons' },
                    { value: '/v MenuDelay /t REG_SZ /d "0"', label: 'Remove Menu Delay' },
                    { value: '/v PowerThrottlingOff /t REG_DWORD /d 1', label: 'Disable Power Throttling' }
                ];
                break;

            case 'frequency':
                options = [
                    { value: '100', label: '100 Hz (Low)' },
                    { value: '200', label: '200 Hz' },
                    { value: '300', label: '300 Hz' },
                    { value: '400', label: '400 Hz' },
                    { value: '500', label: '500 Hz (Medium)' },
                    { value: '800', label: '800 Hz' },
                    { value: '1000', label: '1000 Hz (High)' },
                    { value: '1500', label: '1500 Hz' },
                    { value: '2000', label: '2000 Hz (Very High)' }
                ];
                break;

            case 'duration':
                options = [
                    { value: '100', label: '100ms (Very Short)' },
                    { value: '200', label: '200ms (Short)' },
                    { value: '500', label: '500ms (Medium)' },
                    { value: '1000', label: '1000ms (1 Second)' },
                    { value: '2000', label: '2000ms (2 Seconds)' },
                    { value: '3000', label: '3000ms (3 Seconds)' },
                    { value: '5000', label: '5000ms (5 Seconds)' }
                ];
                break;

            case 'refresh_rate':
                // Get refresh rates from display information
                const refreshDisplayResults = await getEnhancedMonitorInfo();
                const refreshRates = new Set();
                
                refreshDisplayResults.forEach(display => {
                    if (display.refreshRate) {
                        refreshRates.add(display.refreshRate);
                    }
                });
                
                // Convert to array and sort
                Array.from(refreshRates).sort((a, b) => a - b).forEach(rate => {
                    options.push({
                        value: rate.toString(),
                        label: `${rate}Hz`
                    });
                });
                
                // Add common refresh rates if none detected
                if (options.length === 0) {
                    options = [
                        { value: '60', label: '60Hz (Standard)' },
                        { value: '75', label: '75Hz' },
                        { value: '120', label: '120Hz' },
                        { value: '144', label: '144Hz (Gaming)' },
                        { value: '165', label: '165Hz' },
                        { value: '240', label: '240Hz (High-end Gaming)' }
                    ];
                }
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

app.post('/api/export/bat', async (req, res) => {
    try {
        const fs = require('fs').promises;
        const commandsDir = path.join(__dirname, 'Commands');
        
        // Ensure Commands directory exists
        try {
            await fs.access(commandsDir);
        } catch (error) {
            await fs.mkdir(commandsDir, { recursive: true });
        }
        
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

        const projectName = projectData.name || 'project';
        const savedFiles = [];

        // Save before script if it exists
        if (projectData.beforeScripts.length > 0) {
            const beforeContent = `@echo off
REM Generated by Sunshine Script Builder
REM Before Script for ${projectName}

${projectData.beforeScripts.map(script => replaceVariables(script.command, { ...projectData.variables, ...script.variables })).join('\n')}

echo Before script completed.
`;
            const beforePath = path.join(commandsDir, `${projectName}_before.bat`);
            await fs.writeFile(beforePath, beforeContent, 'utf8');
            savedFiles.push(`${projectName}_before.bat`);
        }

        // Save after script if it exists
        if (projectData.afterScripts.length > 0) {
            const afterContent = `@echo off
REM Generated by Sunshine Script Builder
REM After Script for ${projectName}

${projectData.afterScripts.map(script => replaceVariables(script.command, { ...projectData.variables, ...script.variables })).join('\n')}

echo After script completed.
`;
            const afterPath = path.join(commandsDir, `${projectName}_after.bat`);
            await fs.writeFile(afterPath, afterContent, 'utf8');
            savedFiles.push(`${projectName}_after.bat`);
        }

        if (savedFiles.length === 0) {
            return res.status(400).json({ error: 'No scripts to save' });
        }

        res.json({ 
            success: true, 
            message: `BAT files saved to Commands folder`,
            files: savedFiles 
        });
    } catch (error) {
        console.error('Failed to save BAT files:', error);
        res.status(500).json({ error: 'Failed to save BAT files' });
    }
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

// Check tool availability
app.get('/api/tools/status', async (req, res) => {
    const fs = require('fs');
    const tools = [
        {
            name: 'Sunshine Audio Info',
            filename: 'audio-info.exe',
            description: 'Audio device enumeration tool'
        },
        {
            name: 'Sunshine DXGI Info',
            filename: 'dxgi-info.exe',
            description: 'DirectX graphics information tool'
        },
        {
            name: 'NirSoft MultiMonitorTool',
            filename: 'MultiMonitorTool.exe',
            description: 'Multiple monitor management utility'
        },
        {
            name: 'NirSoft NirCMD',
            filename: 'nircmd.exe',
            description: 'Command-line utility for Windows operations'
        },
        {
            name: 'NirSoft NirCMDc',
            filename: 'nircmdc.exe',
            description: 'Console version of NirCmd utility'
        },
        {
            name: 'Microsoft QRes',
            filename: 'QRes.exe',
            description: 'Display resolution changer'
        },
        {
            name: 'MTT Sunshine Info Extractor',
            filename: 'sunshine_info_extractor.exe',
            description: 'Enhanced display information extractor'
        }
    ];

    const toolStatus = await Promise.all(tools.map(async (tool) => {
        const toolPath = path.join(__dirname, 'Tools', tool.filename);
        let available = false;
        let size = 0;
        let lastModified = null;

        try {
            const stats = fs.statSync(toolPath);
            available = stats.isFile();
            size = stats.size;
            lastModified = stats.mtime;
        } catch (error) {
            available = false;
        }

        return {
            name: tool.name,
            filename: tool.filename,
            description: tool.description,
            available,
            size,
            lastModified,
            path: toolPath
        };
    }));

    const summary = {
        total: tools.length,
        available: toolStatus.filter(tool => tool.available).length,
        missing: toolStatus.filter(tool => !tool.available).length
    };

    res.json({
        summary,
        tools: toolStatus
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Sunshine Script Builder Web running at http://localhost:${PORT}`);
    console.log('Open your browser and navigate to the URL above to use the application.');
});