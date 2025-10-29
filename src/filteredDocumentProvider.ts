import * as vscode from 'vscode';
import { FilterGroup, Filter } from './types';
import { getFilterGroups } from './filterManager'; // Assuming filterManager can provide filter groups

const SCHEME = 'highlight-filtered-content';

export class HighlightFilteredDocumentProvider implements vscode.TextDocumentContentProvider {
    // Event emitter for when the content changes
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    // Store the original document URI for a given filtered URI
    private _documents = new Map<string, vscode.Uri>();

    // Store a mapping of original document URI to its filtered URI
    private _filteredUris = new Map<string, vscode.Uri>();

    public static readonly scheme = SCHEME;

    constructor(private context: vscode.ExtensionContext) {
        // Listen for configuration changes to update filtered documents
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('highlightFilters.groups')) {
                // Trigger an update for all active filtered documents
                this._filteredUris.forEach(filteredUri => {
                    this._onDidChange.fire(filteredUri);
                });
            }
        });

        // Listen for changes in original documents to update filtered documents
        vscode.workspace.onDidChangeTextDocument(e => {
            if (this._filteredUris.has(e.document.uri.toString())) {
                this._onDidChange.fire(this._filteredUris.get(e.document.uri.toString())!);
            }
        });
    }

    // Provides the content for a given URI
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const originalUriString = uri.query;
        const originalUri = vscode.Uri.parse(originalUriString);

        if (!originalUri) {
            return 'Could not retrieve original document URI.';
        }

        const originalDocument = await vscode.workspace.openTextDocument(originalUri);
        const text = originalDocument.getText();
        const lines = text.split(/\r?\n/);

        const config = vscode.workspace.getConfiguration('highlightFilters');
        const groups = getFilterGroups(); // Get filter groups from filterManager (or directly here)

        let matchedLines: string[] = [];

        // Apply filters to find matched lines
        lines.forEach((line, lineIndex) => {
            for (const group of groups) {
                if (!group.enabled) {
                    continue;
                }
                for (const filter of group.filters) {
                    if (!filter.enabled) {
                        continue;
                    }

                    const pattern = filter.regex ? new RegExp(filter.pattern) : filter.pattern;
                    if ((filter.regex && (pattern as RegExp).test(line)) || (!filter.regex && line.includes(pattern as string))) {
                        // Optionally add line numbers or other context
                        matchedLines.push(`${lineIndex + 1}: ${line}`);
                        break; // Only add the line once if it matches multiple filters
                    }
                }
            }
        });

        if (matchedLines.length === 0) {
            return 'No lines matched the active filters.';
        }

        return matchedLines.join('\n');
    }

    // Creates a URI for a filtered document from an original document's URI
    public static encode(originalUri: vscode.Uri): vscode.Uri {
        const originalUriString = originalUri.toString();
        // The query part of the URI will store the original document's URI
        return vscode.Uri.parse(`${SCHEME}://filtered-content?${originalUriString}`);
    }

    // Helper to keep track of filtered document URIs
    public addFilteredUri(originalUri: vscode.Uri, filteredUri: vscode.Uri) {
        this._documents.set(filteredUri.toString(), originalUri);
        this._filteredUris.set(originalUri.toString(), filteredUri);
    }

    public removeFilteredUri(filteredUri: vscode.Uri) {
        const originalUri = this._documents.get(filteredUri.toString());
        if (originalUri) {
            this._filteredUris.delete(originalUri.toString());
        }
        this._documents.delete(filteredUri.toString());
    }

    public getFilteredUri(originalUri: vscode.Uri): vscode.Uri | undefined {
        return this._filteredUris.get(originalUri.toString());
    }
}
