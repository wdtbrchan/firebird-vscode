import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { QueryExtractor } from '../services/queryExtractor';

export class ActiveConnectionCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private disposables: vscode.Disposable[] = [];
    private lastCursorLine: number = -1;

    constructor(private dbProvider: DatabaseTreeDataProvider) {
        // Listen for tree data changes (e.g. active connection change, color change)
        this.dbProvider.onDidChangeTreeData(() => {
            this.refresh();
        });

        // Listen for configuration changes to refresh CodeLens
        this.disposables.push(vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('firebird.enableCodeLens') || 
                e.affectsConfiguration('firebird.enableCodeLensInNonSqlFiles') || 
                e.affectsConfiguration('firebird.allowedLanguages')) {
                this.refresh();
            }
        }));
        
        // Listen for cursor changes to update CodeLens position
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection((e) => {
            const config = vscode.workspace.getConfiguration('firebird');
            const allowedLanguages = config.get<string[]>('allowedLanguages', ['sql']);

            // Only update if it's an allowed file and we have a selection
            if (allowedLanguages.includes(e.textEditor.document.languageId) && e.selections.length > 0) {
                const currentLine = e.selections[0].active.line;
                // Only fire if line changed to avoid too many updates
                if (this.lastCursorLine !== currentLine) {
                    this.lastCursorLine = currentLine;
                    this.refresh();
                }
            }
        }));
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this._onDidChangeCodeLenses.dispose();
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const config = vscode.workspace.getConfiguration('firebird');
        if (!config.get<boolean>('enableCodeLens', true)) {
            return [];
        }

        const isSqlFile = document.languageId === 'sql';
        if (!isSqlFile && !config.get<boolean>('enableCodeLensInNonSqlFiles', false)) {
            return [];
        }

        const activeConnDetails = this.dbProvider.getActiveConnectionDetails();
        const activeConnection = this.dbProvider.getActiveConnection();

        if (activeConnection && activeConnDetails) {
            let startRange = new vscode.Range(0, 0, 0, 0);
            let endRange: vscode.Range | undefined;
            let queryFound = false;

            let result: { text: string, startOffset: number, type?: string } | null = null;

            // Try to find the query at the current cursor position to place the CodeLens above it
            const editor = vscode.window.activeTextEditor;
            // Ensure we are looking at the active editor and it matches the document we are providing lenses for
            if (editor && editor.document.uri.toString() === document.uri.toString()) {
                const selection = editor.selection;
                const offset = document.offsetAt(selection.active);
                
                const config = vscode.workspace.getConfiguration('firebird');
                const useEmptyLineAsSeparator = config.get<boolean>('useEmptyLineAsSeparator', false);

                result = QueryExtractor.extract(document.getText(), offset, document.languageId, useEmptyLineAsSeparator);
                
                if (result && result.text.trim().length > 0) {
                    // Filter out non-SQL files that don't look like SQL
                    if (document.languageId !== 'sql' && !QueryExtractor.hasSqlKeywords(result.text)) {
                         return [];
                    }

                    const startPos = document.positionAt(result.startOffset);
                    startRange = new vscode.Range(startPos, startPos);
                    
                    const endPos = document.positionAt(result.startOffset + result.text.length);
                    // Move to the next line for the end CodeLens so it appears below the query
                    const endLine = endPos.line + 1;
                    endRange = new vscode.Range(endLine, 0, endLine, 0);
                    queryFound = true;
                }
            }

            // If non-SQL file and no query found, don't show the default lens at top
            if (document.languageId !== 'sql' && !queryFound) {
                return [];
            }

            let icon = '⬜'; // Default gray/white
            if (activeConnection.color) {
                switch (activeConnection.color.toLowerCase()) {
                    case 'red': icon = '🟥'; break;
                    case 'orange': icon = '🟧'; break;
                    case 'yellow': icon = '🟨'; break;
                    case 'green': icon = '🟩'; break;
                    case 'blue': icon = '🟦'; break;
                    case 'purple': icon = '🟪'; break;
                }
            } else {
                 icon = '🟩';
            }

            const folderPart = activeConnDetails.group && activeConnDetails.group !== 'Root' ? `${activeConnDetails.group} / ` : '';
            let title = `${icon} ${folderPart}${activeConnDetails.name}`;
            const lenses: vscode.CodeLens[] = [];
            
            // 1. Database Name CodeLens (First)
            if (endRange) {
                title = `↓ ` + title;
            }
            
            const selectDbCommand: vscode.Command = {
                title: title,
                command: 'firebird.selectDatabase',
                arguments: [activeConnection]
            };
            lenses.push(new vscode.CodeLens(startRange, selectDbCommand));


            // 2. Run Action CodeLens (Second)
            if (endRange) {
                // If it is a SET TERM block, add "Run Script"
                if (result && result.type === 'SET_TERM') {
                     const runScriptCommand: vscode.Command = {
                        title: `$(run-all) Run Script`,
                        command: 'firebird.executeScript',
                        arguments: [result.text]
                    };
                    lenses.push(new vscode.CodeLens(startRange, runScriptCommand));
                }
                // If it is a standard Query, add "Run Query"
                else if (result && result.type === 'QUERY') {
                     const runQueryCommand: vscode.Command = {
                        title: `$(play) Run Query`,
                        command: 'firebird.runQuery',
                        arguments: []
                    };
                    lenses.push(new vscode.CodeLens(startRange, runQueryCommand));
                }
            }

            if (endRange) {
                const endCommand: vscode.Command = {
                    title: `↑`,
                    command: 'firebird.selectDatabase',
                    arguments: [activeConnection]
                };
                lenses.push(new vscode.CodeLens(endRange, endCommand));
            }

            return lenses;
        }

        // Return a "No Active Connection" lens or nothing?
        // User might want to click to select.
        
        // In non-SQL files, don't show "No Active Connection" lens at top
        if (!isSqlFile) {
            return [];
        }

        const range = new vscode.Range(0, 0, 0, 0);
        const command: vscode.Command = {
            title: '⬜ No Active Database (Click to Select)',
            command: 'firebird.selectDatabase', // Will open picker if no arg?
            arguments: [] // selectDatabase implementation might need update to handle no args -> open picker
        };
        return [new vscode.CodeLens(range, command)];
    }
}
