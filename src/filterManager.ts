import * as vscode from 'vscode';
import { Filter, FilterGroup } from './types';

let activeDecorations: vscode.TextEditorDecorationType[] = [];

export function getFilterGroups(): FilterGroup[] {
  const config = vscode.workspace.getConfiguration('highlightFilters');
  return config.get<FilterGroup[]>('groups') || [];
}

// Precompile regex patterns for better performance
export function precompileFilters(groups: FilterGroup[]): void {
  for (const group of groups) {
    for (const filter of group.filters) {
      if (filter.regex) {
        try {
          const patternToCompile = filter.caseSensitive ? filter.pattern : filter.pattern.toLowerCase();
          (filter as any).compiledRegex = new RegExp(patternToCompile, 'g');
        } catch (e) {
          // Invalid regex, will fall back to runtime compilation
          (filter as any).compiledRegex = null;
        }
      } else {
        (filter as any).compiledRegex = null;
      }
    }
  }
}

export function getMatchCounts(document: vscode.TextDocument, groups: FilterGroup[], isFilteredView: boolean = false): Map<string, number> {
  const matchCounts = new Map<string, number>();
  
  if (!document || !groups) {
    return matchCounts;
  }

  // Get active range from configuration
  const config = vscode.workspace.getConfiguration('highlightFilters');
  let startLine = 0;
  let endLine = Math.max(0, document.lineCount - 1);

  if (!isFilteredView) {
    const activeRangeId = config.get<string>('activeRangeId', 'default');
    if (activeRangeId !== 'default') {
      const ranges = config.get<{ id: string, start: number, end: number }[]>('ranges', []);
      const activeRange = ranges.find(range => range.id === activeRangeId);
      if (activeRange) {
        startLine = Math.max(0, activeRange.start);
        endLine = activeRange.end >= 0 ? Math.min(document.lineCount - 1, activeRange.end) : document.lineCount - 1;
      }
    }
  }

  for (const group of groups) {
    if (!group || !group.enabled) continue;
    for (const filter of group.filters) {
      if (!filter || !filter.enabled || !filter.pattern) continue;

      let filterMatchCount = 0;
      try {
        for (let i = startLine; i <= endLine; i++) {
          try {
            const line = document.lineAt(i);
            if (!line) continue;
            
            let lineText = line.text || '';

            // If line begins with NNN: , treat that as filtered view prefix
            const matchNumPrefix = lineText.match(/^(\d+):\s?/);
            if (matchNumPrefix) {
              lineText = lineText.substring(matchNumPrefix[0].length);
            }

            const lineToSearch = filter.caseSensitive ? lineText : lineText.toLowerCase();
            const patternToSearch = filter.caseSensitive ? filter.pattern : filter.pattern.toLowerCase();

            let lineHasMatch = false;
            if (filter.regex) {
              // Use precompiled regex if available
              const regex = (filter as any).compiledRegex || new RegExp(patternToSearch, 'g');
              if (regex.test(lineToSearch)) {
                lineHasMatch = true;
              }
            } else if (lineToSearch.includes(patternToSearch)) {
              lineHasMatch = true;
            }
            
            if (lineHasMatch) {
              filterMatchCount++;
            }
          } catch (lineError) {
            // Skip problematic lines
            continue;
          }
        }
      } catch (error) {
        console.error('Error counting matches for filter:', filter.id, error);
      }
      matchCounts.set(filter.id, filterMatchCount);
    }
  }

  return matchCounts;
}

