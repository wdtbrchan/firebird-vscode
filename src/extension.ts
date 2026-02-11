import * as vscode from 'vscode';
import { Database } from './db';
import { ResultsPanel } from './resultsPanel';
import { DatabaseTreeDataProvider } from './explorer/databaseTreeDataProvider';
import { DatabaseConnection, ObjectItem } from './explorer/treeItems/databaseItems';
import { DatabaseDragAndDropController } from './explorer/databaseDragAndDropController';
import { OperationItem } from './explorer/treeItems/operationItems';
import { CreateNewIndexItem, IndexItem, IndexOperationItem } from './explorer/treeItems/indexItems';
import { ScriptItem } from './explorer/treeItems/scriptItems';
import { MetadataService } from './services/metadataService';
import { ScriptParser } from './services/scriptParser';
import { DDLProvider } from './services/ddlProvider';
import { ParameterInjector } from './services/parameterInjector';
import { ScriptService, ScriptItemData } from './services/scriptService';
import * as path from 'path';
import * as fs from 'fs';
import { ConnectionDecorationProvider } from './connectionDecorationProvider';
import { ActiveConnectionCodeLensProvider } from './providers/activeConnectionCodeLensProvider';
import { QueryExtractor } from './services/queryExtractor';

export function activate(context: vscode.ExtensionContext) {


    // --- End Context Key Management ---

    // Initialize context
    vscode.commands.executeCommand('setContext', 'firebird.hasActiveTransaction', false);

    // --- Context Key Management ---
    const updateExecutionContext = () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.commands.executeCommand('setContext', 'firebird:queryExecutionEnabled', false);
            return;
        }
        const config = vscode.workspace.getConfiguration('firebird');
        const allowedLanguages = config.get<string[]>('allowedLanguages', ['sql']);
        const isAllowed = allowedLanguages.includes(editor.document.languageId);
        vscode.commands.executeCommand('setContext', 'firebird:queryExecutionEnabled', isAllowed);
    };

    // Initial check
    updateExecutionContext();

    // Listeners
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateExecutionContext),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('firebird.allowedLanguages')) {
                updateExecutionContext();
            }
        })
    );
    // ------------------------------

    try {
        const databaseTreeDataProvider = new DatabaseTreeDataProvider(context);
        vscode.window.registerTreeDataProvider('firebird.databases', databaseTreeDataProvider);
        
        // Register Decoration Provider
        const decorationProvider = new ConnectionDecorationProvider(databaseTreeDataProvider);
        context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));
        const dragAndDropController = new DatabaseDragAndDropController(databaseTreeDataProvider);
        
        const treeView = vscode.window.createTreeView('firebird.databases', {
            treeDataProvider: databaseTreeDataProvider,
            dragAndDropController: dragAndDropController
        });
        databaseTreeDataProvider.setTreeView(treeView);

        // Register CodeLens Provider for Active Connection
        const activeConnectionCodeLensProvider = new ActiveConnectionCodeLensProvider(databaseTreeDataProvider);
        context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'sql' }, activeConnectionCodeLensProvider));

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

        context.subscriptions.push(vscode.commands.registerCommand('firebird.selectDatabase', async (conn: DatabaseConnection) => {
            // Rollback current transaction (if any) before switching context
            await Database.rollback();
            databaseTreeDataProvider.setActive(conn);
        }));

    // --- Core Commands Moved Up ---
    context.subscriptions.push(vscode.commands.registerCommand('firebird.closeResults', () => {
        if (ResultsPanel.currentPanel) {
            ResultsPanel.currentPanel.dispose();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.commit', async () => {
        try {
            await Database.commit();
            
            // Refresh active connection to show changes (like new tables)
            const activeConn = databaseTreeDataProvider.getActiveConnection();
            if (activeConn) {
                databaseTreeDataProvider.refreshDatabase(activeConn);
            }

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

                // Check for DDL in script to auto-refresh
                if (statements.some(stmt => ScriptParser.isDDL(stmt))) {
                    databaseTreeDataProvider.refreshDatabase(activeConn);
                }
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

    context.subscriptions.push(vscode.commands.registerCommand('firebird.runQuery', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor');
            return;
        }

        const config = vscode.workspace.getConfiguration('firebird');
        const allowedLanguages = config.get<string[]>('allowedLanguages', ['sql']);
        if (!allowedLanguages.includes(editor.document.languageId)) {
            // User explicitly used the command (keybinding or palette), so we should inform them if it's blocked.
            // We can add a 'Don't show again' option ideally, but for now simple warning.
            vscode.window.showInformationMessage(`Firebird: Execution not enabled for language '${editor.document.languageId}'. Check 'firebird.allowedLanguages' setting.`);
            return;
        }

        const selection = editor.selection;
        let query = '';
        let queryStartLine = 0;
        let queryStartChar = 0;

        // If selection is empty, use QueryExtractor to find the query at cursor
        if (selection.isEmpty) {
             const offset = editor.document.offsetAt(selection.active);
             const result = QueryExtractor.extract(editor.document.getText(), offset, editor.document.languageId);
             
             if (result) {
                 query = result.text;
                 const startPos = editor.document.positionAt(result.startOffset);
                 queryStartLine = startPos.line;
                 queryStartChar = startPos.character;
             }
        } else {
             query = editor.document.getText(selection);
             queryStartLine = selection.start.line;
             queryStartChar = selection.start.character;
        }

        if (!query || !query.trim()) {
             vscode.window.showWarningMessage('No query selected or found.');
             return;
        }

        // --- Query Cleanup ---
        let cleanQuery = query.trim();
        
        // Remove trailing semicolon if present
        if (cleanQuery.endsWith(';')) cleanQuery = cleanQuery.slice(0, -1).trim();

        // Language-specific cleanup (e.g. PHP strings)
        if (editor.document.languageId !== 'sql') {
            // Remove PHP variable assignment if present (e.g. $var = )
            // QueryExtractor extracts the string content, so $var = "..." -> "..."
            // But if user selected "$var = ...", we might still need this.
            // Since we use QueryExtractor for empty selection, this regex is mostly for manual selection cleanup.
             const assignmentMatch = /^\$[\w\d_]+\s*=\s*/.exec(cleanQuery);
             if (assignmentMatch) {
                 cleanQuery = cleanQuery.substring(assignmentMatch[0].length).trim();
             }
             
             // If manual selection included quotes, remove them
             if ((cleanQuery.startsWith('"') && cleanQuery.endsWith('"')) || 
                 (cleanQuery.startsWith("'") && cleanQuery.endsWith("'"))) {
                 cleanQuery = cleanQuery.substring(1, cleanQuery.length - 1);
            }
        }
        // --- End Query Cleanup ---

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

            // Inject parameters if present
            cleanQuery = ParameterInjector.inject(cleanQuery);
            
            // Delegate query execution to the panel
            if (ResultsPanel.currentPanel) {
                await ResultsPanel.currentPanel.runNewQuery(cleanQuery, activeConn, contextTitle);
            }

            // Check for DDL to auto-refresh
            if (ScriptParser.isDDL(cleanQuery)) {
                databaseTreeDataProvider.refreshDatabase(activeConn);
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
    }));

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

        // Listen for tree changes
        databaseTreeDataProvider.onDidChangeTreeData(() => {
            updateStatusBar();
        });
        updateStatusBar();




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

    context.subscriptions.push(vscode.commands.registerCommand('firebird.refreshDatabase', (conn: DatabaseConnection) => {
        databaseTreeDataProvider.refreshDatabase(conn);
    }));

    // Register simple slot commands 1-9
    for (let i = 1; i <= 9; i++) {
        context.subscriptions.push(vscode.commands.registerCommand(`firebird.connectSlot${i}`, async () => {
            const conn = databaseTreeDataProvider.getConnectionBySlot(i);
            if (conn) {
                // Rollback current transaction (if any) before switching context
                await Database.rollback();
                databaseTreeDataProvider.setActive(conn);
                vscode.window.showInformationMessage(`Switched to connection: ${conn.name || conn.database}`);
            } else {
                vscode.window.showInformationMessage(`No connection assigned to Slot ${i}. Edit a connection to assign it.`);
            }
        }));
    }

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createGroup', async () => {
        await databaseTreeDataProvider.createGroup();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.renameGroup', async (group: any) => {
        await databaseTreeDataProvider.renameGroup(group);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteGroup', async (group: any) => {
        await databaseTreeDataProvider.deleteGroup(group);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.backupConnections', async () => {
        await databaseTreeDataProvider.backupConnections();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.restoreConnections', async () => {
        await databaseTreeDataProvider.restoreConnections();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'firebird.');
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

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createObject', async (arg?: any, connection?: DatabaseConnection) => {
        let objectType: string | undefined;
        let conn: DatabaseConnection | undefined;

        if (arg) {
            // Check if called from context menu (FolderItem)
            if (arg.connection && arg.type) {
                conn = arg.connection;
                // Map plural folder type to singular object type
                switch (arg.type) {
                    case 'tables': objectType = 'table'; break;
                    case 'views': objectType = 'view'; break;
                    case 'triggers': objectType = 'trigger'; break;
                    case 'procedures': objectType = 'procedure'; break;
                    case 'generators': objectType = 'generator'; break;
                    default: objectType = arg.type; // fallback if already singular
                }
            } else if (typeof arg === 'string') {
                objectType = arg;
                conn = connection;
            }
        }

        if (!objectType || !conn) {
             vscode.window.showErrorMessage('Create Object: Missing type or connection.');
             return;
        }

        let script = '';
        switch (objectType) {
            case 'table':
                script = `CREATE TABLE NEW_TABLE (
    ID INTEGER NOT NULL,
    NAME VARCHAR(50),
    CONSTRAINT PK_NEW_TABLE PRIMARY KEY (ID)
);`;
                break;
            case 'view':
                script = `CREATE VIEW NEW_VIEW AS
SELECT * FROM SOME_TABLE;`;
                break;
            case 'trigger':
                script = `SET TERM ^ ;
CREATE TRIGGER NEW_TRIGGER FOR SOME_TABLE
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
    /* Trigger body */
END^
SET TERM ; ^`;
                break;
            case 'procedure':
                script = `SET TERM ^ ;
CREATE PROCEDURE NEW_PROCEDURE (
    INPUT_PARAM INTEGER
)
RETURNS (
    OUTPUT_PARAM INTEGER
)
AS
BEGIN
    OUTPUT_PARAM = INPUT_PARAM * 2;
    SUSPEND;
END^
SET TERM ; ^`;
                break;
            case 'generator':
                script = `CREATE SEQUENCE NEW_SEQUENCE;`;
                break;
            default:
                script = `-- Create script for ${objectType}`;
        }

        try {
            const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: script });
            await vscode.window.showTextDocument(doc);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error creating object script: ${err.message}`);
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
    
    context.subscriptions.push(vscode.commands.registerCommand('firebird.triggerOperation', async (type: 'drop' | 'activate' | 'deactivate', connection: DatabaseConnection, triggerName: string) => {
        try {
            let sql = '';
            
            if (type === 'drop') {
                sql = `DROP TRIGGER ${triggerName};`;
            } else if (type === 'activate') {
                sql = `ALTER TRIGGER ${triggerName} ACTIVE;`;
            } else if (type === 'deactivate') {
                sql = `ALTER TRIGGER ${triggerName} INACTIVE;`;
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

    // --- Script Commands ---
    context.subscriptions.push(vscode.commands.registerCommand('firebird.createScript', async (arg?: any, parentId?: string) => {
        let connectionId: string | undefined = undefined;
        let pId: string | undefined = parentId;

        if (arg) {
            // Check if called from context menu/inline action
            if (arg.contextValue === 'local-scripts') {
                // FolderItem
                connectionId = arg.connection?.id;
                pId = undefined;
            } else if (arg.contextValue === 'global-scripts') {
                // FolderItem (Global)
                connectionId = undefined;
                pId = undefined;
            } else if (arg.contextValue === 'script-folder') {
                // ScriptFolderItem
                // We need to access the internal data or connectionId
                // Assuming arg has connectionId property and data property with id
                connectionId = arg.connectionId;
                if (arg.data) {
                    pId = arg.data.id;
                }
            } else if (typeof arg === 'string') {
                 // Legacy or manual call
                 connectionId = arg;
            }
        }

        // Open untitled document immediately, do not ask for name
        const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: '' });
        await vscode.window.showTextDocument(doc);
        
        const removeListeners = () => {
            saveListener.dispose();
            closeListener.dispose();
        };

        const saveListener = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
             if (savedDoc === doc) {
                 // User saved the file, now add it to scripts
                 const service = ScriptService.getInstance();
                 service.addScript(path.basename(savedDoc.fileName), savedDoc.fileName, connectionId, pId);
                 removeListeners();
             }
        });
        
        const closeListener = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
            if (closedDoc === doc) {
                // Closed without saving, just cleanup listeners
                removeListeners();
            }
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createScriptFolder', async (arg?: any, parentId?: string) => {
        let connectionId: string | undefined = undefined;
        let pId: string | undefined = parentId;

        if (arg) {
             if (arg.contextValue === 'local-scripts') {
                connectionId = arg.connection?.id;
                pId = undefined;
            } else if (arg.contextValue === 'global-scripts') {
                connectionId = undefined;
                pId = undefined;
            } else if (arg.contextValue === 'script-folder') {
                connectionId = arg.connectionId;
                if (arg.data) {
                    pId = arg.data.id;
                }
            } else if (typeof arg === 'string') {
                 connectionId = arg;
            }
        }

        const name = await vscode.window.showInputBox({ prompt: 'Enter folder name', value: 'New Folder' });
        if (!name) return;
        
        const service = ScriptService.getInstance();
        service.addFolder(name, connectionId, pId);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.addScript', async (arg?: any, parentId?: string) => {
        let connectionId: string | undefined = undefined;
        let pId: string | undefined = parentId;

        if (arg) {
             if (arg.contextValue === 'local-scripts') {
                connectionId = arg.connection?.id;
                pId = undefined;
            } else if (arg.contextValue === 'global-scripts') {
                connectionId = undefined;
                pId = undefined;
            } else if (arg.contextValue === 'script-folder') {
                connectionId = arg.connectionId;
                if (arg.data) {
                    pId = arg.data.id;
                }
            } else if (typeof arg === 'string') {
                 connectionId = arg;
            }
        }

        const uris = await vscode.window.showOpenDialog({ canSelectMany: true, filters: {'SQL': ['sql'], 'All': ['*']} });
        if (uris && uris.length > 0) {
            const service = ScriptService.getInstance();
            for (const uri of uris) {
                service.addScript(path.basename(uri.fsPath), uri.fsPath, connectionId, pId);
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.renameScriptFolder', async (arg?: any) => {
        if (!arg) return;
        
        let itemId: string | undefined;
        let currentName: string = '';
        
        // Check if called from context menu/inline action
        if (arg.contextValue === 'script-folder') {
             itemId = arg.data.id;
             currentName = arg.data.name;
        } else if (arg.data && arg.data.id) {
             itemId = arg.data.id;
             currentName = arg.data.name;
        }

        if (!itemId) return;

        const name = await vscode.window.showInputBox({ 
            prompt: 'Enter new name', 
            value: currentName 
        });
        
        if (name && name !== currentName) {
            const service = ScriptService.getInstance();
            service.renameItem(itemId, name);
        }
    }));

     context.subscriptions.push(vscode.commands.registerCommand('firebird.openScript', async (script: ScriptItemData) => {
        if (script.pending) {
             const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: '' });
             await vscode.window.showTextDocument(doc);
             const service = ScriptService.getInstance();
             
             const removeListeners = () => {
                saveListener.dispose();
                closeListener.dispose();
             };

             const saveListener = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
                 if (savedDoc === doc) {
                     service.resolvePendingScript(script.id, savedDoc.fileName);
                     removeListeners();
                 }
            });

            const closeListener = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
                if (closedDoc === doc) {
                    // Start fresh if they close it? Or keep it pending?
                    // User probably expects it to disappear if they close the untitled editor without saving.
                    // But here we are re-opening an *existing* pending item.
                    
                    // If they close the editor for an existing pending item, we just stop listening.
                    removeListeners();
                }
            });
        } else if (script.fsPath) {
             const doc = await vscode.workspace.openTextDocument(script.fsPath);
             await vscode.window.showTextDocument(doc);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteScript', async (item: any) => { 
        const service = ScriptService.getInstance();
        // Item is ScriptItem or similar wrapper. It should have data property.
        if (item && item.data) {
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove '${item.label}' from the list?`, { modal: true }, 'Remove');
             if (confirm === 'Remove') {
                 service.removeItem(item.data.id);
             }
        }
    }));
    // -----------------------

    // Filter commands
    context.subscriptions.push(vscode.commands.registerCommand('firebird.editFilter', async (connection: DatabaseConnection, type: string) => {
        const currentFilter = (databaseTreeDataProvider as any).getFilter(connection.id, type);
        
        const inputBox = vscode.window.createInputBox();
        inputBox.value = currentFilter;
        inputBox.placeholder = `Filter ${type}...`;
        inputBox.title = `Filter ${type}`;
        
        inputBox.onDidChangeValue(value => {
            (databaseTreeDataProvider as any).setFilter(connection.id, type, value);
            // We need to trigger a refresh of this specific node.
            // Since getChildren calls getFilter, a refresh of the connection (or folder) is needed.
            // refreshDatabase(connection) refreshes the connection node which covers all folders.
            databaseTreeDataProvider.refreshDatabase(connection);
        });

        inputBox.onDidAccept(() => {
            inputBox.hide();
        });

        inputBox.show();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.clearFilter', async (item: any) => {
        // item is FilterItem. arguments are [connection, type]
        if (item && item.command && item.command.arguments && item.command.arguments.length >= 2) {
             const connection = item.command.arguments[0];
             const type = item.command.arguments[1];
             (databaseTreeDataProvider as any).setFilter(connection.id, type, '');
             databaseTreeDataProvider.refreshDatabase(connection);
        }
    }));

    // --- Favorites Commands ---
    context.subscriptions.push(vscode.commands.registerCommand('firebird.addToFavorites', async (node: any) => {
        if (node instanceof ScriptItem) {
            // Check if connection is present (local script) or use active connection?
            let connectionId = node.connectionId;
            if (!connectionId) {
                // Global script - add to Active Connection's favorites
                const active = databaseTreeDataProvider.getActiveConnection();
                if (active) {
                    connectionId = active.id;
                } else {
                     vscode.window.showWarningMessage('Please activate a database connection to add global scripts to favorities.');
                     return;
                }
            }
            // Add script
            await databaseTreeDataProvider.addFavoriteScript(connectionId!, node.data.id, node.data.name);
        } else if (node instanceof IndexItem) {
            // IndexItem has connection, indexName
            await databaseTreeDataProvider.addFavorite(node.connection, node.indexName, 'index' as any);
        } else if (node && node.connection && node.objectName && node.type) {
             await databaseTreeDataProvider.addFavorite(node.connection, node.objectName, node.type);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.removeFromFavorites', async (node: any) => {
         if (node && node.contextValue === 'favorite-folder') {
             vscode.commands.executeCommand('firebird.deleteFavoriteFolder', node);
             return;
         }

         // Handle favorite items that have a 'data' property (FavoriteItem)
         // This covers index-favorite, script-favorite and others when they are rendered as dedicated items
         if (node && node.data && node.contextValue && (node.contextValue.endsWith('-favorite') || node.contextValue === 'script-favorite' || node.contextValue === 'script-file-favorite')) {
             const label = node.label || node.data.label;
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove '${label}' from favorites?`, { modal: true }, 'Remove');
             if (confirm === 'Remove') {
                 await databaseTreeDataProvider.removeFavoriteItem(node.data);
             }
             return;
         }

         // Fallback/Native toggle (from regular tree view)
         if (node && node.connection && node.objectName && node.type) {
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove '${node.objectName}' from favorites?`, { modal: true }, 'Remove');
             if (confirm === 'Remove') {
                 await databaseTreeDataProvider.removeFavoriteObject(node.connection, node.objectName, node.type);
             }
             return;
         }

         // Script toggle (from regular tree view)
         if (node instanceof ScriptItem && node.isFavorite) {
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove script '${node.data.name}' from favorites?`, { modal: true }, 'Remove');
             if (confirm === 'Remove') {
                 await databaseTreeDataProvider.removeScriptFavorite(node.data.id);
             }
             return;
         }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createFavoriteFolder', async (node: any) => {
        if (node && node.contextValue === 'favorites-root') {
             await databaseTreeDataProvider.createFavoriteFolder(node.connection);
        } else if (node && node.contextValue === 'favorite-folder') {
             await databaseTreeDataProvider.createFavoriteFolder(node.connection, node.data);
        } else {
             const conn = databaseTreeDataProvider.getActiveConnection();
             if (conn) {
                 await databaseTreeDataProvider.createFavoriteFolder(conn);
             }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteFavoriteFolder', async (node: any) => {
         if (node && node.data) {
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete folder '${node.label}'?`, { modal: true }, 'Delete');
             if (confirm === 'Delete') {
                 await databaseTreeDataProvider.deleteFavoriteFolder(node.data);
             }
         }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openFavoriteScript', async (data: any) => {
        if (data && data.scriptId) {
             const service = ScriptService.getInstance();
             let scriptItem = service.getScriptById(data.scriptId);
             
             if (scriptItem) {
                 vscode.commands.executeCommand('firebird.openScript', scriptItem);
             } else {
                 vscode.window.showErrorMessage('Referenced script not found.');
             }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.renameFavoriteFolder', async (node: any) => {
         if (node && node.data) {
             await databaseTreeDataProvider.renameFavoriteFolder(node.data);
         }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.favorites.clear', async (node: any) => {
        let connectionId: string | undefined;

        if (node && node.connection) {
            connectionId = node.connection.id;
        } else {
            const active = databaseTreeDataProvider.getActiveConnection();
            if (active) {
                connectionId = active.id;
            }
        }

        if (connectionId) {
            const confirm = await vscode.window.showWarningMessage('Are you sure you want to clear all favorites for this connection?', { modal: true }, 'Clear All');
            if (confirm === 'Clear All') {
                await databaseTreeDataProvider.clearFavorites(connectionId);
            }
        } else {
            vscode.window.showWarningMessage('No connection selected to clear favorites.');
        }
    }));


    
    } catch (e: any) {
        console.error('Firebird extension activation failed:', e);
        vscode.window.showErrorMessage('Firebird extension activation failed: ' + e.message);
    }
}

export function deactivate() {
    Database.detach(); // Ensures rollback/detach on close
}
