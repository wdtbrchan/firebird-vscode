import * as vscode from 'vscode';
import { Database } from '../database';
import { ResultsPanel } from '../resultsPanel';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { ScriptParser } from '../services/scriptParser';
import { ParameterInjector } from '../services/parameterInjector';
import { QueryExtractor } from '../services/queryExtractor';
import { ExecutionService } from '../services/executionService';
import { ExportService } from '../resultsPanel/exportService';
import { ExportConfigPanel } from '../resultsPanel/exportConfigPanel';
import { cleanQueryForExecution } from './queryCleanup';

export function registerQueryCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.closeResults', () => {
        const editor = vscode.window.activeTextEditor;
        const id = editor ? editor.document.uri.toString() : 'global';
        const panel = ResultsPanel.panels.get(id);
        if (panel) {
            panel.dispose();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.executeScript', async (script?: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor && !script) {
            vscode.window.showErrorMessage('No active text editor');
            return;
        }

        const query = script || (editor ? editor.document.getText() : '');
        
        if (!query.trim()) {
             vscode.window.showWarningMessage('Script is empty.');
             return;
        }

        try {
            const activeConn = databaseTreeDataProvider.connectionManager.getActiveConnection();
            
            if (!activeConn) {
                vscode.window.showWarningMessage('No active database connection selected. Please select a database.');
                return;
            }

            const activeDetails = databaseTreeDataProvider.connectionManager.getActiveConnectionDetails();
            const contextTitle = activeDetails ? `${activeDetails.group} / ${activeDetails.name}` : 'Unknown';
            
            const id = editor ? editor.document.uri.toString() : 'global';
            await ResultsPanel.createOrShow(context.extensionUri, id);
            
            const panel = ResultsPanel.panels.get(id);
            if (panel) {
                const config = vscode.workspace.getConfiguration('firebird');
                const useEmptyLineAsSeparator = config.get<boolean>('useEmptyLineAsSeparator', false);
                const statements = ScriptParser.split(query, useEmptyLineAsSeparator);
                if (statements.length === 0) {
                    vscode.window.showWarningMessage('No valid SQL statements found in script.');
                    return;
                }
                await ExecutionService.getInstance(id).executeScript(statements, activeConn, contextTitle);

                if (statements.some(stmt => ScriptParser.isDDL(stmt))) {
                    databaseTreeDataProvider.refreshItem(activeConn);
                }
            }

            if (editor) {
                vscode.window.showTextDocument(editor.document, editor.viewColumn, true);
            }
            
        } catch (err: any) {
             const id = editor ? editor.document.uri.toString() : 'global';
             const hasTransaction = Database.hasActiveTransaction(id);
             
             if (hasTransaction) {
                 try {
                     await Database.rollback(id, 'Error executing script');
                 } catch (e) {
                     console.error('Failed to rollback transaction on script error', e);
                 }
             }

             const panel = ResultsPanel.panels.get(id);
             if (panel) {
                 panel.showError(err.message, false);
             }
             vscode.window.showErrorMessage('Error executing script: ' + err.message, { modal: true });
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.runQuery', async () => {
        await handleQueryExecution(context, databaseTreeDataProvider, false);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.getPlan', async () => {
        await handleQueryExecution(context, databaseTreeDataProvider, true);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.exportQueryToCsv', async () => {
        await handleExportQueryToCsv(context, databaseTreeDataProvider);
    }));
}

