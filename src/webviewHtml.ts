import * as vscode from 'vscode';

export function getHtml(
  view: vscode.WebviewView,
  extensionUri: vscode.Uri
): string {
  const nonce = getNonce();
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource} 'nonce-${nonce}' 'unsafe-inline'; font-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${view.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'))}">
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
          padding: 2px 6px;
          border-bottom: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          gap: 3px;
        }
        
        .filter-input-row:last-child {
          border-bottom: none;
        }
        
        .filter-input-row:hover {
          background: var(--vscode-list-hoverBackground);
        }
        
        .filter-color-input {
          width: 16px;
          height: 16px;
          border-radius: 100%;
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
        
        .color-clear-btn {
          width: 14px;
          height: 14px;
          padding: 0;
          background: none;
          border: none;
          color: var(--vscode-icon-foreground);
          cursor: pointer;
          font-size: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.6;
          flex-shrink: 0;
        }
        
        .color-clear-btn:hover {
          opacity: 1;
          background: var(--vscode-toolbar-hoverBackground);
          border-radius: 2px;
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
          gap: 2px;
          flex-shrink: 0;
        }
        
        .filter-toggle {
          background: none;
          border: 1px solid var(--vscode-button-border);
          color: var(--vscode-button-foreground);
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 2px;
          font-size: 11px;
          line-height: 1;
          min-width: 20px;
          height: 20px;
          flex-shrink: 0;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .filter-toggle.active {
          background: var(--vscode-button-background);
          border-color: var(--vscode-button-background);
        }
        
        .filter-toggle:hover {
          background: var(--vscode-button-hoverBackground);
        }
        
        .range-selector {
          margin-left: 4px;
          padding: 3px 6px;
          border-radius: 3px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-dropdown-background);
          color: var(--vscode-dropdown-foreground);
          font-size: 12px;
          cursor: pointer;
          outline: none;
        }
        
        .range-selector:hover {
          background: var(--vscode-dropdown-listBackground);
        }
        
        .range-selector:focus {
          border-color: var(--vscode-focusBorder);
        }
        
        .range-input {
          margin-left: 4px;
          padding: 3px 6px;
          border-radius: 3px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          font-size: 12px;
          outline: none;
        }
        
        .range-input:focus {
          border-color: var(--vscode-focusBorder);
        }
        
        .range-input::placeholder {
          color: var(--vscode-input-placeholderForeground);
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
          <select id="range-selector" class="range-selector"></select>
          <input type="number" id="range-start" class="range-input" placeholder="Start" style="width: 20px;" />
          <input type="number" id="range-end" class="range-input" placeholder="End" style="width: 20px;" />
          <button class="search-btn codicon codicon-save" id="save-range-btn" title="Save Range"></button>
          <button class="search-btn codicon codicon-close" id="delete-range-btn" title="Delete Selected Range"></button>
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
        // Globals used by webview for ranges and active range tracking
        let groups = [];
        let ranges = [];
        let activeRangeId = 'default';
        let matchCounts = {};
        
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
          
          if (expandedGroups.size === 0) { groups.forEach(g => expandedGroups.add(g.name)); }
          
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

              const matchCount = matchCounts[filter.id] || 0;
              const matchCountDisplay = matchCount > 0 ? \`(\${matchCount})\` : '';
              
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
                <span style="color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: 4px; white-space: nowrap;">\${matchCountDisplay}</span>
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
          
          // Add range selector population
          function updateRangeSelector(ranges, activeRangeId) {
            const selector = document.getElementById('range-selector');
            selector.innerHTML = '';
            
            // Add default range option
            const defaultOption = document.createElement('option');
            defaultOption.value = 'default';
            defaultOption.textContent = 'Default Range (0 to end)';
            defaultOption.selected = activeRangeId === 'default';
            selector.appendChild(defaultOption);
            
            // Add custom ranges
            ranges.forEach(range => {
              const option = document.createElement('option');
              option.value = range.id;
              option.textContent = \`\${range.name} (\${range.start} to \${range.end >= 0 ? range.end : 'end'})\`;
              option.selected = activeRangeId === range.id;
              selector.appendChild(option);
            });

            // Reflect active range into inputs
            const startEl = document.getElementById('range-start');
            const endEl = document.getElementById('range-end');
            const active = activeRangeId === 'default' ? { start: 0, end: -1 } : ranges.find(r => r.id === activeRangeId);
            if (startEl) startEl.value = String(active ? active.start : 0);
            if (endEl) endEl.value = String(active ? active.end : -1);
          }
          
          const rangeSelector = document.getElementById('range-selector');
          if (rangeSelector) {
            rangeSelector.addEventListener('change', e => {
              vscode.postMessage({ 
                command: 'updateActiveRange', 
                payload: { activeRangeId: e.target.value } 
              });
            });
          }

          const saveRangeBtn = document.getElementById('save-range-btn');
          if (saveRangeBtn) {
            saveRangeBtn.addEventListener('click', () => {
            const startEl = document.getElementById('range-start');
            const endEl = document.getElementById('range-end');
              const start = startEl ? parseInt(startEl.value || '0', 10) : 0;
              const end = endEl ? parseInt(endEl.value || '-1', 10) : -1;

              // Validate inputs: end == -1 (EOF) or end >= start
              if (Number.isNaN(start) || Number.isNaN(end)) {
                return;
              }
              if (end !== -1 && end < start) {
                return;
              }

              vscode.postMessage({
                command: 'addRange',
                payload: { start, end }
              });
            });
          }

          const deleteRangeBtn = document.getElementById('delete-range-btn');
          if (deleteRangeBtn) {
            deleteRangeBtn.addEventListener('click', () => {
              const selector = document.getElementById('range-selector');
              const selectedId = selector ? selector.value : 'default';
              vscode.postMessage({ command: 'deleteRange', payload: { rangeId: selectedId } });
            });
          }
          
          groupsContainer.addEventListener('click', e => {
              const target = e.target;
              const groupHeader = target.closest('.group-header');
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

              const actionTarget = target.closest('.add-filter, .toggle-group, .delete-group, .filter-color-input, .color-clear-btn, .toggle-bold, .toggle-italic, .toggle-case-sensitive, .toggle-wholeline, .toggle-regex, .toggle-filter, .delete-filter, .add-group-prompt');
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
              if (actionTarget.matches('.filter-color-input')) {
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

          const addGroupBtn = document.getElementById('add-group-btn');
          if (addGroupBtn) {
            addGroupBtn.addEventListener('click', () => {
              vscode.postMessage({ command: 'addGroup' });
            });
          }
        
          const expandAllBtn = document.getElementById('expand-all-btn');
          if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => {
              document.querySelectorAll('.filter-group').forEach(group => {
                expandedGroups.add(group.dataset.groupName);
              });
              vscode.postMessage({ command: 'refreshView' });
            });
          }
          
          const collapseAllBtn = document.getElementById('collapse-all-btn');
          if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => {
              expandedGroups.clear();
              vscode.postMessage({ command: 'refreshView' });
            });
          }
          
          const exportBtn = document.getElementById('export-btn');
          if (exportBtn) {
            exportBtn.addEventListener('click', () => {
              vscode.postMessage({ command: 'exportConfig' });
            });
          }
          
          const importBtn = document.getElementById('import-btn');
          if (importBtn) {
            importBtn.addEventListener('click', () => {
              vscode.postMessage({ command: 'importConfig' });
            });
          }
          
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

          // Initialize range selector
          updateRangeSelector([], 'default');
          
          window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'update') {
              groups = message.groups;
              ranges = message.ranges;
              activeRangeId = message.activeRangeId;
              matchCounts = message.matchCounts || {};
              render(groups); // Call render after assigning global groups
              updateRangeSelector(ranges, activeRangeId);
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

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
