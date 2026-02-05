import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';

export class ActiveConnectionCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private dbProvider: DatabaseTreeDataProvider) {
        // Listen for tree data changes (e.g. active connection change, color change)
        this.dbProvider.onDidChangeTreeData(() => {
            this.refresh();
        });
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const activeConnDetails = this.dbProvider.getActiveConnectionDetails();
        const activeConnection = this.dbProvider.getActiveConnection();

        if (activeConnection) {
            const range = new vscode.Range(0, 0, 0, 0);
            
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
                 // Default to green if no color specified but active? Or keep neutral?
                 // Existing logic defaults icon to green in tree provider if unspecified.
                 // let's stick to neutral if truly unspecified, or match tree provider default?
                 // Tree provider uses: const hexColor = colorMap[element.color || ''] || '#37946e'; (Green)
                 icon = '🟩';
            }

            const title = `${icon} Active: ${activeConnection.name || activeConnection.database}`;
            
            const command: vscode.Command = {
                title: title,
                command: 'firebird.selectDatabase',
                arguments: [activeConnection]
            };

            return [new vscode.CodeLens(range, command)];
        }

        // Return a "No Active Connection" lens or nothing?
        // User might want to click to select.
        const range = new vscode.Range(0, 0, 0, 0);
        const command: vscode.Command = {
            title: '⬜ No Active Database (Click to Select)',
            command: 'firebird.selectDatabase', // Will open picker if no arg?
            arguments: [] // selectDatabase implementation might need update to handle no args -> open picker
        };
        return [new vscode.CodeLens(range, command)];
    }
}
