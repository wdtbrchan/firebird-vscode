import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { Database } from '../database';
import { resolveConnectionColor, getHeaderHtml } from './templates/headerTemplate';
import { getLoadingHtml } from './templates/loadingTemplate';
import { getResultsPageHtml } from './templates/resultsTemplate';
import { generateRowsHtml } from './templates/contentTemplates';

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
                        this._exportCsv(message);
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

        let executedCount = 0;
        const total = statements.length;

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

    private async _exportCsv(message: any) {
        const delimiter: string = message.delimiter || ';';
        const qualifier: string = message.qualifier || '"';
        const encoding: string = message.encoding || 'UTF8';
        const filename: string = message.filename || 'export.csv';

        if (!this._currentQuery || !this._currentConnection) {
            vscode.window.showWarningMessage('No query to export.');
            return;
        }

        const connection = this._currentConnection;
        const config = vscode.workspace.getConfiguration('firebird');
        const encodingConf = connection.charset || config.get<string>('charset', 'UTF8');

        // Notify webview: Executing query
        this._panel.webview.postMessage({ command: 'csvExportStatus', status: 'Executing query...' });

        try {
            const Firebird = require('node-firebird');
            const { prepareQueryBuffer, processResultRows } = require('../database/encodingUtils');
            const options = {
                host: connection.host,
                port: connection.port,
                database: connection.database,
                user: connection.user,
                password: connection.password,
                role: connection.role,
                encoding: 'NONE',
                lowercase_keys: false
            };

            const allRows: any[] = await new Promise((resolve, reject) => {
                Firebird.attach(options, (err: any, db: any) => {
                    if (err) return reject(err);

                    const cleanQuery = this._currentQuery!.trim().replace(/;$/, '');
                    const queryString = prepareQueryBuffer(cleanQuery, encodingConf);
                    const batchSize = 500;

                    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err: any, tr: any) => {
                        if (err) {
                            try { db.detach(); } catch(e) {}
                            return reject(err);
                        }

                        const trAny = tr as any;
                        trAny.newStatement(queryString, (err: any, stmt: any) => {
                            if (err) {
                                try { tr.rollback(() => db.detach()); } catch(e) {}
                                return reject(err);
                            }

                            stmt.execute(tr, [], (err: any, _result: any, _output: any, isSelect: boolean) => {
                                if (err) {
                                    try { stmt.close(); tr.rollback(() => db.detach()); } catch(e) {}
                                    return reject(err);
                                }

                                if (isSelect === undefined) {
                                    isSelect = (stmt.type === 1);
                                }
                                if (!isSelect) {
                                    try { stmt.close(); tr.rollback(() => db.detach()); } catch(e) {}
                                    return reject(new Error('Query does not return rows.'));
                                }

                                const collected: any[] = [];
                                const fetchBatch = () => {
                                    stmt.fetch(tr, batchSize, async (err: any, ret: any) => {
                                        if (err) {
                                            try { stmt.close(); tr.rollback(() => db.detach()); } catch(e) {}
                                            return reject(err);
                                        }

                                        try {
                                            const processed = await processResultRows(ret.data || [], encodingConf);
                                            collected.push(...processed);

                                            // Report progress
                                            this._panel.webview.postMessage({ 
                                                command: 'csvExportStatus', 
                                                status: `Fetching rows... ${collected.length}` 
                                            });

                                            const hasMore = !ret.fetched && (ret.data?.length === batchSize);
                                            if (hasMore) {
                                                fetchBatch();
                                            } else {
                                                // Done fetching
                                                try { stmt.close(); tr.rollback(() => db.detach()); } catch(e) {}
                                                resolve(collected);
                                            }
                                        } catch (readErr) {
                                            try { stmt.close(); tr.rollback(() => db.detach()); } catch(e) {}
                                            reject(readErr);
                                        }
                                    });
                                };
                                fetchBatch();
                            }, { asObject: true });
                        });
                    });
                });
            });

            if (allRows.length === 0) {
                this._panel.webview.postMessage({ command: 'csvExportStatus', status: '' });
                vscode.window.showWarningMessage('No data to export.');
                return;
            }

            // Generate CSV
            const columns = Object.keys(allRows[0]);
            const escapeValue = (val: any): string => {
                if (val === null || val === undefined) return '';
                if (val instanceof Uint8Array) return '[Blob]';
                const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                const escaped = str.replace(new RegExp(qualifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), qualifier + qualifier);
                return `${qualifier}${escaped}${qualifier}`;
            };

            const headerLine = columns.map(col => escapeValue(col)).join(delimiter);
            const dataLines = allRows.map(row => {
                return columns.map(col => escapeValue(row[col])).join(delimiter);
            });
            const csvContent = [headerLine, ...dataLines].join('\n');

            // Clear status
            this._panel.webview.postMessage({ command: 'csvExportStatus', status: '' });

            // Show save dialog
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(filename),
                filters: { 'CSV Files': ['csv'], 'All Files': ['*'] },
                saveLabel: 'Export'
            });

            if (!uri) return;

            // Encode with iconv-lite
            let fileBuffer: Buffer;
            if (iconv.encodingExists(encoding)) {
                fileBuffer = iconv.encode(csvContent, encoding);
            } else {
                fileBuffer = Buffer.from(csvContent, 'utf8');
            }

            await vscode.workspace.fs.writeFile(uri, fileBuffer);
            vscode.window.showInformationMessage(`CSV exported: ${allRows.length} rows → ${uri.fsPath}`);

        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'csvExportStatus', status: `Error: ${err.message}` });
            vscode.window.showErrorMessage(`Export failed: ${err.message}`);
        }
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
