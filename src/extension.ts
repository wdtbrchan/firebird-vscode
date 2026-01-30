import * as vscode from 'vscode';
import { Database } from './db';
import { ResultsPanel } from './resultsPanel';
import { DatabaseTreeDataProvider, DatabaseConnection, DatabaseDragAndDropController } from './explorer/databaseTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Firebird extension activating...');

    // Initialize context
    vscode.commands.executeCommand('setContext', 'firebird.hasActiveTransaction', false);

    try {
        const databaseTreeDataProvider = new DatabaseTreeDataProvider(context);
        const dragAndDropController = new DatabaseDragAndDropController(databaseTreeDataProvider);
        
        vscode.window.createTreeView('firebird.databases', {
            treeDataProvider: databaseTreeDataProvider,
            dragAndDropController: dragAndDropController
        });

        // Status Bar for Active Database
        const myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        myStatusBarItem.command = 'firebird.databases.focus';
        context.subscriptions.push(myStatusBarItem);
        const updateStatusBar = () => {
            const details = databaseTreeDataProvider.getActiveConnectionDetails();
            let text = '';
            
            if (details) {
                text = `$(database) ${details.group} / ${details.name}`;
            }

            if (activeAutoRollbackAt) {
                 const now = Date.now();
                 const remaining = Math.ceil((activeAutoRollbackAt - now) / 1000);
                 if (remaining > 0) {
                     text += ` $(watch) ${remaining}s`;
                 } else {
                     activeAutoRollbackAt = undefined; // Stop showing if passed
                 }
            }

            if (text) {
                myStatusBarItem.text = text;
                myStatusBarItem.show();
            } else {
                myStatusBarItem.hide();
            }
        };

        // Timer for updating status bar every second if needed
        let statusBarTimer: NodeJS.Timeout | undefined;
        const startStatusBarTimer = () => {
             if (statusBarTimer) clearInterval(statusBarTimer);
             statusBarTimer = setInterval(() => {
                 if (activeAutoRollbackAt) {
                     updateStatusBar();
                 } else {
                     if (statusBarTimer) {
                         clearInterval(statusBarTimer);
                         statusBarTimer = undefined;
                         updateStatusBar(); // One last update to clear timer
                     }
                 }
             }, 1000);
        };

        // Listen for transaction state changes
        let activeAutoRollbackAt: number | undefined;
        Database.onTransactionChange((hasTransaction, autoRollbackAt) => {
            vscode.commands.executeCommand('setContext', 'firebird.hasActiveTransaction', hasTransaction);
            ResultsPanel.currentPanel?.setTransactionStatus(hasTransaction, autoRollbackAt);
            
            if (hasTransaction && autoRollbackAt) {
                activeAutoRollbackAt = autoRollbackAt;
                startStatusBarTimer();
            } else {
                activeAutoRollbackAt = undefined; // Will be cleared on next tick or immediately if we call update
                updateStatusBar();
            }
        });

        // Listen for changes
        databaseTreeDataProvider.onDidChangeTreeData(() => updateStatusBar());
        updateStatusBar(); // Initial update

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

    context.subscriptions.push(vscode.commands.registerCommand('firebird.selectDatabase', async (conn: DatabaseConnection) => {
        // Rollback current transaction (if any) before switching context
        await Database.rollback();
        databaseTreeDataProvider.setActive(conn);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createGroup', async () => {
        await databaseTreeDataProvider.createGroup();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteGroup', async (group: any) => {
        await databaseTreeDataProvider.deleteGroup(group);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.commit', async () => {
        try {
            await Database.commit();
            vscode.window.setStatusBarMessage('Firebird: Transaction Committed', 3000);
        } catch (err: any) {
            vscode.window.showErrorMessage('Commit failed: ' + err.message);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.rollback', async () => {
        try {
            await Database.rollback();
            vscode.window.setStatusBarMessage('Firebird: Transaction Rolled Back', 3000);
        } catch (err: any) {
             vscode.window.showErrorMessage('Rollback failed: ' + err.message);
        }
    }));

    let disposable = vscode.commands.registerCommand('firebird.runQuery', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor');
            return;
        }

        const selection = editor.selection;
        let query = editor.document.getText(selection);
        let queryStartLine = 0;
        let queryStartChar = 0;

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
            
            // Set queryStart for error positioning
            queryStartLine = startLine;
            queryStartChar = 0; // effectively 0 since we take whole lines
        } else {
            // Selection case
            queryStartLine = selection.start.line;
            queryStartChar = selection.start.character;
        }

        if (!query.trim()) {
             vscode.window.showWarningMessage('No query selected or found.');
             return;
        }

        try {
            // Get active connection configuration
            const activeConn = databaseTreeDataProvider.getActiveConnection();
            
            if (!activeConn) {
                vscode.window.showWarningMessage('No active database connection selected. Please select a database.');
                return;
            }

            const activeDetails = databaseTreeDataProvider.getActiveConnectionDetails();
            const contextTitle = activeDetails ? `${activeDetails.group} / ${activeDetails.name}` : 'Unknown';
            
            // Show loading state immediately
            ResultsPanel.createOrShow(context.extensionUri);
            
            // Delegate query execution to the panel, which handles pagination
            if (ResultsPanel.currentPanel) {
                await ResultsPanel.currentPanel.runNewQuery(query, activeConn, contextTitle);
            }

            // Restore focus to the editor so the user can continue typing
            vscode.window.showTextDocument(editor.document, editor.viewColumn);
            
        } catch (err: any) {
             const hasTransaction = Database.hasActiveTransaction;
             
             // Try to parse error location
             const match = /line\s+(\d+),\s+column\s+(\d+)/i.exec(err.message);
             if (match && editor) {
                 try {
                    const errorLineRel = parseInt(match[1], 10);
                    const errorColRel = parseInt(match[2], 10);
                    
                    const absLine = queryStartLine + (errorLineRel - 1);
                    
                    let absCol = errorColRel - 1;
                    if (errorLineRel === 1) {
                        absCol += queryStartChar;
                    }
                    
                    const pos = new vscode.Position(absLine, absCol);
                    editor.selection = new vscode.Selection(pos, pos);
                    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                    
                    // Focus the editor so the user sees the cursor immediately
                    vscode.window.showTextDocument(editor.document, editor.viewColumn);
                 } catch (e) {
                     console.error('Failed to move cursor to error', e);
                 }
             }

             // Show error in the panel if it exists
             if (ResultsPanel.currentPanel) {
                 ResultsPanel.currentPanel.showError(err.message, hasTransaction);
             } else {
                 vscode.window.showErrorMessage('Error executing query: ' + err.message);
             }
        }
    });

    context.subscriptions.push(disposable);
    
    } catch (e: any) {
        console.error('Firebird extension activation failed:', e);
        vscode.window.showErrorMessage('Firebird extension activation failed: ' + e.message);
    }
}

export function deactivate() {
    Database.detach(); // Ensures rollback/detach on close
}
