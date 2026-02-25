import * as vscode from 'vscode';
import { Database } from '../database';
import { resolveConnectionColor, getHeaderHtml } from './templates/headerTemplate';
import { getLoadingHtml } from './templates/loadingTemplate';
import { getResultsPageHtml } from './templates/resultsTemplate';
import { generateRowsHtml } from './templates/contentTemplates';
import { ExportService } from './exportService';

export class ResultsPanel {
    public static currentPanel: ResultsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _lastResults: any[] = [];
    private _allResults: any[] = [];  // All fetched results (for client-side pagination)
    private _useClientSidePagination: boolean = false;
    private _lastMessage: string | undefined;
    private _showButtons: boolean = false;
    private _currentQuery: string | undefined;
    private _displayQuery: string | undefined;
    private _currentConnection: any | undefined;
    private _currentOffset: number = 0;
    private _limit: number = 1000;
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
                        this._loadMore();
                        return;
                    case 'exportCsv':
                        ExportService.exportCsv(this._panel, this._currentQuery, this._currentConnection, message);
                        return;
                }
            },
            null,
            this._disposables
        );
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

    public async runNewQuery(query: string, connection: any, context?: string) {
        this._currentQuery = query;
        this._displayQuery = query;
        this._currentConnection = connection;
        this._currentContext = context;
        this._currentOffset = 0;
        this._limit = vscode.workspace.getConfiguration('firebird').get<number>('maxRows', 1000);
        this._lastResults = [];
        this._lastTransactionAction = undefined;
        this._affectedRows = undefined;
        this._lastExecutionTime = undefined;
        this._hasMore = false; // Reset hasMore
        
        await this._fetchAndDisplay();
    }

    public async runScript(statements: string[], connection: any, context?: string) {
        this._currentConnection = connection;
        this._currentContext = context;
        this._limit = vscode.workspace.getConfiguration('firebird').get<number>('maxRows', 1000);
        this._lastResults = [];
        this._lastTransactionAction = undefined;
        this._affectedRows = undefined;
        this._lastExecutionTime = undefined;

        this.showLoading();
        this._panel.webview.postMessage({ command: 'message', text: 'Executing script...' });

        const total = statements.length;

        if (total === 0) {
            this._displayQuery = undefined;
        } else if (total === 1) {
            this._displayQuery = statements[0];
        } else {
            const getPrefix = (stmt: string) => {
                const trimmed = stmt.trim();
                const firstLine = trimmed.split(/\r?\n/)[0].trim();
                return firstLine.length > 40 ? firstLine.substring(0, 40) : firstLine;
            };
            this._displayQuery = `${getPrefix(statements[0])} ... ${getPrefix(statements[total - 1])}`;
        }

        let executedCount = 0;

        try {
            for (let i = 0; i < total; i++) {
                const stmt = statements[i];
                this._currentQuery = stmt;
                
                if (i === total - 1) {
                     this._currentOffset = 0;
                     await this._fetchAndDisplay();
                } else {
                    await Database.executeQuery(stmt, connection, { limit: 1000, offset: 0 }); 
                }
                executedCount++;
            }
        } catch (err: any) {
            const hasTransaction = Database.hasActiveTransaction;
            this.showError(`Script error at statement ${executedCount + 1}: ${err.message}`, hasTransaction);
        }
    }

    private async _loadMore() {
        this._currentOffset += this._limit;
        try {
            if (this._useClientSidePagination) {
                const startIndex = this._currentOffset;
                const endIndex = this._currentOffset + this._limit;
                const newRows = this._allResults.slice(startIndex, endIndex);
                const hasMore = endIndex < this._allResults.length;
                this._lastResults = this._allResults.slice(0, endIndex);
                this._appendRowsToWebview(newRows, startIndex, hasMore);
            } else {
                await this._fetchAndDisplay(true);
            }
        } catch (e) {
            console.error('Load more failed', e);
        }
    }

    private _appendRowsToWebview(newRows: any[], startIndex: number, hasMore: boolean) {
        const config = vscode.workspace.getConfiguration('firebird');
        const locale = this._currentConnection?.resultLocale || config.get<string>('resultLocale', 'en-US');
        
        const rowsHtml = generateRowsHtml(newRows, startIndex, locale);

        const rowCount = this._lastResults.length;
        let rowsText = '';
        if (hasMore) {
             rowsText = `First ${rowCount} rows fetched`;
        } else {
             rowsText = `${rowCount} rows fetched`;
        }
        if (this._affectedRows !== undefined && this._affectedRows >= 0) {
             rowsText += `, ${this._affectedRows} affected`;
        }
        
        this._panel.webview.postMessage({
            command: 'appendRows',
            rowsHtml: rowsHtml,
            hasMore: hasMore,
            rowsText: rowsText
        });
    }

    private async _fetchAndDisplay(append: boolean = false) {
        if (!this._currentQuery) return;

        const start = performance.now();
        try {
            if (!append) {
                this.showLoading();
            }

            const queryResult = await Database.executeQuery(this._currentQuery, this._currentConnection, {
                limit: this._limit,
                offset: this._currentOffset
            });
            const results = queryResult.rows;
            const affectedRows = queryResult.affectedRows;
            const hasMore = queryResult.hasMore || false;

            const end = performance.now();
            if (!append) {
                this._lastExecutionTime = (end - start) / 1000;
            }
            const hasTransaction = Database.hasActiveTransaction;

            this._useClientSidePagination = false; // Disable client-side pagination, now using true incremental fetch
            
            let displayResults: any[];
            
            if (append) {
                this._lastResults = [...this._lastResults, ...results];
                displayResults = results; // Use newly fetched results for append
            } else {
                this._allResults = [];
                this._lastResults = results;
                displayResults = results;
            }
            
            if (!append) {
                 this._lastResults = displayResults;
            }
            
            if (append) {
                 this._appendRowsToWebview(displayResults, this._currentOffset, hasMore);
            } else if (displayResults.length > 0 || (affectedRows !== undefined && affectedRows >= 0)) {
                 this._updateContentForTable(displayResults, hasTransaction, undefined, hasMore, affectedRows);
            } else {
                 this._updateContentForTable([], hasTransaction, undefined, false, undefined);
            }

        } catch (err: any) {
            const end = performance.now();
            if (!append) {
                this._lastExecutionTime = (end - start) / 1000;
            }
            const hasTransaction = Database.hasActiveTransaction;
            this.showError(err.message, hasTransaction);
            throw err;
        }
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
