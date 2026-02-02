import * as vscode from 'vscode';
import { Database } from './db';
import { ResultsPanel } from './resultsPanel';
import { DatabaseTreeDataProvider, DatabaseConnection, DatabaseDragAndDropController, ObjectItem, OperationItem, CreateNewIndexItem, IndexItem, IndexOperationItem } from './explorer/databaseTreeDataProvider';
import { MetadataService } from './services/metadataService';
import { ScriptParser } from './services/scriptParser';
import { DDLProvider } from './services/ddlProvider';

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

        // DDL Provider
        const ddlProvider = new DDLProvider();
        context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DDLProvider.scheme, ddlProvider));

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
        Database.onTransactionChange((hasTransaction, autoRollbackAt, lastAction) => {
            vscode.commands.executeCommand('setContext', 'firebird.hasActiveTransaction', hasTransaction);
            ResultsPanel.currentPanel?.setTransactionStatus(hasTransaction, autoRollbackAt, lastAction);
            
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

    context.subscriptions.push(vscode.commands.registerCommand('firebird.renameGroup', async (group: any) => {
        await databaseTreeDataProvider.renameGroup(group);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteGroup', async (group: any) => {
        await databaseTreeDataProvider.deleteGroup(group);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openObject', async (type: string, name: string, connection: DatabaseConnection) => {
        try {
            let ddl = '';
            // Show progress? Fetching is usually fast.
            switch (type) {
                case 'table': ddl = await MetadataService.getTableDDL(connection, name); break;
                case 'view': ddl = await MetadataService.getViewSource(connection, name); break;
                case 'trigger': ddl = await MetadataService.getTriggerSource(connection, name); break;
                case 'procedure': ddl = await MetadataService.getProcedureSource(connection, name); break;
                case 'generator': ddl = await MetadataService.getGeneratorDDL(connection, name); break;
                case 'index': ddl = await MetadataService.getIndexDDL(connection, name); break;
                default: ddl = `-- Unknown object type: ${type}`;
            }

            const uri = vscode.Uri.parse(`${DDLProvider.scheme}:///${name}.sql`);
            ddlProvider.reportContent(uri, ddl);
            
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: true });
        } catch (err: any) {
             vscode.window.showErrorMessage(`Error opening object ${name}: ${err.message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.generateScript', async (mode: 'create' | 'alter' | 'drop' | 'recreate', objectItem: ObjectItem) => {
        try {
            const { type, objectName: name, connection } = objectItem;
            let script = '';

            const wrapSetTerm = (sql: string) => `SET TERM ^ ;\n${sql} ^\nSET TERM ; ^`;

            if (mode === 'drop') {
                switch (type) {
                    case 'table': script = `DROP TABLE ${name};`; break;
                    case 'view': script = `DROP VIEW ${name};`; break;
                    case 'trigger': script = `DROP TRIGGER ${name};`; break;
                    case 'procedure': script = `DROP PROCEDURE ${name};`; break;
                    case 'generator': script = `DROP SEQUENCE ${name};`; break; 
                }
            } else if (mode === 'recreate') {
                if (type === 'view') {
                    const src = await MetadataService.getViewSource(connection, name);
                    if (src.startsWith('CREATE VIEW')) {
                        const inner = src.replace('CREATE VIEW', 'RECREATE VIEW');
                        script = wrapSetTerm(inner);
                    } else {
                        script = wrapSetTerm(`RECREATE VIEW ${name} AS\n` + src); 
                    }
                } else {
                     script = `-- Recreate is only implemented for Views currently.`;
                }
            } else if (mode === 'create') {
                switch (type) {
                    case 'table': script = await MetadataService.getTableDDL(connection, name); break;
                    case 'view': {
                        let src = await MetadataService.getViewSource(connection, name);
                        if (src.startsWith('CREATE VIEW')) {
                             src = src.replace('CREATE VIEW', 'CREATE OR ALTER VIEW');
                        }
                        script = wrapSetTerm(src);
                        break;
                    }
                    case 'trigger': script = wrapSetTerm(await MetadataService.getTriggerSource(connection, name)); break;
                    case 'procedure': script = wrapSetTerm(await MetadataService.getProcedureSource(connection, name)); break;
                    case 'generator': script = await MetadataService.getGeneratorDDL(connection, name); break;
                }
            } else {
                // ALTER mode
                switch (type) {
                    case 'table':
                        script = `ALTER TABLE ${name} ADD column_name datatype; -- Template\n-- ALTER TABLE ${name} DROP column_name;\n-- ALTER TABLE ${name} ALTER COLUMN column_name TYPE new_type;`;
                        break;
                    case 'view':
                        // ALTER VIEW -> CREATE OR ALTER VIEW
                        let vSrc = await MetadataService.getViewSource(connection, name);
                        if (vSrc.startsWith('CREATE VIEW')) {
                             vSrc = vSrc.replace('CREATE VIEW', 'CREATE OR ALTER VIEW');
                        } else {
                             vSrc = `CREATE OR ALTER VIEW ${name} AS ${vSrc}`;
                        }
                        script = wrapSetTerm(vSrc);
                        break;
                    case 'trigger':
                    case 'procedure':
                        let src = '';
                        if (type === 'trigger') src = await MetadataService.getTriggerSource(connection, name);
                        else src = await MetadataService.getProcedureSource(connection, name);
                        
                        // Use CREATE OR ALTER
                        if (src.startsWith(`CREATE ${type.toUpperCase()}`)) {
                           src = src.replace(`CREATE ${type.toUpperCase()}`, `CREATE OR ALTER ${type.toUpperCase()}`);
                        }
                        script = wrapSetTerm(src);
                        break;
                    case 'generator':
                        const curVal = await MetadataService.getGeneratorValue(connection, name);
                        const valNum = parseInt(curVal, 10);
                        const nextVal = isNaN(valNum) ? 0 : valNum;
                        script = `ALTER SEQUENCE ${name} RESTART WITH ${nextVal}; -- Set to desired value`;
                        break;
                }
            }

            const doc = await vscode.workspace.openTextDocument({
                content: script,
                language: 'sql'
            });
            await vscode.window.showTextDocument(doc);

        } catch (err: any) {
            vscode.window.showErrorMessage(`Error generating script: ${err.message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createIndex', async (connection: DatabaseConnection, tableName: string) => {
        try {
            const script = `/*
CREATE [UNIQUE] [ASC[ENDING] | [DESC[ENDING]] INDEX indexname
   ON tablename
   { (<col> [, <col> ...]) | COMPUTED BY (expression) }
<col>  ::=  a column not of type ARRAY, BLOB or COMPUTED BY
*/

CREATE INDEX IX_${tableName}_1 ON ${tableName} (column_name);`;

            const doc = await vscode.workspace.openTextDocument({
                content: script,
                language: 'sql'
            });
            await vscode.window.showTextDocument(doc);
        } catch (err: any) {
             vscode.window.showErrorMessage(`Error preparing create index script: ${err.message}`);
        }
    }));



    context.subscriptions.push(vscode.commands.registerCommand('firebird.indexOperation', async (type: 'drop' | 'activate' | 'deactivate' | 'recompute', connection: DatabaseConnection, indexName: string) => {
        try {
            let sql = '';
            
            if (type === 'drop') {
                sql = `DROP INDEX ${indexName};`;
            } else if (type === 'activate') {
                sql = `ALTER INDEX ${indexName} ACTIVE;`;
            } else if (type === 'deactivate') {
                sql = `ALTER INDEX ${indexName} INACTIVE;`;
            } else if (type === 'recompute') {
                sql = `SET STATISTICS INDEX ${indexName};`;
            }

            const doc = await vscode.workspace.openTextDocument({
                content: sql,
                language: 'sql'
            });
            await vscode.window.showTextDocument(doc);
            
        } catch (err: any) {
             vscode.window.showErrorMessage(`Operation failed: ${err.message}`);
        }
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

    context.subscriptions.push(vscode.commands.registerCommand('firebird.executeScript', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor');
            return;
        }

        const query = editor.document.getText();
        
        if (!query.trim()) {
             vscode.window.showWarningMessage('Script is empty.');
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
            
            // Delegate query execution to the panel
            if (ResultsPanel.currentPanel) {
                // Parse script
                const statements = ScriptParser.split(query);
                if (statements.length === 0) {
                    vscode.window.showWarningMessage('No valid SQL statements found in script.');
                    return;
                }
                await ResultsPanel.currentPanel.runScript(statements, activeConn, contextTitle);
            }

            // Restore focus to the editor
            vscode.window.showTextDocument(editor.document, editor.viewColumn);
            
        } catch (err: any) {
             const hasTransaction = Database.hasActiveTransaction;
             // Show error in the panel if it exists
             if (ResultsPanel.currentPanel) {
                 ResultsPanel.currentPanel.showError(err.message, hasTransaction);
             } else {
                 vscode.window.showErrorMessage('Error executing script: ' + err.message);
             }
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
