# Sunshine Script Builder

A web-based GUI tool for creating and managing Sunshine prep-cmd scripts. This application provides an intuitive interface for building Windows batch scripts that can control displays, audio devices, processes, and system settings before and after Sunshine game streaming sessions.

## Features

### 🎮 **Sunshine Integration**
- Export scripts as Windows BAT files for direct execution
- Generate JSON configurations compatible with Sunshine's prep-cmd system

### 🖥️ **Display Management**
- Enable/disable specific monitors using stable Short Monitor IDs
- Change display resolution and refresh rates
- Set primary display and extend/clone configurations
- Compatible with virtual displays and multi-monitor setups

### 🔊 **Audio Control**
- Switch between audio output devices
- Control system volume levels
- Mute/unmute audio devices

### ⚙️ **System & Process Management**
- Start/stop Windows services
- Launch applications and processes
- Execute PowerShell commands
- Custom command execution

### 🔧 **Smart Device Detection**
- Automatic enumeration of displays with real device information
- Audio device detection with friendly names
- Hardware-based device identification that persists across reboots

### 📋 **Project Management**
- Save and load script configurations
- Variable system for dynamic values
- Support for Sunshine environment variables
- Real-time preview of generated scripts

## Installation

### Prerequisites
- Node.js (v14 or higher)
- Windows system for target script execution
- Optional: External tools in `Tools/` folder for enhanced functionality

### Setup
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Sunshine-Script-Builder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

### Creating Scripts

1. **Select Actions**: Browse the action library organized by category (Audio, Display, Process, Service, System)
2. **Configure Variables**: Fill in device names, resolutions, file paths, etc.
3. **Build Scripts**: Add actions to "Before Scripts" (prep.do) and "After Scripts" (prep.undo)
4. **Preview**: Review generated commands in the Preview tab
5. **Export**: Download as BAT files or JSON configuration

### Device Management

The application automatically detects:
- **Displays**: Real monitor names, resolutions, and Short Monitor IDs
- **Audio Devices**: Available output devices with friendly names
- **System Information**: Current display settings and hardware details

### Variable System

**Project Variables**: Custom values stored within your project
**Sunshine Variables**: Built-in environment variables
- `${SUNSHINE_CLIENT_WIDTH}` - Client display width
- `${SUNSHINE_CLIENT_HEIGHT}` - Client display height  
- `${SUNSHINE_CLIENT_FPS}` - Target frame rate
- `${SUNSHINE_APP_NAME}` - Application name

### Tools Integration

External tools can be placed in the `Tools/` folder:
- **MultiMonitorTool.exe**: Advanced display management
- **QRes.exe**: Display resolution changes
- **NirCmd.exe**: System control utilities
- **audio-info.exe**: Audio device enumeration

## External Tools

The application includes integration with several Windows utilities:

### MultiMonitorTool
- **Purpose**: Advanced multi-monitor management
- **Usage**: Enable/disable displays, set primary monitor
- **Download**: [NirSoft MultiMonitorTool](http://www.nirsoft.net/utils/multi_monitor_tool.html)

### QRes
- **Purpose**: Change display resolution
- **Usage**: Set specific width/height for primary display
- **Download**: Search for "QRes.exe" utility

### NirCmd
- **Purpose**: System control and automation
- **Usage**: Audio control, system commands, monitor power
- **Download**: [NirSoft NirCmd](http://www.nirsoft.net/utils/nircmd.html)

## API Reference

### Endpoints

- `GET /api/actions` - Get all available script actions
- `GET /api/categories` - Get action categories
- `GET /api/devices` - Get detected devices (displays/audio)
- `GET /api/variable-options/:variableName` - Get options for specific variables
- `POST /api/export/bat` - Export project as BAT files
- `GET /api/export/json` - Export project as Sunshine JSON config
- `GET /api/tools/status` - Check external tool availability

### Project Structure

```javascript
{
  name: "Project Name",
  beforeScripts: [/* Actions for prep.do */],
  afterScripts: [/* Actions for prep.undo */],
  variables: {/* Custom project variables */}
}
```

## Technical Details

### Short Monitor ID System
The application uses hardware-based Short Monitor IDs (e.g., "AOC2401") instead of Windows display enumeration IDs. This provides:
- **Stability**: IDs persist across reboots and driver updates
- **Reliability**: Works with virtual displays and changing configurations
- **Compatibility**: Functions with remote desktop and streaming scenarios

### Export Formats

**BAT Files**: Direct Windows execution
```batch
@echo off
REM Generated by Sunshine Script Builder
if exist "L:\Path\To\Tools\MultiMonitorTool.exe" ("L:\Path\To\Tools\MultiMonitorTool.exe" /disable "AOC2401") else (echo Tool not found)
```

**JSON Configuration**: Sunshine integration
```json
{
  "name": "Project Name",
  "prep": {
    "do": "\"L:\\Path\\To\\Commands\\Project_before.bat\"",
    "undo": "\"L:\\Path\\To\\Commands\\Project_after.bat\""
  }
}
```

## Development

### Commands
- `npm start` - Start production server
- `npm run dev` - Start development server with auto-restart

### File Structure
```
├── server.js              # Main Express server
├── public/
│   ├── app.js             # Frontend JavaScript
│   ├── index.html         # Main interface
│   └── styles.css         # UI styling
├── Tools/                 # External utilities
├── Commands/              # Generated BAT files
└── CLAUDE.md             # Development guidance
```

## Troubleshooting

### Common Issues

**Scripts not working**:
- Verify tools are in the `Tools/` folder
- Check Windows path format in generated BAT files
- Ensure Short Monitor IDs are correctly detected

**Device detection fails**:
- Run PowerShell as administrator for device enumeration
- Check if external tools have required permissions
- Verify WSL/Windows path conversion

**Display control not working**:
- Confirm MultiMonitorTool.exe is available
- Use Short Monitor IDs instead of display names
- Test manual execution of generated BAT files

### Debug Mode
Enable detailed logging by checking the browser console and server output for diagnostic information.

## Contributing

1. Follow existing code conventions and patterns
2. Test with actual Sunshine streaming scenarios
3. Verify compatibility with various monitor configurations
4. Update documentation for any new features

## Acknowledgments

- **NirSoft** for MultiMonitorTool and NirCmd utilities
- **Sunshine** project for game streaming capabilities
- Community feedback for device detection improvements