# Highlight Filters VSCode Extension - Development Context

## Project Overview
A VSCode extension that adds filters with groups where each filter and group can be independently enabled/disabled. The extension sets foreground and background colors in the file view based on matched filters.

## Recent Work Completed

### 1. Fixed Color Application Issue
**Problem**: Foreground and background colors could not be altered in the filters.

**Solution**: 
- Added `hexToRgba()` function in `src/filterManager.ts` to convert 8-digit hex colors (#rrggbbaa) to RGBA format (rgba(r,g,b,a))
- VSCode's decoration API requires RGBA format, but colors were stored as hex
- Color pickers now work correctly with visible `<input type="color">` elements

### 2. Added Export/Import Functionality
**Features**:
- Export configuration to JSON file
- Import configuration from JSON file
- Uses VSCode's native file dialogs
- Async/await for file operations
- TextEncoder for cross-platform file writing

### 3. Improved UI Elements
**Button Styling**:
- Increased padding from 2px to 4px 6px
- Increased font size from 12px to 16px
- Added display: flex, align-items: center, justify-content: center
- Added active state styling with var(--vscode-toolbar-activeBackground)

**Current Icons**:
- Export button: ⬇ (Unicode downward arrow)
- Import button: ⬆ (Unicode upward arrow)

### 4. Other UI Improvements
- Filter text now shows selected colors using CSS custom properties
- Delete button has better contrast and visibility
- Group name editing works correctly (double-click to edit)
- Drag and drop filters between groups

## Completed Work - Codicons Integration

### VSCode Codicons Successfully Implemented:
1. ✅ Installed `@vscode/codicons` package
2. ✅ Replaced all Unicode symbols with proper Codicons for seamless VSCode experience
3. ✅ Updated code to load Codicon font with proper CSP and @font-face
4. ✅ Created helper function `renderCodicons()` to convert $(icon-name) syntax to codicon classes

### Codicons Used:
- **Export button**: `$(cloud-download)` - Cloud download icon
- **Import button**: `$(cloud-upload)` - Cloud upload icon  
- **Add Group button**: `$(add)` - Plus icon
- **Collapse All button**: `$(collapse-all)` - Collapse all icon
- **Expand All button**: `$(expand-all)` - Expand all icon
- **Group twistie**: `$(chevron-right)` - Chevron right (rotates 90° when expanded)
- **Add Filter button**: `$(add)` - Plus icon
- **Enable/Disable toggle**: `$(circle-filled)` / `$(circle-outline)` - Filled/outline circles
- **Delete Group button**: `$(trash)` - Trash icon
- **Regex toggle**: `$(regex)` - Regex icon
- **Delete Filter button**: `$(close)` - Close/X icon

## Key Files

### src/extension.ts
- Main extension file with FilterPanelProvider class
- Webview HTML generation and message handling
- Export/Import functionality
- Color picker integration

### src/filterManager.ts
- Handles applying highlights to documents
- Contains `hexToRgba()` conversion function
- Applies decorations based on enabled filters

### src/types.ts
- Type definitions for Filter and FilterGroup interfaces
- Filter includes: id, pattern, regex, foreground, background, enabled

### package.json
- Extension configuration
- Dependencies: @types/vscode, typescript
- Needs to add: @vscode/codicons (after certificate issue resolved)

## Technical Details

### Color Format Conversion
```typescript
function hexToRgba(hex: string): string {
  hex = hex.replace('#', '');
  let r, g, b, a;
  if (hex.length === 8) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
    a = parseInt(hex.substring(6, 8), 16) / 255;
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
    a = 1;
  } else {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
```

### Color Picker Integration
- Uses visible `<input type="color">` elements
- Converts 6-digit hex from picker to 8-digit hex with full opacity (ff)
- Updates filter colors in real-time
- CSS custom properties (--filter-foreground, --filter-background) apply colors to filter text

### Export/Import Implementation
```typescript
// Export
case 'exportConfig':
  const jsonString = JSON.stringify(groups, null, 2);
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('highlight-filters-config.json'),
    filters: { 'JSON': ['json'] }
  });
  if (uri) {
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(uri, encoder.encode(jsonString));
    vscode.window.showInformationMessage('Configuration exported successfully!');
  }
  break;

// Import
case 'importConfig':
  const uri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'JSON': ['json'] },
    openLabel: 'Import Configuration'
  });
  if (uri && uri[0]) {
    try {
      const fileContent = await vscode.workspace.fs.readFile(uri[0]);
      const importedGroups = JSON.parse(fileContent.toString()) as FilterGroup[];
      await config.update('groups', importedGroups, vscode.ConfigurationTarget.Global);
      this.updateWebview(importedGroups);
      if (vscode.window.activeTextEditor) {
        applyHighlights(vscode.window.activeTextEditor.document, importedGroups);
      }
      vscode.window.showInformationMessage('Configuration imported successfully!');
    } catch (error) {
      vscode.window.showErrorMessage('Failed to import configuration: ' + (error as Error).message);
    }
  }
  break;
```

## Known Issues

None currently. All features are working as expected with proper Codicons integration.

## Build Commands
- Compile TypeScript: `npx tsc -p .`
- Prepublish: `npm run vscode:prepublish`

## Testing
- Press F5 in VSCode to launch extension in debug mode
- Test color pickers by clicking on color squares
- Test export/import with JSON files
- Test filter enable/disable functionality
- Test drag and drop between groups

## Future Enhancements (Optional)
- Add keyboard shortcuts for common actions
- Add filter templates/presets
- Add search/filter functionality in the panel
- Add undo/redo for configuration changes
- Add filter statistics (match count, etc.)
