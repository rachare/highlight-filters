import * as vscode from 'vscode';
import { applyHighlights, getFilterGroups, getMatchCounts, precompileFilters } from './filterManager';
import { HighlightFilteredDocumentProvider } from './filteredDocumentProvider';
import { FilterGroup, Filter } from './types';
import { getHtml } from './webviewHtml';

// Use WeakMap to avoid memory leaks when documents close
const originalDocumentContent = new WeakMap<vscode.TextDocument, string>();

// Cache configuration to avoid repeated fetches
let cachedGroups: FilterGroup[] = [];
let cachedRanges: { id: string, name: string, start: number, end: number }[] = [];
let cachedActiveRangeId: string = 'default';

// Debounce timers
let highlightDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let webviewUpdateTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
  const lastViewedLine = new Map<string, number>();
  // Initialize cached config
  updateCachedConfig();

  // If no groups exist, create a default one
  if (cachedGroups.length === 0) {
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
    vscode.workspace.getConfiguration('highlightFilters').update('groups', defaultGroups, vscode.ConfigurationTarget.Global);
    cachedGroups = defaultGroups;
  }

  // Precompile regex patterns
  precompileFilters(cachedGroups);

  const filteredProvider = new HighlightFilteredDocumentProvider(context);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(HighlightFilteredDocumentProvider.scheme, filteredProvider)
  );

  const matchedViewActive = new Map<string, boolean>();

  const filterPanelProvider = new FilterPanelProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'filterPanel',
      filterPanelProvider
    )
  );

  // Register the command to toggle matched lines view
  context.subscriptions.push(vscode.commands.registerCommand('highlight-filters.toggleMatchedLinesView', async () => {
    const activeEditor = vscode.window.activeTextEditor;
    const activeUri = activeEditor?.document.uri;
    const isFilteredDoc = activeUri?.scheme === HighlightFilteredDocumentProvider.scheme;
    const originalUri = isFilteredDoc ? vscode.Uri.parse(activeUri!.query) : activeUri!;
    const originalUriStr = originalUri.toString();
    const matchedLinesViewEnabled = matchedViewActive.get(originalUriStr) === true;

    if (!activeEditor) {
      vscode.window.showInformationMessage('No active editor to apply filter to.');
      return;
    }
    // If in filtered view, capture the current line
    if (matchedLinesViewEnabled) {
      const line = activeEditor.selection.active.line;
      const lineText = activeEditor.document.lineAt(line).text;
      const match = lineText.match(/^(\d+):/);
      if (match) {
        lastViewedLine.set(originalUriStr, parseInt(match[1], 10) - 1);
      }
    }

    const document = activeEditor.document;

    if (!matchedLinesViewEnabled) {
      const cursorLine = activeEditor.selection.active.line;
      lastViewedLine.set(originalUriStr, cursorLine);
      // Store original content if not already stored
      if (!originalDocumentContent.has(document)) {
        originalDocumentContent.set(document, document.getText());
      }

      // Build matched lines within active range and groups
      const activeRange = cachedRanges.find(r => r.id === cachedActiveRangeId) || { start: 0, end: -1 };
      const startLine = Math.max(0, activeRange.start);
      const endLine = activeRange.end >= 1 ? Math.min(document.lineCount - 1, activeRange.end-1) : document.lineCount - 1;

      const matchedLines: string[] = [];
      const lineMapping = new Map<number, number>();
      for (let i = startLine; i <= endLine; i++) {
        const line = document.lineAt(i).text;
        let isMatched = false;

        for (const group of cachedGroups) {
          if (!group.enabled) continue;
          for (const filter of group.filters) {
            if (!filter.enabled) continue;
            const lineToSearch = filter.caseSensitive ? line : line.toLowerCase();
            const patternToSearch = filter.caseSensitive ? filter.pattern : filter.pattern.toLowerCase();
            
            // Use precompiled regex if available
            if (filter.regex && (filter as any).compiledRegex) {
              if ((filter as any).compiledRegex.test(lineToSearch)) {
                isMatched = true;
                break;
              }
            } else if (filter.regex) {
              const pattern = new RegExp(patternToSearch);
              if (pattern.test(lineToSearch)) {
                isMatched = true;
                break;
              }
            } else if (lineToSearch.includes(patternToSearch)) {
              isMatched = true;
              break;
            }
          }
          if (isMatched) break;
        }

        if (isMatched) {
          lineMapping.set(i, matchedLines.length);
          matchedLines.push(`${i + 1}: ${line}`);
        }
      }

      // Replace visible content with matched lines only (in-memory, not saved)
      await activeEditor.edit(editBuilder => {
        const wholeRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        editBuilder.replace(wholeRange, matchedLines.join('\n'));
      });

      matchedViewActive.set(originalUriStr, true);

      // Re-apply highlights on the now-filtered buffer
      applyHighlights(activeEditor.document, cachedGroups, true);
      
      // Update webview to reflect new match counts
      scheduleWebviewUpdate(filterPanelProvider);

      // Move cursor to the nearest line
      const originalLine = lastViewedLine.get(originalUriStr);
      if (originalLine !== undefined) {
        let nearestLine = -1;
        let minDistance = Infinity;
        for (const [key, value] of lineMapping.entries()) {
          const distance = Math.abs(key - originalLine);
          if (distance < minDistance) {
            minDistance = distance;
            nearestLine = value;
          }
        }
        if (nearestLine !== -1) {
          const position = new vscode.Position(nearestLine, 0);
          activeEditor.selection = new vscode.Selection(position, position);
          activeEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
      }

    } else {
      // Restore original content exactly as it was
      matchedViewActive.delete(originalUriStr);

      const originalText = originalDocumentContent.get(document);
      if (originalText !== undefined) {
        await activeEditor.edit(editBuilder => {
          const wholeRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );
          editBuilder.replace(wholeRange, originalText);
        });
      }
      // Go to the last viewed line
      const line = lastViewedLine.get(originalUriStr);
      if (line !== undefined) {
        const position = new vscode.Position(line, 0);
        activeEditor.selection = new vscode.Selection(position, position);
        activeEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        lastViewedLine.delete(originalUriStr);
      }
      // Re-apply highlights to restored content
      applyHighlights(activeEditor.document, cachedGroups, false);
      
      // Update webview to reflect new match counts
      scheduleWebviewUpdate(filterPanelProvider);
    }
  }));

  // Register command to refresh webview
  context.subscriptions.push(vscode.commands.registerCommand('highlight-filters.refreshWebview', () => {
    filterPanelProvider.updateWebview(cachedGroups);
  }));

  // Apply highlights to the currently active editor when the extension activates
  if (vscode.window.activeTextEditor) {
    applyHighlights(vscode.window.activeTextEditor.document, cachedGroups);
  }

  // Debounced highlight application
  const debouncedApplyHighlights = (document: vscode.TextDocument) => {
    if (highlightDebounceTimer) {
      clearTimeout(highlightDebounceTimer);
    }
    highlightDebounceTimer = setTimeout(() => {
      applyHighlights(document, cachedGroups);
    }, 150); // 150ms debounce
  };

  vscode.workspace.onDidOpenTextDocument(document => {
    const docUriStr = document.uri.toString();
    if (typeof matchedViewActive !== 'undefined') {
      matchedViewActive.delete(docUriStr);
    }
    debouncedApplyHighlights(document);
  });

  vscode.workspace.onDidChangeTextDocument(event => {
    // Only apply highlights if document is visible
    if (vscode.window.activeTextEditor?.document === event.document) {
      debouncedApplyHighlights(event.document);
    }
  });

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      debouncedApplyHighlights(editor.document);
    }
  });

  // Listen for configuration changes and update cache
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('highlightFilters')) {
      updateCachedConfig();
      precompileFilters(cachedGroups);
      
      // Re-apply highlights with new config
      if (vscode.window.activeTextEditor) {
        applyHighlights(vscode.window.activeTextEditor.document, cachedGroups);
      }
      
      // Update webview
      filterPanelProvider.updateWebview(cachedGroups);
    }
  });
}