async function handleQueryExecution(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider,
    isPlan: boolean
) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor');
        return;
    }

    const config = vscode.workspace.getConfiguration('firebird');
    const allowedLanguages = config.get<string[]>('allowedLanguages', ['sql']);
    if (!allowedLanguages.includes(editor.document.languageId)) {
        vscode.window.showInformationMessage(`Firebird: Execution not enabled for language '${editor.document.languageId}'. Check 'firebird.allowedLanguages' setting.`);
        return;
    }

    const selection = editor.selection;
    let query = '';
    let queryStartLine = 0;
    let queryStartChar = 0;

    const useEmptyLineAsSeparator = config.get<boolean>('useEmptyLineAsSeparator', false);

    if (selection.isEmpty) {
         const offset = editor.document.offsetAt(selection.active);
         const result = QueryExtractor.extract(editor.document.getText(), offset, editor.document.languageId, useEmptyLineAsSeparator);
         
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

    let cleanQuery = cleanQueryForExecution(query, editor.document.languageId);

    try {
        const activeConn = databaseTreeDataProvider.connectionManager.getActiveConnection();
        
        if (!activeConn) {
            vscode.window.showWarningMessage('No active database connection selected. Please select a database.');
            return;
        }

        const activeDetails = databaseTreeDataProvider.connectionManager.getActiveConnectionDetails();
        const contextTitle = activeDetails ? `${activeDetails.group} / ${activeDetails.name}` : 'Unknown';
        
        const id = editor.document.uri.toString();
        await ResultsPanel.createOrShow(context.extensionUri, id);

        cleanQuery = ParameterInjector.inject(cleanQuery);

        const panel = ResultsPanel.panels.get(id);
        if (panel) {
            if (isPlan) {
                await ExecutionService.getInstance(id).explainQuery(cleanQuery, activeConn, contextTitle);
            } else {
                await ExecutionService.getInstance(id).executeNewQuery(cleanQuery, activeConn, contextTitle);
            }
        }

        if (ScriptParser.isDDL(cleanQuery) && !isPlan) {
            databaseTreeDataProvider.refreshItem(activeConn);
        }

        vscode.window.showTextDocument(editor.document, editor.viewColumn, true);
        
    } catch (err: any) {
         const id = editor.document.uri.toString();
         const hasTransaction = Database.hasActiveTransaction(id);
         
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
                
                vscode.window.showTextDocument(editor.document, editor.viewColumn);
             } catch (e) {
                 console.error('Failed to move cursor to error', e);
             }
         }

         const panel = ResultsPanel.panels.get(id);
         if (panel) {
             panel.showError(err.message, false);
         }
         
         if (hasTransaction) {
             try {
                 await Database.rollback(id, 'Error executing query');
             } catch (e) {
                 console.error('Failed to rollback transaction on query error', e);
             }
         }
         
         vscode.window.showErrorMessage('Error executing query: ' + err.message, { modal: true });
    }
}

async function handleExportQueryToCsv(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor');
        return;
    }

    const config = vscode.workspace.getConfiguration('firebird');
    const allowedLanguages = config.get<string[]>('allowedLanguages', ['sql']);
    if (!allowedLanguages.includes(editor.document.languageId)) {
        vscode.window.showInformationMessage(`Firebird: Execution not enabled for language '${editor.document.languageId}'. Check 'firebird.allowedLanguages' setting.`);
        return;
    }

    const selection = editor.selection;
    let query = '';
    const useEmptyLineAsSeparator = config.get<boolean>('useEmptyLineAsSeparator', false);

    if (selection.isEmpty) {
         const offset = editor.document.offsetAt(selection.active);
         const result = QueryExtractor.extract(editor.document.getText(), offset, editor.document.languageId, useEmptyLineAsSeparator);
         if (result) query = result.text;
    } else {
         query = editor.document.getText(selection);
    }

    if (!query || !query.trim()) {
         vscode.window.showWarningMessage('No query selected or found.');
         return;
    }

    let cleanQuery = cleanQueryForExecution(query, editor.document.languageId);
    cleanQuery = ParameterInjector.inject(cleanQuery);

    const activeConn = databaseTreeDataProvider.connectionManager.getActiveConnection();
    if (!activeConn) {
        vscode.window.showWarningMessage('No active database connection selected. Please select a database.');
        return;
    }

    ExportConfigPanel.show(context.extensionUri, cleanQuery, activeConn);
}

