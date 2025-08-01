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

// Demo script actions for testing
const scriptActions = [
    {
        name: "Set Audio Device",
        category: "Audio",
        command: `powershell.exe -command "Set-AudioDevice -ID '{device_id}'"`,
        description: "Set specific audio device as default",
        variables: ["device_id"]
    },
    {
        name: "Change Display Resolution",
        category: "Display", 
        command: `powershell.exe -command "Set-DisplayResolution -DeviceId '{device_id}' -Width {width} -Height {height}"`,
        description: "Change display resolution",
        variables: ["device_id", "width", "height"]
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
            case 'device_id':
                // Use hardcoded real device IDs from enumeration for demo
                options = [
                    { value: 'DISPLAY\\AOC2401\\5&1B9320C7&0&UID33028', label: 'AOC 24G1WG3 (Display)' },
                    { value: 'DISPLAY\\HWP327A\\5&1B9320C7&0&UID33027', label: 'HP E232 (Display)' },
                    { value: 'DISPLAY\\GSM7765\\5&1B9320C7&0&UID33024', label: 'LG ULTRAGEAR (Display)' },
                    { value: '{0.0.0.00000000}.{336d5fab-93c7-4604-8ecc-35421228a322}', label: 'LG ULTRAGEAR (Audio)' },
                    { value: '{0.0.0.00000000}.{459db12c-f008-4671-bb3a-14de0baf2ba6}', label: 'High Definition Audio Device (Audio)' },
                    { value: '{0.0.0.00000000}.{cfff7096-63f8-4354-99e7-b565993831a8}', label: 'Shure MVX2U Headphones (Audio)' },
                    { value: '{0.0.0.00000000}.{e7d8df80-c73a-4e07-89b6-10a034c97355}', label: 'Logitech PRO X Wireless (Audio)' }
                ];
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

// Start server
app.listen(PORT, () => {
    console.log(`Sunshine Script Builder Web (MINIMAL) running at http://localhost:${PORT}`);
    console.log('This is a minimal version to test device enumeration and variable options!');
});