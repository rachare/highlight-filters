import * as vscode from 'vscode';
import { applyHighlights, getFilterGroups, getMatchCounts } from './filterManager';
import { HighlightFilteredDocumentProvider } from './filteredDocumentProvider';
import { FilterGroup, Filter } from './types';
import { getHtml } from './webviewHtml';

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
    const config = vscode.workspace.getConfiguration('highlightFilters');
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

    const document = activeEditor.document;

    if (!matchedLinesViewEnabled) {
      // Local toggle: copy original content and show filtered lines in-place (without saving)
      const doc = activeEditor.document;
      const docUriStr = originalUriStr;

      // Store original content if not already stored
      if (!originalDocumentContent.has(docUriStr)) {
        originalDocumentContent.set(docUriStr, doc.getText());
      }

      // Build matched lines within active range and groups
      const groups = getFilterGroups();
      const cfg = vscode.workspace.getConfiguration('highlightFilters');
      const activeRangeId = cfg.get<string>('activeRangeId', 'default');
      const ranges = cfg.get<{ id: string, start: number, end: number }[]>('ranges', []);
      const activeRange = ranges.find(r => r.id === activeRangeId) || { start: 0, end: -1 };
      const startLine = Math.max(0, activeRange.start);
      const endLine = activeRange.end >= 0 ? Math.min(doc.lineCount - 1, activeRange.end) : doc.lineCount - 1;

      const matchedLines: string[] = [];
      for (let i = startLine; i <= endLine; i++) {
        const line = doc.lineAt(i).text;
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

      // Replace visible content with matched lines only (in-memory, not saved)
      await activeEditor.edit(editBuilder => {
        const wholeRange = new vscode.Range(
          doc.positionAt(0),
          doc.positionAt(doc.getText().length)
        );
        editBuilder.replace(wholeRange, matchedLines.join('\n'));
      });

      matchedViewActive.set(originalUriStr, true);

      // Re-apply highlights on the now-filtered buffer
      applyHighlights(activeEditor.document, groups, true);
      
      // Update webview to reflect new match counts
      vscode.commands.executeCommand('highlight-filters.refreshWebview');

    } else {
      // Restore original content exactly as it was
      matchedViewActive.delete(originalUriStr);

      const originalText = originalDocumentContent.get(originalUriStr);
      if (originalText !== undefined) {
        await activeEditor.edit(editBuilder => {
          const doc = activeEditor.document;
          const wholeRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
          );
          editBuilder.replace(wholeRange, originalText);
        });
        originalDocumentContent.delete(originalUriStr);
      }

      // Re-apply highlights to restored content
      const groupsOld = vscode.workspace.getConfiguration('highlightFilters').get<FilterGroup[]>('groups') || [];
      applyHighlights(activeEditor.document, groupsOld, false);
      
      // Update webview to reflect new match counts
      vscode.commands.executeCommand('highlight-filters.refreshWebview');
    }
  }));

  // Register command to refresh webview
  context.subscriptions.push(vscode.commands.registerCommand('highlight-filters.refreshWebview', () => {
    const config = vscode.workspace.getConfiguration('highlightFilters');
    const groups = config.get<FilterGroup[]>('groups') || [];
    filterPanelProvider.updateWebview(groups);
  }));

  // Apply highlights to the currently active editor when the extension activates
  if (vscode.window.activeTextEditor) {
    const initialConfig = vscode.workspace.getConfiguration('highlightFilters');
    const initialGroups = initialConfig.get<FilterGroup[]>('groups') || [];
    applyHighlights(vscode.window.activeTextEditor.document, initialGroups);
  }

  vscode.workspace.onDidOpenTextDocument(document => {
    // Reset local matched view state for newly opened files
    const docUriStr = document.uri.toString();
    if (typeof matchedViewActive !== 'undefined') {
      matchedViewActive.delete(docUriStr);
    }

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

    webviewView.webview.html = getHtml(webviewView, this.context.extensionUri);

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
        case 'updateActiveRange':
          {
            const { activeRangeId } = message.payload;
            await config.update('activeRangeId', activeRangeId, vscode.ConfigurationTarget.Global);
            
            // Re-apply highlights with the new range
            if (vscode.window.activeTextEditor) {
              const currentGroups = config.get<FilterGroup[]>('groups') || [];
              applyHighlights(vscode.window.activeTextEditor.document, currentGroups);
            }
    
            // Update the webview with the latest config
            this.updateWebview(groups);
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

            const existingRanges = vscode.workspace.getConfiguration('highlightFilters').get<{ id: string, name: string, start: number, end: number }[]>('ranges', []);
            const updatedRanges = [...existingRanges, newRange];

            await vscode.workspace.getConfiguration('highlightFilters').update('ranges', updatedRanges, vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration('highlightFilters').update('activeRangeId', newRange.id, vscode.ConfigurationTarget.Global);

            const latestGroups = vscode.workspace.getConfiguration('highlightFilters').get<FilterGroup[]>('groups') || [];
            this.updateWebview(latestGroups);
            if (vscode.window.activeTextEditor) {
              applyHighlights(vscode.window.activeTextEditor.document, latestGroups);
            }
          }
          break;
        case 'deleteRange':
            {
                const { rangeId } = message.payload as { rangeId: string };
                const cfg = vscode.workspace.getConfiguration('highlightFilters');
                const ranges = cfg.get<{ id: string, name: string, start: number, end: number }[]>('ranges', []);
                const activeRangeId = cfg.get<string>('activeRangeId', 'default');
    
                if (rangeId === 'default') {
                  vscode.window.showInformationMessage('Default range cannot be deleted.');
                  break;
                }
    
                const target = ranges.find(r => r.id === rangeId);
                if (!target) {
                  vscode.window.showInformationMessage('Selected range not found.');
                  break;
                }
    
                if (activeRangeId === rangeId) {
                  const choice = await vscode.window.showWarningMessage(
                    `Delete active range "${target.name}" and switch back to Default range?`,
                    { modal: true },
                    'Delete'
                  );
                  if (choice !== 'Delete') {
                    break;
                  }
                }
    
                const updated = ranges.filter(r => r.id !== rangeId);
                await cfg.update('ranges', updated, vscode.ConfigurationTarget.Global);
    
                if (activeRangeId === rangeId) {
                  await cfg.update('activeRangeId', 'default', vscode.ConfigurationTarget.Global);
                }
    
                const latestGroups = cfg.get<FilterGroup[]>('groups') || [];
                this.updateWebview(latestGroups);
                if (vscode.window.activeTextEditor) {
                  applyHighlights(vscode.window.activeTextEditor.document, latestGroups);
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
    const config = vscode.workspace.getConfiguration('highlightFilters');
    const ranges = config.get<{ id: string, start: number, end: number }[]>('ranges', []);
    const activeRangeId = config.get<string>('activeRangeId', 'default');
    
    // Get match counts for each filter (without re-applying highlights)
    const matchCounts: { [key: string]: number } = {};
    if (vscode.window.activeTextEditor) {
      // Just get the counts from the last applyHighlights call
      // We don't need to call applyHighlights again here
      const counts = getMatchCounts(vscode.window.activeTextEditor.document, groups);
      counts.forEach((count, filterId) => {
        matchCounts[filterId] = count;
      });
    }
    
    this._view?.webview.postMessage({ command: 'update', groups, ranges, activeRangeId, matchCounts });
  }
}

export function deactivate() {}
