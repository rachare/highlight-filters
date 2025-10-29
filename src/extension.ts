import * as vscode from 'vscode';
import { applyHighlights, getFilterGroups } from './filterManager';
import { FilterGroup, Filter } from './types';

const originalDocumentContent = new Map<string, string>();

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('highlightFilters');
  let groups = config.get<FilterGroup[]>('groups');

  // If no groups exist, create a default one
  if (!groups || groups.length === 0) {
    const defaultGroups: FilterGroup[] = [
      {
        name: "Example Group",
        enabled: true,
        filters: [
          {
            id: 'id-' + Math.random().toString(36).substr(2, 9),
            pattern: "ERROR",
            regex: false,
            foreground: "#dcafafff",
            background: "#433c3cff",
            enabled: true,
            bold: false,
            italic: false,
            highlightWholeLine: false
          }
        ]
      }
    ];
    config.update('groups', defaultGroups, vscode.ConfigurationTarget.Global);
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'filterPanel',
      new FilterPanelProvider(context)
    )
  );

  // Register the command to toggle matched lines view
  context.subscriptions.push(vscode.commands.registerCommand('highlight-filters.toggleMatchedLinesView', async () => {
    const config = vscode.workspace.getConfiguration('highlightFilters');
    const matchedLinesViewEnabled = config.get<boolean>('matchedLinesViewEnabled') || false;
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor) {
      vscode.window.showInformationMessage('No active editor to apply filter to.');
      return;
    }

    const document = activeEditor.document;
    const docUri = document.uri.toString();

    if (!matchedLinesViewEnabled) {
      // Store original content
      originalDocumentContent.set(docUri, document.getText());

      // Get filters/groups
      const groups = getFilterGroups();
      let matchedLines: string[] = [];

      // Filter lines
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        let isMatched = false;

        for (const group of groups) {
          if (!group.enabled) continue;
          for (const filter of group.filters) {
            if (!filter.enabled) continue;
            const lineToSearch = filter.caseSensitive ? line : line.toLowerCase();
            const patternToSearch = filter.caseSensitive ? filter.pattern : filter.pattern.toLowerCase();

            const pattern = filter.regex ? new RegExp(patternToSearch) : patternToSearch;
            if ((filter.regex && (pattern as RegExp).test(lineToSearch)) || (!filter.regex && lineToSearch.includes(patternToSearch as string))) {
              isMatched = true;
              break;
            }
          }
          if (isMatched) break;
        }

        if (isMatched) {
          // Prefix with original line number (1-based)
          matchedLines.push(`${i + 1}: ${line}`);
        }
      }

      // Replace editor content with only matched lines
      await activeEditor.edit(editBuilder => {
        const wholeRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        editBuilder.replace(wholeRange, matchedLines.join('\n'));
      });

      await config.update('matchedLinesViewEnabled', true, vscode.ConfigurationTarget.Global);

      // Optionally apply styling decorations here if needed
      const groupsNew = config.get<FilterGroup[]>('groups') || [];
      applyHighlights(activeEditor.document, groupsNew);

    } else {
      // Restore original content if stored
      if (originalDocumentContent.has(docUri)) {
        await activeEditor.edit(editBuilder => {
          const wholeRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );
          editBuilder.replace(wholeRange, originalDocumentContent.get(docUri)!);
        });
        originalDocumentContent.delete(docUri);

        await config.update('matchedLinesViewEnabled', false, vscode.ConfigurationTarget.Global);

        // Optionally re-apply decorations
        const groupsOld = config.get<FilterGroup[]>('groups') || [];
        applyHighlights(activeEditor.document, groupsOld);
      } else {
        vscode.window.showInformationMessage('No original document content saved to restore.');
      }
    }
  }));

  // Apply highlights to the currently active editor when the extension activates
  if (vscode.window.activeTextEditor) {
    const initialConfig = vscode.workspace.getConfiguration('highlightFilters');
    const initialGroups = initialConfig.get<FilterGroup[]>('groups') || [];
    applyHighlights(vscode.window.activeTextEditor.document, initialGroups);
  }

  vscode.workspace.onDidOpenTextDocument(document => {
    const config = vscode.workspace.getConfiguration('highlightFilters');
    const groups = config.get<FilterGroup[]>('groups') || [];
    applyHighlights(document, groups);
  });

  vscode.workspace.onDidChangeTextDocument(event => {
    const config = vscode.workspace.getConfiguration('highlightFilters');
    const groups = config.get<FilterGroup[]>('groups') || [];
    applyHighlights(event.document, groups);
  });

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      const config = vscode.workspace.getConfiguration('highlightFilters');
      const groups = config.get<FilterGroup[]>('groups') || [];
      applyHighlights(editor.document, groups);
    }
  });
}

class FilterPanelProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      console.log('[Extension] Received message:', message.command, message.payload);
      const config = vscode.workspace.getConfiguration('highlightFilters');
      let groups = config.get<FilterGroup[]>('groups') || [];

      switch (message.command) {
        case 'webviewReady':
          {
            if (!groups || groups.length === 0) {
              const config = vscode.workspace.getConfiguration('highlightFilters');
              groups = config.get<FilterGroup[]>('groups') || [];
            }
            this.updateWebview(groups);
          }
          break;
        case 'updateFilter':
          {
            const { id, field, value } = message.payload;
            groups.forEach(group => {
              group.filters.forEach(filter => {
                if (filter.id === id) {
                  console.log('Updated: ', id, field, value);
                  filter[field] = value;
                }
              });
            });
            config.update('groups', groups, vscode.ConfigurationTarget.Global);
            this.updateWebview(groups);
            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, groups);
            }
          }
          break;
        case 'updateGroup':
          {
            const { name, enabled } = message.payload;
            groups.forEach(group => {
              if (group.name === name) {
                group.enabled = enabled;
              }
            });
            config.update('groups', groups, vscode.ConfigurationTarget.Global).then(() => {
                this.updateWebview(groups);
                if (vscode.window.activeTextEditor) {
                    applyHighlights(vscode.window.activeTextEditor.document, groups);
                }
            });
          }
          break;
        case 'updateGroupName':
          {
            const { oldName, newName } = message.payload;
            groups.forEach(group => {
              if (group.name === oldName) {
                group.name = newName;
              }
            });
            config.update('groups', groups, vscode.ConfigurationTarget.Global);
            this.updateWebview(groups);
          }
          break;
        case 'addFilter':
          {
            const { groupName } = message.payload;
            groups.forEach(group => {
              if (group.name === groupName) {
                group.filters.push({
                  id: 'id-' + Math.random().toString(36).substr(2, 9),
                  pattern: "New Filter",
                  regex: false,
                  foreground: "#663232ff",
                  background: "#d35b5bff",
                  enabled: true,
                  bold: false,
                  italic: false,
                  highlightWholeLine: true
                });
              }
            });
            config.update('groups', groups, vscode.ConfigurationTarget.Global);
            this.updateWebview(groups);
            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, groups);
            }
          }
          break;
        case 'addGroup':
          {
            const newGroup: FilterGroup = {
              name: `Group ${groups.length + 1}`,
              enabled: true,
              filters: []
            };
            groups.push(newGroup);
            config.update('groups', groups, vscode.ConfigurationTarget.Global);
            this.updateWebview(groups);
          }
          break;
        case 'deleteGroup':
          {
            const { groupName } = message.payload;
            vscode.window.showInformationMessage(`Delete group "${groupName}" and all its filters?`, { modal: true }, "Delete")
              .then(selection => {
                if (selection === "Delete") {
                  let currentGroups = config.get<FilterGroup[]>('groups') || [];
                  currentGroups = currentGroups.filter(group => group.name !== groupName);
                  config.update('groups', currentGroups, vscode.ConfigurationTarget.Global).then(() => {
                    this.updateWebview(currentGroups);
                    if (vscode.window.activeTextEditor) {
                      applyHighlights(vscode.window.activeTextEditor.document, currentGroups);
                    }
                  });
                }
              });
          }
          break;
        case 'toggleFField':
          {
            const { filterId, field } = message.payload;
            groups.forEach(group => {
              group.filters.forEach(filter => {
                if (filter.id === filterId) {
                  filter[field] = !filter[field];
                }
              });
            });
            config.update('groups', groups, vscode.ConfigurationTarget.Global);
            this.updateWebview(groups);
            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, groups);
            }
          }
          break;
        case 'deleteFilter':
          {
            const { filterId } = message.payload;
            groups.forEach(group => {
              group.filters = group.filters.filter(filter => filter.id !== filterId);
            });
            config.update('groups', groups, vscode.ConfigurationTarget.Global);
            this.updateWebview(groups);
            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, groups);
            }
          }
          break;
        case 'moveFilter':
          {
            const { filterId, targetGroupName } = message.payload;
            let filterToMove = null;
            
            groups.forEach(group => {
              const filterIndex = group.filters.findIndex(filter => filter.id === filterId);
              if (filterIndex !== -1) {
                filterToMove = group.filters.splice(filterIndex, 1)[0];
              }
            });
            
            if (filterToMove) {
              groups.forEach(group => {
                if (group.name === targetGroupName) {
                  group.filters.push(filterToMove as any);
                }
              });
            }
            
            config.update('groups', groups, vscode.ConfigurationTarget.Global);
            this.updateWebview(groups);
            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, groups);
            }
          }
          break;
        case 'refreshView':
          {
            const latestGroups = vscode.workspace.getConfiguration('highlightFilters').get<FilterGroup[]>('groups') || [];
            this.updateWebview(latestGroups);
          }
          break;
        case 'exportConfig':
          {
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
          }
          break;
        case 'importConfig':
          {
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
          }
          break;
      }
    });

    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('highlightFilters.groups')) {
            const config = vscode.workspace.getConfiguration('highlightFilters');
            const groups = config.get<FilterGroup[]>('groups') || [];
            this.updateWebview(groups);
        }
    });
  }

  updateWebview(groups: FilterGroup[]) {
    this._view?.webview.postMessage({ command: 'update', groups });
  }

  private getHtml(): string {
    const nonce = getNonce();
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._view!.webview.cspSource} 'nonce-${nonce}' 'unsafe-inline'; font-src ${this._view!.webview.cspSource}; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="${this._view!.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'))}">
        <style nonce="${nonce}">
          
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            margin: 0;
            padding: 8px;
          }
          
          .search-container {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            margin-bottom: 8px;
          }
          
          .search-header {
            display: flex;
            align-items: center;
            padding: 4px 8px; /* Increased padding */
            border-bottom: 1px solid var(--vscode-input-border);
            background: var(--vscode-inputOption-activeBackground);
          }
          
          .search-title {
            font-size: 13px; /* Increased font size */
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-inputOption-activeForeground);
            letter-spacing: 0.5px;
            flex: 1;
          }
          
          .search-actions {
            display: flex;
            gap: 4px; /* Increased gap */
          }
          
          .search-btn {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 3px;
            font-family: 'codicon';
            font-size: 16px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .search-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
          }
          
          .search-btn:active {
            background: var(--vscode-toolbar-activeBackground);
          }
          
          .filter-group {
            margin-bottom: 1px;
          }
          
          .filter-input-row {
            display: flex;
            flex-direction: row;
            align-items: center;
            padding: 4px 8px; /* Increased padding */
            border-bottom: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            gap: 4px; /* Increased gap */
          }
          
          .filter-input-row:last-child {
            border-bottom: none;
          }
          
          .filter-input-row:hover {
            background: var(--vscode-list-hoverBackground);
          }
          
          .filter-color-input {
            width: 20px;
            height: 20px;
            border-radius: 4px; /* Increased border radius */
            cursor: pointer;
            border: 1px solid var(--vscode-input-border);
            flex-shrink: 0;
            padding: 0;
            background: none;
          }
          
          .filter-color-input::-webkit-color-swatch-wrapper {
            padding: 0;
          }
          
          .filter-color-input::-webkit-color-swatch {
            border: none;
            border-radius: 1px;
          }
          
          .filter-input {
            flex: 1;
            min-width: 0;
            background: var(--filter-background);
            border: none;
            outline: none;
            color: var(--filter-foreground);
            font-size: 13px;
            padding: 4px 4px; /* Increased padding */
            border-radius: 4px; /* Increased border radius */
          }
          
          .filter-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
          }
          
          .filter-controls {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 4px; /* Increased gap */
            flex-shrink: 0;
          }
          
          .filter-toggle {
            background: none;
            border: 1px solid var(--vscode-button-border);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            padding: 4px 6px; /* Increased padding */
            border-radius: 4px; /* Increased border radius */
            font-size: 11px;
            line-height: 1;
            min-width: 24px;
            flex-shrink: 0;
            white-space: nowrap;
          }
          
          .filter-toggle.active {
            background: var(--vscode-button-background);
            border-color: var(--vscode-button-background);
          }
          
          .filter-toggle:hover {
            background: var(--vscode-button-hoverBackground);
          }
          
          .filter-delete {
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-button-border);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            padding: 4px 4px; /* Increased padding */
            border-radius: 4px; /* Increased border radius */
            font-size: 14px;
            font-weight: bold;
            line-height: 1;
            /* Removed opacity and transition */
            flex-shrink: 0;
          }
          
          .filter-input-row:hover .filter-delete {
            /* Removed opacity override */
          }
          
          .group-header {
            display: flex;
            align-items: center;
            padding: 4px 8px; /* Increased padding */
            background: var(--vscode-inputOption-activeBackground);
            border-bottom: 1px solid var(--vscode-input-border);
            cursor: pointer;
          }
          
          .group-name {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: var(--vscode-inputOption-activeForeground);
            font-size: 14px; /* Increased font size */
            font-weight: 600;
            padding: 0;
            margin: 0;
          }
          
          .group-name:focus {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-focusBorder);
            padding: 1px 3px;
            margin: -1px -3px;
            border-radius: 4px; /* Increased border radius */
          }
          
          .group-controls {
            display: flex;
            gap: 4px; /* Increased gap */
            opacity: 1;
          }
          
          .add-filter-row {
            display: flex;
            align-items: center;
            padding: 4px 8px; /* Increased padding */
            background: var(--vscode-input-background);
            border-top: 1px solid var(--vscode-input-border);
            cursor: pointer;
          }
          
          .add-filter-row:hover {
            background: var(--vscode-list-hoverBackground);
          }
          
          .add-filter-text {
            color: var(--vscode-input-placeholderForeground);
            font-size: 14px; /* Increased font size */
            font-style: italic;
          }
          
          .results-info {
            padding: 4px 8px; /* Increased padding */
            font-size: 12px; /* Increased font size */
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-badge-background);
            border-radius: 4px; /* Increased border radius */
            margin-top: 8px; /* Increased margin-top */
          }
          
          .hidden-color-input {
            position: absolute;
            width: 0;
            height: 0;
            opacity: 0;
            overflow: hidden;
          }
          
          .group-content {
            padding-left: 8px;
            display: none;
          }
          
          .group-content.expanded {
            display: block;
          }
          
          .group-twistie {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 4px; /* Increased margin-right */
            font-family: 'codicon';
            font-size: 16px;
            transition: transform 0.1s ease;
          }
          
          .group-twistie.expanded {
            transform: rotate(90deg);
          }
          
          .codicon {
            font-family: 'codicon';
          }
        </style>
      </head>
      <body>
        <div class="search-container">
          <div class="search-header">
            <div class="search-title">Highlight Filters</div>
            <div class="search-actions" id="search-actions">
              <button class="search-btn" id="export-btn" title="Export Configuration"></button>
              <button class="search-btn" id="import-btn" title="Import Configuration"></button>
              <button class="search-btn" id="add-group-btn" title="Add Group"></button>
              <button class="search-btn" id="collapse-all-btn" title="Collapse All"></button>
              <button class="search-btn" id="expand-all-btn" title="Expand All"></button>
            </div>
          </div>
          <div id="groups-container"></div>
        </div>
        
        <div class="results-info" id="results-info">
          No active filters
        </div>
        
        <input type="color" id="hidden-color-input" class="hidden-color-input">
        
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const groupsContainer = document.getElementById('groups-container');
          const resultsInfo = document.getElementById('results-info');
          const hiddenColorInput = document.getElementById('hidden-color-input');
          let currentColorTarget = null;
          let expandedGroups = new Set();
          
          // Helper function to convert $(icon-name) syntax to codicon class
          // This function is no longer used for direct element content, but can be useful for debugging or future changes.
          function renderCodicons(html) {
            return html.replace(/\$\(([a-z-]+)\)/g, '<span class="codicon codicon-$1"></span>');
          }

          function render(groups) {
            groupsContainer.innerHTML = '';
            
            if (groups.length === 0) {
              groupsContainer.innerHTML = '<div class="add-filter-row add-group-prompt"><div class="add-filter-text">Click to add your first filter group</div></div>';
              resultsInfo.textContent = 'No active filters';
              return;
            }
            
            let totalFilters = 0;
            let activeFilters = 0;
            
            groups.forEach(group => {
              const groupDiv = document.createElement('div');
              groupDiv.className = 'filter-group';
              groupDiv.dataset.groupName = group.name;
              
              const groupHeader = document.createElement('div');
              groupHeader.className = 'group-header';
              groupHeader.innerHTML = \`
                <span class="group-twistie codicon codicon-chevron-right \${expandedGroups.has(group.name) ? 'expanded' : ''}"></span>
                <input type="text" class="group-name" value="\${group.name}" readonly />
                <div class="group-controls">
                  <button class="search-btn add-filter codicon codicon-add" data-group-name="\${group.name}" title="Add Filter"></button>
                  <button class="filter-toggle toggle-group \${group.enabled ? 'active' : ''} codicon \${group.enabled ? 'codicon-eye' : 'codicon-eye-closed'}" data-group-name="\${group.name}" title="\${group.enabled ? 'Disable' : 'Enable'} Group"></button>
                  <button class="filter-delete delete-group codicon codicon-trash" data-group-name="\${group.name}" title="Delete Group"></button>
                </div>
              \`;
              groupDiv.appendChild(groupHeader);
              
              const groupContent = document.createElement('div');
              groupContent.className = \`group-content \${expandedGroups.has(group.name) ? 'expanded' : ''}\`;

              group.filters.forEach(filter => {
                totalFilters++;
                if (filter.enabled && group.enabled) activeFilters++;
                
                const filterRow = document.createElement('div');
                filterRow.className = 'filter-input-row';
                filterRow.dataset.filterId = filter.id;
                filterRow.draggable = true;
                filterRow.style.setProperty('--filter-foreground', filter.foreground);
                filterRow.style.setProperty('--filter-background', filter.background);

                filterRow.innerHTML = \`
                  <input type="color" class="filter-color-input" 
                         data-filter-id="\${filter.id}"
                         data-color-type="foreground"
                         value="\${filter.foreground && filter.foreground.length >= 7 ? filter.foreground.substring(0, 7) : '#000000'}"
                         title="Foreground Color" />
                  <button class="color-clear-btn fg-clear-btn codicon codicon-close" data-filter-id="\${filter.id}" data-color-type="foreground" title="Clear Foreground"></button>
                  <input type="color" class="filter-color-input" 
                         data-filter-id="\${filter.id}"
                         data-color-type="background"
                         value="\${filter.background && filter.background.length >= 7 ? filter.background.substring(0, 7) : '#ffffff'}"
                         title="Background Color" />
                  <button class="color-clear-btn bg-clear-btn codicon codicon-close" data-filter-id="\${filter.id}" data-color-type="background" title="Clear Background"></button>
                  <input type="text" class="filter-input" data-filter-id="\${filter.id}" value="\${filter.pattern}" placeholder="Enter filter pattern..." />
                  <div class="filter-controls">
                    <button class="filter-toggle toggle-bold \${filter.bold ? 'active' : ''} codicon codicon-bold" data-filter-id="\${filter.id}" title="Bold"></button>
                    <button class="filter-toggle toggle-italic \${filter.italic ? 'active' : ''} codicon codicon-italic" data-filter-id="\${filter.id}" title="Italic"></button>
                    <button class="filter-toggle toggle-wholeline \${filter.highlightWholeLine ? 'active' : ''} codicon codicon-list-selection" data-filter-id="\${filter.id}" title="Highlight Whole Line"></button>
                    <button class="filter-toggle toggle-case-sensitive \${filter.caseSensitive ? 'active' : ''} codicon codicon-case-sensitive" data-filter-id="\${filter.id}" title="Toggle Case Sensitivity"></button>
                    <button class="filter-toggle toggle-regex \${filter.regex ? 'active' : ''} codicon codicon-regex" data-filter-id="\${filter.id}" title="Toggle Regex"></button>
                    <button class="filter-toggle toggle-filter \${filter.enabled ? 'active' : ''} codicon \${filter.enabled ? 'codicon-circle-filled' : 'codicon-circle-outline'}" data-filter-id="\${filter.id}" title="\${filter.enabled ? 'Disable' : 'Enable'}"></button>
                    <button class="filter-delete delete-filter codicon codicon-close" data-filter-id="\${filter.id}" title="Delete Filter"></button>
                  </div>
                \`;
                
                groupContent.appendChild(filterRow);
              });
              
              const addFilterRow = document.createElement('div');
              addFilterRow.className = 'add-filter-row add-filter';
              addFilterRow.dataset.groupName = group.name;
              addFilterRow.innerHTML = '<div class="add-filter-text">Add filter pattern...</div>';
              groupContent.appendChild(addFilterRow);
              
              groupDiv.appendChild(groupContent);
              groupsContainer.appendChild(groupDiv);
            });
            
            resultsInfo.textContent = \`\${activeFilters} of \${totalFilters} filters active\`;
          }

          function initialize() {
            // Initialize header button icons (swap upload/download for export/import)
            document.getElementById('export-btn').classList.add('codicon', 'codicon-cloud-upload');
            document.getElementById('import-btn').classList.add('codicon', 'codicon-cloud-download');
            document.getElementById('add-group-btn').classList.add('codicon', 'codicon-add');
            document.getElementById('collapse-all-btn').classList.add('codicon', 'codicon-collapse-all');
            document.getElementById('expand-all-btn').classList.add('codicon', 'codicon-expand-all');
            
            groupsContainer.addEventListener('click', e => {
                const target = e.target;
                const groupHeader = target.closest('.group-header');
                console.log(target);
                console.log('Hello');
                if (groupHeader && (target.closest('.group-twistie'))) {
                    const groupName = groupHeader.closest('.filter-group').dataset.groupName;
                    if (expandedGroups.has(groupName)) {
                        expandedGroups.delete(groupName);
                    } else {
                        expandedGroups.add(groupName);
                    }
                    vscode.postMessage({ command: 'refreshView' });
                    console.log('Debug info: DEAD ');
                    console.log(target);
                    return;
                }

                const actionTarget = target.closest('.add-filter, .toggle-group, .delete-group, .filter-color-indicator, .color-clear-btn, .toggle-bold, .toggle-italic, .toggle-case-sensitive, .toggle-wholeline, .toggle-regex, .toggle-filter, .delete-filter, .add-group-prompt');
                if (!actionTarget) return;

                if (actionTarget.matches('.add-group-prompt')) {
                    vscode.postMessage({ command: 'addGroup' });
                }
                if (actionTarget.matches('.add-filter')) {
                    vscode.postMessage({ command: 'addFilter', payload: { groupName: actionTarget.dataset.groupName } });
                }
                if (actionTarget.matches('.toggle-group')) {
                    const isEnabled = !actionTarget.classList.contains('active');
                    vscode.postMessage({ command: 'updateGroup', payload: { name: actionTarget.dataset.groupName, enabled: isEnabled } });
                }
                if (actionTarget.matches('.delete-group')) {
                    vscode.postMessage({ command: 'deleteGroup', payload: { groupName: actionTarget.dataset.groupName } });
                }
                if (actionTarget.matches('.filter-color-indicator')) {
                    currentColorTarget = { filterId: actionTarget.dataset.filterId, colorType: actionTarget.dataset.colorType };
                    // Get the current color value and set it in the color picker
                    const filterRow = actionTarget.closest('.filter-input-row');
                    const currentColor = filterRow.style.getPropertyValue(\`--filter-\${currentColorTarget.colorType}\`);
                    // Convert 8-digit hex to 6-digit hex for the color picker
                    hiddenColorInput.value = currentColor.substring(0, 7);
                    hiddenColorInput.click();
                }
                if (actionTarget.matches('.color-clear-btn')) {
                    const filterId = actionTarget.dataset.filterId;
                    const colorType = actionTarget.dataset.colorType; // 'foreground' or 'background'
                    vscode.postMessage({
                        command: 'updateFilter',
                        payload: { id: filterId, field: colorType, value: '' }
                    });
                }
                if (actionTarget.matches('.toggle-bold')) {
                    vscode.postMessage({ command: 'toggleFField', payload: { filterId: actionTarget.dataset.filterId, field: 'bold' } });
                }
                if (actionTarget.matches('.toggle-italic')) {
                    vscode.postMessage({ command: 'toggleFField', payload: { filterId: actionTarget.dataset.filterId, field: 'italic' } });
                }
                if (actionTarget.matches('.toggle-wholeline')) {
                    vscode.postMessage({ command: 'toggleFField', payload: { filterId: actionTarget.dataset.filterId, field: 'highlightWholeLine'} });
                }
                if (actionTarget.matches('.toggle-case-sensitive')) {
                    vscode.postMessage({ command: 'toggleFField', payload: { filterId: actionTarget.dataset.filterId, field: 'caseSensitive' } });
                }
                if (actionTarget.matches('.toggle-regex')) {
                    vscode.postMessage({ command: 'toggleFField', payload: { filterId: actionTarget.dataset.filterId, field: 'regex' } });
                }
                if (actionTarget.matches('.toggle-filter')) {
                    // const isEnabled = !actionTarget.classList.contains('active');
                    vscode.postMessage({ command: 'toggleFField', payload: { filterId: actionTarget.dataset.filterId, field: 'enabled' } });
                }
                if (actionTarget.matches('.delete-filter')) {
                    vscode.postMessage({ command: 'deleteFilter', payload: { filterId: actionTarget.dataset.filterId } });
                }
            });

            groupsContainer.addEventListener('change', e => {
              if (e.target.matches('.filter-input')) {
                const filterId = e.target.dataset.filterId;
                vscode.postMessage({ command: 'updateFilter', payload: { id: filterId, field: 'pattern', value: e.target.value } });
              }
              if (e.target.matches('.filter-color-input')) {
                const filterId = e.target.dataset.filterId;
                const colorType = e.target.dataset.colorType;
                let colorValue = e.target.value;
                // Convert 6-digit hex to 8-digit hex with full opacity
                if (colorValue.length === 7) {
                  colorValue = colorValue + 'ff';
                }
                vscode.postMessage({ command: 'updateFilter', payload: { id: filterId, field: colorType, value: colorValue } });
              }
            });

            groupsContainer.addEventListener('dblclick', e => {
              if (e.target.matches('.group-name')) {
                e.target.readOnly = false;
                e.target.select();
              }
            });

            groupsContainer.addEventListener('blur', e => {
              if (e.target.matches('.group-name')) {
                e.target.readOnly = true;
                const oldName = e.target.closest('.filter-group').dataset.groupName;
                const newName = e.target.value.trim();
                if (newName && newName !== oldName) {
                    vscode.postMessage({ command: 'updateGroupName', payload: { oldName, newName } });
                }
              }
            }, true);

            groupsContainer.addEventListener('keydown', e => {
              if (e.target.matches('.group-name')) {
                if (e.key === 'Enter') e.target.blur();
                if (e.key === 'Escape') {
                  e.target.value = e.target.closest('.filter-group').dataset.groupName;
                  e.target.blur();
                }
              }
            });

            let draggedElement = null;
            groupsContainer.addEventListener('dragstart', e => {
              const target = e.target.closest('.filter-input-row');
              if (target) {
                draggedElement = target;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', target.dataset.filterId);
                target.style.opacity = '0.5';
              }
            });

            groupsContainer.addEventListener('dragend', e => {
              if (draggedElement) {
                draggedElement.style.opacity = '';
                draggedElement = null;
              }
            });

            groupsContainer.addEventListener('dragover', e => {
                e.preventDefault();
                const targetGroup = e.target.closest('.filter-group');
                if (targetGroup) {
                    targetGroup.style.background = 'var(--vscode-list-dropBackground)';
                    e.dataTransfer.dropEffect = 'move';
                }
            });

            groupsContainer.addEventListener('dragleave', e => {
                const targetGroup = e.target.closest('.filter-group');
                if (targetGroup) {
                    targetGroup.style.backgroundColor = '';
                }
            });
            
            groupsContainer.addEventListener('drop', e => {
              e.preventDefault();
              const targetGroup = e.target.closest('.filter-group');
              if (targetGroup) {
                targetGroup.style.backgroundColor = '';
                if (draggedElement) {
                  const filterId = draggedElement.dataset.filterId;
                  const targetGroupName = targetGroup.dataset.groupName;
                  const sourceGroupName = draggedElement.closest('.filter-group').dataset.groupName;

                  if (targetGroupName !== sourceGroupName) {
                    vscode.postMessage({ command: 'moveFilter', payload: { filterId, targetGroupName } });
                  }
                }
              }
            });

            document.getElementById('add-group-btn').addEventListener('click', () => {
              vscode.postMessage({ command: 'addGroup' });
            });
          
            document.getElementById('expand-all-btn').addEventListener('click', () => {
              document.querySelectorAll('.filter-group').forEach(group => {
                expandedGroups.add(group.dataset.groupName);
              });
              vscode.postMessage({ command: 'refreshView' });
            });
            
            document.getElementById('collapse-all-btn').addEventListener('click', () => {
              expandedGroups.clear();
              vscode.postMessage({ command: 'refreshView' });
            });
            
            document.getElementById('export-btn').addEventListener('click', () => {
              vscode.postMessage({ command: 'exportConfig' });
            });
            
            document.getElementById('import-btn').addEventListener('click', () => {
              vscode.postMessage({ command: 'importConfig' });
            });
            
            hiddenColorInput.addEventListener('change', e => {
              if (currentColorTarget) {
                // Convert 6-digit hex to 8-digit hex with full opacity
                let colorValue = e.target.value;
                if (colorValue.length === 7) {
                  colorValue = colorValue + 'ff';
                }
                vscode.postMessage({ 
                  command: 'updateFilter', 
                  payload: { 
                    id: currentColorTarget.filterId, 
                    field: currentColorTarget.colorType, 
                    value: colorValue 
                  } 
                });
                currentColorTarget = null;
              }
            });

            window.addEventListener('message', event => {
              const message = event.data;
              if (message.command === 'update') {
                render(message.groups);
                groups = message.groups; // sync local memory with remote config model!
              }
            });
            
            vscode.postMessage({ command: 'webviewReady' });
          }

          initialize();
        </script>
      </body>
      </html>
    `;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function deactivate() {}
