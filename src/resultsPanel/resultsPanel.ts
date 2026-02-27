import * as vscode from 'vscode';
import { Database } from '../database';
import { resolveConnectionColor, getHeaderHtml } from './templates/headerTemplate';
import { getLoadingHtml } from './templates/loadingTemplate';
import { getResultsPageHtml } from './templates/resultsTemplate';
import { generateRowsHtml } from './templates/contentTemplates';
import { ExportService } from './exportService';
import { ExecutionService } from '../services/executionService';
import { DatabaseConnection } from '../database/types';

export class ResultsPanel {
    public static currentPanel: ResultsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _lastResults: any[] = [];
    private _lastMessage: string | undefined;
    private _showButtons: boolean = false;
    private _currentQuery: string | undefined;
    private _displayQuery: string | undefined;
    private _currentConnection: DatabaseConnection | undefined;
    private _currentContext: string | undefined;
    private _currentAutoRollbackAt: number | undefined;
    private _lastExecutionTime: number | undefined;
    private _lastTransactionAction: string | undefined;
    private _lastContext: string | undefined;
    private _lastIsError: boolean = false;
    private _isLoading: boolean = false;
    private _hasMore: boolean = false;
    private _affectedRows: number | undefined;
    private _startTime: number | undefined;


    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Expose view state change
        this._panel.onDidChangeViewState(e => {
            vscode.commands.executeCommand('firebird.refreshThemeColors', this._panel.active);
        }, null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'commit':
                        vscode.commands.executeCommand('firebird.commit');
                        return;
                    case 'rollback':
                        vscode.commands.executeCommand('firebird.rollback');
                        return;
                    case 'loadMore':
                        ExecutionService.getInstance().loadMore();
                        return;
                    case 'exportCsv':
                        ExportService.exportCsv(this._panel, this._currentQuery, this._currentConnection, message);
                        return;
                }
            },
            null,
            this._disposables
        );

        const execService = ExecutionService.getInstance();
        execService.onStart(() => this.showLoading(), this, this._disposables);
        execService.onMessage(e => this._panel.webview.postMessage({ command: 'message', text: e.text }), this, this._disposables);
        execService.onError(e => this.showError(e.message, e.hasTransaction), this, this._disposables);
        execService.onSuccessMessage(e => this.showSuccess(e.message, e.hasTransaction), this, this._disposables);
        execService.onData(e => {
            this._currentQuery = e.query;
            this._displayQuery = e.displayQuery;
            this._currentConnection = e.connection;
            this._currentContext = e.context;
            this._lastExecutionTime = e.executionTime;
            
            if (e.append) {
                this._appendRowsToWebview(e.results, this._lastResults.length, e.hasMore, e.affectedRows);
                this._lastResults = [...this._lastResults, ...e.results];
            } else if (e.results.length > 0 || (e.affectedRows !== undefined && e.affectedRows >= 0)) {
                this._updateContentForTable(e.results, e.hasTransaction, e.context, e.hasMore, e.affectedRows);
            } else {
                this._updateContentForTable([], e.hasTransaction, e.context, false, undefined);
            }
        }, this, this._disposables);

        this._updateContentForTable([], false);
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : undefined;

        if (ResultsPanel.currentPanel) {
            ResultsPanel.currentPanel._panel.reveal(column, true);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'firebirdResults',
            'Query Results',
            { viewColumn: column || vscode.ViewColumn.Two, preserveFocus: true },
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        ResultsPanel.currentPanel = new ResultsPanel(panel, extensionUri);
    }

    public showLoading() {
        this._isLoading = true;
        this._startTime = Date.now();
        
        const connectionColor = resolveConnectionColor(this._currentConnection?.color);
        const contextTitle = this._currentContext || 'Unknown Database';
        const headerHtml = getHeaderHtml(contextTitle, connectionColor);

        this._panel.webview.html = getLoadingHtml(headerHtml, this._startTime);
    }

    public showSuccess(message: string, hasTransaction: boolean, context?: string) {
        this._isLoading = false;
        this._lastIsError = false;
        this._lastMessage = message;
        this._showButtons = hasTransaction;
        this._lastContext = context || this._currentContext;
        this._panel.webview.html = this._getHtmlForWebview([], message, hasTransaction, false, this._lastContext);
    }

    public showError(message: string, hasTransaction: boolean, context?: string) {
        this._isLoading = false;
        this._lastIsError = true;
        this._lastMessage = message;
        this._showButtons = hasTransaction;
        this._lastContext = context || this._currentContext;
        this._panel.webview.html = this._getHtmlForWebview([], message, hasTransaction, true, this._lastContext);
    }



    private _appendRowsToWebview(newRows: any[], startIndex: number, hasMore: boolean, affectedRows?: number) {
        const config = vscode.workspace.getConfiguration('firebird');
        const locale = this._currentConnection?.resultLocale || config.get<string>('resultLocale', 'en-US');
        
        const rowsHtml = generateRowsHtml(newRows, startIndex, locale);

        const rowCount = this._lastResults.length;
        let rowsText: string;
        if (hasMore) {
             rowsText = `First ${rowCount} rows fetched`;
        } else {
             rowsText = `${rowCount} rows fetched`;
        }
        if (affectedRows !== undefined && affectedRows >= 0) {
             rowsText += `, ${affectedRows} affected`;
        }
        
        this._panel.webview.postMessage({
            command: 'appendRows',
            rowsHtml: rowsHtml,
            hasMore: hasMore,
            rowsText: rowsText
        });
    }



    private _updateContentForTable(results: any[], hasTransaction: boolean, context?: string, hasMore: boolean = false, affectedRows?: number) {
         this._isLoading = false;
         this._lastResults = results;
         this._lastMessage = undefined;
         this._lastTransactionAction = undefined;
         this._showButtons = hasTransaction;
         this._lastIsError = false;
         if (context) this._lastContext = context;
         else this._lastContext = this._currentContext;
        
         this._affectedRows = affectedRows;
         this._panel.webview.html = this._getHtmlForWebview(results, undefined, hasTransaction, false, this._lastContext, hasMore, undefined, affectedRows);
    }

    public update(results: any[], hasTransaction: boolean, context?: string) {
        this._updateContentForTable(results, hasTransaction, context, false);
    }

    public setTransactionStatus(hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) {
        this._showButtons = hasTransaction;
        this._currentAutoRollbackAt = autoRollbackAt;
        
        if (lastAction) {
             this._lastTransactionAction = lastAction;
        }

        if (this._isLoading) {
            return;
        }

        // instead of setting webview.html, we update only the transaction section to preserve scroll
        this._panel.webview.postMessage({
             command: 'updateTransaction',
             hasTransaction: hasTransaction,
             autoRollbackAt: autoRollbackAt,
             lastAction: lastAction || this._lastTransactionAction
        });
    }

    private _getHtmlForWebview(results: any[], message: string | undefined, showButtons: boolean, isError: boolean, context: string | undefined, hasMore?: boolean, transactionAction?: string, affectedRows?: number): string {
        this._hasMore = hasMore || false;

        const config = vscode.workspace.getConfiguration('firebird');
        const locale = this._currentConnection?.resultLocale || config.get<string>('resultLocale', 'en-US');

        return getResultsPageHtml({
            results,
            message,
            showButtons,
            isError,
            context,
            hasMore: this._hasMore,
            transactionAction,
            affectedRows,
            currentQuery: this._currentQuery,
            displayQuery: this._displayQuery,
            currentConnection: this._currentConnection,
            lastExecutionTime: this._lastExecutionTime,
            autoRollbackAt: this._currentAutoRollbackAt || 0,
            locale,
        });
    }

    public get isPanelActive(): boolean {
        return this._panel.active;
    }

    public get connectionColor(): string | undefined {
        return this._currentConnection?.color;
    }


    public dispose() {
        if (Database.hasActiveTransaction) {
            Database.rollback('Rolled back due to panel close').then(() => {
                vscode.window.showInformationMessage('Active transaction was rolled back because the results window was closed.');
            });
        }
        ResultsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