export function applyHighlights(document: vscode.TextDocument, groups: FilterGroup[], isFilteredView: boolean = false): Map<string, number> {
  const editor = vscode.window.activeTextEditor;
  const matchCounts = new Map<string, number>();
  if (!editor || editor.document !== document || !document || !groups) return matchCounts;

  // Get active range from configuration
  const config = vscode.workspace.getConfiguration('highlightFilters');
  let startLine = 0;
  let endLine = Math.max(0, document.lineCount - 1);

  if (!isFilteredView) {
    const activeRangeId = config.get<string>('activeRangeId', 'default');
    if (activeRangeId !== 'default') {
      const ranges = config.get<{ id: string, start: number, end: number }[]>('ranges', []);
      const activeRange = ranges.find(range => range.id === activeRangeId);
      if (activeRange) {
        startLine = Math.max(0, activeRange.start);
        endLine = activeRange.end >= 0 ? Math.min(document.lineCount - 1, activeRange.end) : document.lineCount - 1;
      }
    }
  }

  console.log(`Applying highlights from line ${startLine} to ${endLine} (isFiltered: ${isFilteredView})`);

  // Clear all previous decorations
  activeDecorations.forEach(d => d.dispose());
  activeDecorations = [];

  const newDecorations: Map<string, vscode.Range[]> = new Map();

  for (const group of groups) {
    if (!group.enabled) continue;
    for (const filter of group.filters) {
      if (!filter.enabled) continue;

      const decorationKey = JSON.stringify({
        foreground: filter.foreground,
        background: filter.background,
        bold: filter.bold,
        italic: filter.italic,
        highlightWholeLine: filter.highlightWholeLine
      });

      if (!newDecorations.has(decorationKey)) {
        newDecorations.set(decorationKey, []);
      }

      let filterMatchCount = 0;
      for (let i = startLine; i <= endLine; i++) {
        const line = document.lineAt(i);
        let lineText = line.text;
        let prefixLen = 0;

        // If line begins with NNN: , treat that as filtered view prefix
        const matchNumPrefix = lineText.match(/^(\d+):\s?/);
        if (matchNumPrefix) {
          prefixLen = matchNumPrefix[0].length;
          lineText = lineText.substring(prefixLen);
        }

        const lineToSearch = filter.caseSensitive ? lineText : lineText.toLowerCase();
        const patternToSearch = filter.caseSensitive ? filter.pattern : filter.pattern.toLowerCase();

        const regex = filter.regex ? new RegExp(patternToSearch, 'g') : undefined; // 'g' for multiple matches

        let lineHasMatch = false;
        if (filter.regex && regex) {
          let match;
          while ((match = regex.exec(lineToSearch)) !== null) {
            const startPos = line.range.start.translate(0, prefixLen + match.index);
            const endPos = line.range.start.translate(0, prefixLen + match.index + match[0].length);
            newDecorations.get(decorationKey)?.push(new vscode.Range(startPos, endPos));
            lineHasMatch = true;
          }
        } else if (!filter.regex) {
          // If not regex, find all occurrences of the pattern
          let startIndex = 0;
          while ((startIndex = lineToSearch.indexOf(patternToSearch, startIndex)) !== -1) {
            const startPos = line.range.start.translate(0, prefixLen + startIndex);
            const endPos = line.range.start.translate(0, prefixLen + startIndex + patternToSearch.length);
            newDecorations.get(decorationKey)?.push(new vscode.Range(startPos, endPos));
            startIndex += patternToSearch.length;
            lineHasMatch = true;
          }
        }
        
        // Count lines, not individual matches
        if (lineHasMatch) {
          filterMatchCount++;
        }
      }
      matchCounts.set(filter.id, filterMatchCount);
    }
  }

  newDecorations.forEach((ranges, decorationKey) => {
    const filterOptions = JSON.parse(decorationKey);

    const decorationOptions: vscode.DecorationRenderOptions = {};
    if (
      typeof filterOptions.foreground === 'string' &&
      filterOptions.foreground.trim() !== ''
    ) {
      decorationOptions.color = hexToRgba(filterOptions.foreground);
    }
    if (
      typeof filterOptions.background === 'string' &&
      filterOptions.background.trim() !== ''
    ) {
      decorationOptions.backgroundColor = hexToRgba(filterOptions.background);
    }

    // Compose style properties
    if (filterOptions.bold) {
      decorationOptions.fontWeight = 'bold';
    } else {
      decorationOptions.fontWeight = 'normal';
    }
    if (filterOptions.italic) {
      decorationOptions.fontStyle = 'italic';
    } else {
      decorationOptions.fontStyle = 'normal';
    }

    // Handle highlightWholeLine
    let finalRanges: vscode.Range[] = [];
    if (filterOptions.highlightWholeLine) {
      // For whole line, expand ranges to cover the entire line
      ranges.forEach(range => {
        finalRanges.push(new vscode.Range(range.start.line, 0, range.start.line, document.lineAt(range.start.line).text.length));
      });
      // Remove duplicate line ranges
      finalRanges = Array.from(new Set(finalRanges.map(range => range.start.line)))
                           .map(lineNum => new vscode.Range(lineNum, 0, lineNum, document.lineAt(lineNum).text.length));
    } else {
      finalRanges = ranges;
    }


    const decorationType = vscode.window.createTextEditorDecorationType(decorationOptions);
    activeDecorations.push(decorationType);
    editor.setDecorations(decorationType, finalRanges);
  });

  return matchCounts;
}

function hexToRgba(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Handle both 6-digit and 8-digit hex
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
    // Fallback for invalid format
    return hex;
  }
  
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