function updateCachedConfig() {
  const config = vscode.workspace.getConfiguration('highlightFilters');
  cachedGroups = config.get<FilterGroup[]>('groups') || [];
  cachedRanges = config.get<{ id: string, name: string, start: number, end: number }[]>('ranges', []);
  cachedActiveRangeId = config.get<string>('activeRangeId', 'default');
}

function scheduleWebviewUpdate(provider: FilterPanelProvider) {
  if (webviewUpdateTimer) {
    clearTimeout(webviewUpdateTimer);
  }
  webviewUpdateTimer = setTimeout(() => {
    provider.updateWebview(cachedGroups);
  }, 100); // Batch updates within 100ms
}

class FilterPanelProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private pendingUpdates: Set<string> = new Set();

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = getHtml(webviewView, this.context.extensionUri);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      const config = vscode.workspace.getConfiguration('highlightFilters');

      switch (message.command) {
        case 'webviewReady':
          this.updateWebview(cachedGroups);
          break;
          
        case 'updateFilter':
          {
            const { id, field, value } = message.payload;
            cachedGroups.forEach(group => {
              group.filters.forEach(filter => {
                if (filter.id === id) {
                  filter[field] = value;
                }
              });
            });
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            precompileFilters(cachedGroups);
            this.batchUpdate('filter');
          }
          break;
          
        case 'updateGroup':
          {
            const { name, enabled } = message.payload;
            cachedGroups.forEach(group => {
              if (group.name === name) {
                group.enabled = enabled;
              }
            });
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            this.batchUpdate('group');
          }
          break;
        case 'toggleGroupCollapse':
          {
            const { groupName } = message.payload;
            const group = cachedGroups.find(g => g.name === groupName);
            if (group) {
              group.collapsed = !group.collapsed;
              await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
              this.updateWebview(cachedGroups);
            }
          }
          break;

        case 'expandAllGroups':
          {
            cachedGroups.forEach(g => g.collapsed = false);
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            this.updateWebview(cachedGroups);
          }
          break;
        
        case 'collapseAllGroups':
          {
            cachedGroups.forEach(g => g.collapsed = true);
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            this.updateWebview(cachedGroups);
          }
          break;
          
        case 'updateGroupName':
          {
            const { oldName, newName } = message.payload;
            cachedGroups.forEach(group => {
              if (group.name === oldName) {
                group.name = newName;
              }
            });
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            this.updateWebview(cachedGroups);
          }
          break;
          
        case 'addFilter':
          {
            const { groupName } = message.payload;
            cachedGroups.forEach(group => {
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
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            precompileFilters(cachedGroups);
            this.batchUpdate('filter');
          }
          break;
          
        case 'addGroup':
          {
            const newGroup: FilterGroup = {
              name: `Group ${cachedGroups.length + 1}`,
              enabled: true,
              filters: []
            };
            cachedGroups.push(newGroup);
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            this.updateWebview(cachedGroups);
          }
          break;
          
        case 'deleteGroup':
          {
            const { groupName } = message.payload;
            const choice = await vscode.window.showInformationMessage(
              `Delete group "${groupName}" and all its filters?`,
              { modal: true },
              "Delete"
            );
            if (choice === "Delete") {
              cachedGroups = cachedGroups.filter(group => group.name !== groupName);
              await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
              this.batchUpdate('group');
            }
          }
          break;
          
        case 'toggleFField':
          {
            const { filterId, field } = message.payload;
            cachedGroups.forEach(group => {
              group.filters.forEach(filter => {
                if (filter.id === filterId) {
                  filter[field] = !filter[field];
                }
              });
            });
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            precompileFilters(cachedGroups);
            this.batchUpdate('filter');
          }
          break;
          
        case 'deleteFilter':
          {
            const { filterId } = message.payload;
            cachedGroups.forEach(group => {
              group.filters = group.filters.filter(filter => filter.id !== filterId);
            });
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            this.batchUpdate('filter');
          }
          break;
          
        case 'moveFilter':
          {
            const { filterId, targetGroupName } = message.payload;
            let filterToMove = null;
            
            cachedGroups.forEach(group => {
              const filterIndex = group.filters.findIndex(filter => filter.id === filterId);
              if (filterIndex !== -1) {
                filterToMove = group.filters.splice(filterIndex, 1)[0];
              }
            });
            
            if (filterToMove) {
              cachedGroups.forEach(group => {
                if (group.name === targetGroupName) {
                  group.filters.push(filterToMove as any);
                }
              });
            }
            
            await config.update('groups', cachedGroups, vscode.ConfigurationTarget.Global);
            this.batchUpdate('filter');
          }
          break;
          
        case 'updateActiveRange':
          {
            const { activeRangeId } = message.payload;
            await config.update('activeRangeId', activeRangeId, vscode.ConfigurationTarget.Global);
            cachedActiveRangeId = activeRangeId;
            
            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, cachedGroups);
            }
            this.updateWebview(cachedGroups);
          }
          break;
          
        case 'addRange':
          {
            const { start, end } = message.payload as { start: number, end: number };
            const rangeStart = Math.max(0, typeof start === 'number' ? start : 0);
            const rangeEnd = typeof end === 'number' ? end : -1;

            const rangeName = await vscode.window.showInputBox({
              prompt: 'Enter a name for this range',
              placeHolder: 'e.g. Section A',
              ignoreFocusOut: true,
            });

            if (!rangeName || rangeName.trim() === '') {
              vscode.window.showInformationMessage('Range not saved: name is required.');
              break;
            }

            const newRange = {
              id: 'range-' + Math.random().toString(36).substr(2, 9),
              name: rangeName.trim(),
              start: rangeStart,
              end: rangeEnd,
            };

            cachedRanges.push(newRange);
            cachedActiveRangeId = newRange.id;

            await config.update('ranges', cachedRanges, vscode.ConfigurationTarget.Global);
            await config.update('activeRangeId', newRange.id, vscode.ConfigurationTarget.Global);

            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, cachedGroups);
            }
            this.updateWebview(cachedGroups);
          }
          break;
          
        case 'deleteRange':
          {
            const { rangeId } = message.payload as { rangeId: string };

            if (rangeId === 'default') {
              vscode.window.showInformationMessage('Default range cannot be deleted.');
              break;
            }

            const target = cachedRanges.find(r => r.id === rangeId);
            if (!target) {
              vscode.window.showInformationMessage('Selected range not found.');
              break;
            }

            if (cachedActiveRangeId === rangeId) {
              const choice = await vscode.window.showWarningMessage(
                `Delete active range "${target.name}" and switch back to Default range?`,
                { modal: true },
                'Delete'
              );
              if (choice !== 'Delete') {
                break;
              }
              cachedActiveRangeId = 'default';
              await config.update('activeRangeId', 'default', vscode.ConfigurationTarget.Global);
            }

            cachedRanges = cachedRanges.filter(r => r.id !== rangeId);
            await config.update('ranges', cachedRanges, vscode.ConfigurationTarget.Global);

            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, cachedGroups);
            }
            this.updateWebview(cachedGroups);
          }
          break;
          
        case 'refreshView':
          this.updateWebview(cachedGroups);
          break;
          
        case 'exportConfig':
          {
            const jsonString = JSON.stringify(cachedGroups, null, 2);
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
                cachedGroups = importedGroups;
                await config.update('groups', importedGroups, vscode.ConfigurationTarget.Global);
                precompileFilters(cachedGroups);
                this.batchUpdate('filter');
                vscode.window.showInformationMessage('Configuration imported successfully!');
              } catch (error) {
                vscode.window.showErrorMessage('Failed to import configuration: ' + (error as Error).message);
              }
            }
          }
          break;
      }
    });
  }

  private batchUpdate(type: string) {
    this.pendingUpdates.add(type);
    
    // Use setTimeout(0) for better responsiveness
    setTimeout(() => {
      if (this.pendingUpdates.size > 0) {
        this.pendingUpdates.clear();
        this.updateWebview(cachedGroups);
        if (vscode.window.activeTextEditor) {
          applyHighlights(vscode.window.activeTextEditor.document, cachedGroups);
        }
      }
    }, 0);
  }

  updateWebview(groups: FilterGroup[]) {
    // Get match counts for each filter (without re-applying highlights)
    const matchCounts: { [key: string]: number } = {};
    if (vscode.window.activeTextEditor) {
      const counts = getMatchCounts(vscode.window.activeTextEditor.document, groups);
      counts.forEach((count, filterId) => {
        matchCounts[filterId] = count;
      });
    }
    
    this._view?.webview.postMessage({ 
      command: 'update', 
      groups, 
      ranges: cachedRanges, 
      activeRangeId: cachedActiveRangeId, 
      matchCounts 
    });
  }
}

export function deactivate() {
  // Clean up timers
  if (highlightDebounceTimer) {
    clearTimeout(highlightDebounceTimer);
  }
  if (webviewUpdateTimer) {
    clearTimeout(webviewUpdateTimer);
  }
}
