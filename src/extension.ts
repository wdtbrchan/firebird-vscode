import * as vscode from 'vscode';
import { Database } from './db';
import { ResultsPanel } from './resultsPanel';
import { DatabaseTreeDataProvider, DatabaseConnection } from './explorer/databaseTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Firebird extension activating...');

    try {
        const databaseTreeDataProvider = new DatabaseTreeDataProvider(context);
        vscode.window.registerTreeDataProvider('firebird.databases', databaseTreeDataProvider);

    context.subscriptions.push(vscode.commands.registerCommand('firebird.addDatabase', async () => {
        await databaseTreeDataProvider.addDatabase();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.removeDatabase', (conn: DatabaseConnection) => {
        databaseTreeDataProvider.removeDatabase(conn);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.disconnectDatabase', (conn: DatabaseConnection) => {
        databaseTreeDataProvider.disconnect(conn);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.editDatabase', async (conn: DatabaseConnection) => {
        await databaseTreeDataProvider.editDatabase(conn);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.selectDatabase', (conn: DatabaseConnection) => {
        databaseTreeDataProvider.setActive(conn);
    }));

    let disposable = vscode.commands.registerCommand('firebird.runQuery', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor');
            return;
        }

        const selection = editor.selection;
        let query = editor.document.getText(selection);

        if (!query.trim()) {
            const document = editor.document;
            const cursorLine = selection.active.line;
            let startLine = cursorLine;
            let endLine = cursorLine;

            // Find start: look backwards for empty line or line ending with ;
            for (let i = cursorLine - 1; i >= 0; i--) {
                const line = document.lineAt(i).text.trimEnd();
                if (line.trim().length === 0 || line.endsWith(';')) {
                    break;
                }
                startLine = i;
            }

            // Find end: look forwards for line ending with ;
            for (let i = cursorLine; i < document.lineCount; i++) {
                const line = document.lineAt(i).text.trimEnd();
                endLine = i;
                if (line.endsWith(';')) {
                    break;
                }
                // Also stop if we hit an empty line (safety break, though usually ; defines end)
                // But user requirement says "; on end", so we stick to that mainly.
                // However, standard SQL tools often use empty lines as delimiters too if ; is missing.
                // For strict compliance with user request: "středník na konci", we look for ;.
                // But we should also stop if we encounter a new block separation (empty line) to prevent running entire file if ; is missing.
                 if (line.trim().length === 0 && i > cursorLine) {
                     endLine = i - 1; 
                     break;
                 }
            }

            const range = new vscode.Range(
                document.lineAt(startLine).range.start, 
                document.lineAt(endLine).range.end
            );
            query = document.getText(range);
        }

        if (!query.trim()) {
             vscode.window.showWarningMessage('No query selected or found.');
             return;
        }

        try {
            // Get active connection configuration
            const activeConn = databaseTreeDataProvider.getActiveConnection();
            
            const results = await Database.executeQuery(query, activeConn);
            
            // Show results in WebviewPanel (Editor Tab)
            ResultsPanel.createOrShow(context.extensionUri);
            ResultsPanel.currentPanel?.update(results);
            
        } catch (err: any) {
             vscode.window.showErrorMessage('Error executing query: ' + err.message);
        }
    });

    context.subscriptions.push(disposable);
    
    } catch (e: any) {
        console.error('Firebird extension activation failed:', e);
        vscode.window.showErrorMessage('Firebird extension activation failed: ' + e.message);
    }
}

export function deactivate() {
    Database.detach();
}
