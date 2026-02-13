import * as vscode from 'vscode';
import { Database } from '../database';
import { ResultsPanel } from '../resultsPanel';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { ScriptParser } from '../services/scriptParser';
import { ParameterInjector } from '../services/parameterInjector';
import { QueryExtractor } from '../services/queryExtractor';

export function registerQueryCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.closeResults', () => {
        if (ResultsPanel.currentPanel) {
            ResultsPanel.currentPanel.dispose();
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
            const activeConn = databaseTreeDataProvider.getActiveConnection();
            
            if (!activeConn) {
                vscode.window.showWarningMessage('No active database connection selected. Please select a database.');
                return;
            }

            const activeDetails = databaseTreeDataProvider.getActiveConnectionDetails();
            const contextTitle = activeDetails ? `${activeDetails.group} / ${activeDetails.name}` : 'Unknown';
            
            ResultsPanel.createOrShow(context.extensionUri);
            
            if (ResultsPanel.currentPanel) {
                const config = vscode.workspace.getConfiguration('firebird');
                const useEmptyLineAsSeparator = config.get<boolean>('useEmptyLineAsSeparator', false);
                const statements = ScriptParser.split(query, useEmptyLineAsSeparator);
                if (statements.length === 0) {
                    vscode.window.showWarningMessage('No valid SQL statements found in script.');
                    return;
                }
                await ResultsPanel.currentPanel.runScript(statements, activeConn, contextTitle);

                if (statements.some(stmt => ScriptParser.isDDL(stmt))) {
                    databaseTreeDataProvider.refreshDatabase(activeConn);
                }
            }

            vscode.window.showTextDocument(editor.document, editor.viewColumn, true);
            
        } catch (err: any) {
             const hasTransaction = Database.hasActiveTransaction;
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

        // --- Query Cleanup ---
        let cleanQuery = query.trim();
        
        if (cleanQuery.endsWith(';')) cleanQuery = cleanQuery.slice(0, -1).trim();

        if (editor.document.languageId !== 'sql') {
             const assignmentMatch = /^\$[\w\d_]+\s*=\s*/.exec(cleanQuery);
             if (assignmentMatch) {
                 cleanQuery = cleanQuery.substring(assignmentMatch[0].length).trim();
             }
             
             if ((cleanQuery.startsWith('"') && cleanQuery.endsWith('"')) || 
                 (cleanQuery.startsWith("'") && cleanQuery.endsWith("'"))) {
                 cleanQuery = cleanQuery.substring(1, cleanQuery.length - 1);
            }
        }
        // --- End Query Cleanup ---

        try {
            const activeConn = databaseTreeDataProvider.getActiveConnection();
            
            if (!activeConn) {
                vscode.window.showWarningMessage('No active database connection selected. Please select a database.');
                return;
            }

            const activeDetails = databaseTreeDataProvider.getActiveConnectionDetails();
            const contextTitle = activeDetails ? `${activeDetails.group} / ${activeDetails.name}` : 'Unknown';
            
            ResultsPanel.createOrShow(context.extensionUri);

            cleanQuery = ParameterInjector.inject(cleanQuery);

            if (ResultsPanel.currentPanel) {
                await ResultsPanel.currentPanel.runNewQuery(cleanQuery, activeConn, contextTitle);
            }

            if (ScriptParser.isDDL(cleanQuery)) {
                databaseTreeDataProvider.refreshDatabase(activeConn);
            }

            vscode.window.showTextDocument(editor.document, editor.viewColumn, true);
            
        } catch (err: any) {
             const hasTransaction = Database.hasActiveTransaction;
             
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

             if (ResultsPanel.currentPanel) {
                 ResultsPanel.currentPanel.showError(err.message, hasTransaction);
             } else {
                 vscode.window.showErrorMessage('Error executing query: ' + err.message);
             }
        }
    }));
}
