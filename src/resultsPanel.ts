import * as vscode from 'vscode';
import { Database } from './db';

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
            ResultsPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'firebirdResults',
            'Query Results',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        ResultsPanel.currentPanel = new ResultsPanel(panel, extensionUri);
    }

    private _getHeaderHtml(contextTitle: string, connectionColor: string): string {
        const bgStyle = connectionColor ? `background-color: ${connectionColor}; color: #fff;` : `background-color: #444; color: #fff;`;
        
        return `
            <div class="header-container" style="${bgStyle}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="db-icon">
                        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1c-3.87 0-7 1.34-7 3v8c0 1.66 3.13 3 7 3s7-1.34 7-3V4c0-1.66-3.13-3-7-3zm0 2c3.31 0 6 1.12 6 2.5S11.31 8 8 8s-6-1.12-6-2.5S4.69 3 8 3z"/></svg>
                    </div>
                    <div style="font-size: 0.9em; font-weight: 700;">${contextTitle}</div>
                </div>
            </div>
        `;
    }

    public showLoading() {
        this._isLoading = true;
        this._startTime = Date.now();
        
        let connectionColor = '';
        if (this._currentConnection && this._currentConnection.color) {
            switch (this._currentConnection.color) {
                case 'red': connectionColor = '#F14C4C'; break;
                case 'orange': connectionColor = '#d18616'; break;
                case 'yellow': connectionColor = '#CCA700'; break;
                case 'green': connectionColor = '#37946e'; break;
                case 'blue': connectionColor = '#007acc'; break;
                case 'purple': connectionColor = '#652d90'; break;
            }
        }
        
        const contextTitle = this._currentContext || 'Unknown Database';
        const headerHtml = this._getHeaderHtml(contextTitle, connectionColor);

        this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    margin: 0 !important;
                    padding: 0 !important;
                    background-color: transparent;
                    color: #fff;
                    overflow: hidden;
                }
                .header-container {
                     width: 100%;
                     box-sizing: border-box;
                     padding: 0; 
                     display: flex; 
                     align-items: center; 
                     height: 32px; 
                     flex-shrink: 0;
                }
                .db-icon { display: flex; align-items: center; margin: 0 8px 0 15px; }
                .executing-bar {
                    width: 100%;
                    box-sizing: border-box;
                    background-color: #1e7e34;
                    color: #fff;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-weight: bold;
                    flex-shrink: 0;
                    min-height: 60px;
                }
                .executing-bar > div { margin-left: 15px; }
                .executing-bar > span { margin-right: 15px; }
                .spinner {
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    border-top: 2px solid #ffffff;
                    width: 14px;
                    height: 14px;
                    animation: spin 1s linear infinite;
                    margin-right: 10px;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            ${headerHtml}
            <div class="executing-bar">
                <div style="display: flex; align-items: center;">
                    <div class="spinner"></div>
                    <span>Executing...</span>
                </div>
                <span id="executing-timer">0.0s</span>
            </div>
            <div style="flex-grow: 1;"></div>
            <script>
                (function() {
                    const startTime = ${this._startTime};
                    const timerEl = document.getElementById('executing-timer');
                    
                    if (timerEl) {
                        function update() {
                            const now = Date.now();
                            const diff = ((now - startTime) / 1000).toFixed(1);
                            timerEl.textContent = diff + 's';
                        }
                        setInterval(update, 100);
                        update(); 
                    }
                })();
            </script>
        </body>
        </html>`;
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
        
        const columns = newRows.length > 0 ? Object.keys(newRows[0]) : [];
        const rowsHtml = newRows.map((row, idx) => {
            const rowIndex = startIndex + idx + 1;
            const cells = columns.map(col => {
                let val = row[col];
                if (val === null) {
                    val = '<span class="null-value">[NULL]</span>';
                } else if (val instanceof Uint8Array) {
                    val = '[Blob]';
                } else if (typeof val === 'number') {
                    if (!Number.isInteger(val)) {
                        try { val = val.toLocaleString(locale); } catch (e) { val = val.toString(); }
                    } else {
                        val = val.toString();
                    }
                } else if (val instanceof Date) {
                    try { val = val.toLocaleString(locale); } catch (e) { val = val.toString(); }
                } else if (typeof val === 'object' && val !== null) {
                    val = JSON.stringify(val);
                }
                return `<td>${val}</td>`;
            }).join('');
            return `<tr><td class="row-index">${rowIndex}</td>${cells}</tr>`;
        }).join('');

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

            const end = performance.now();
            if (!append) {
                this._lastExecutionTime = (end - start) / 1000;
            }
            const hasTransaction = Database.hasActiveTransaction;

            this._useClientSidePagination = !append && results.length > this._limit;
            
            let displayResults: any[];
            let hasMore: boolean;
            
            if (this._useClientSidePagination) {
                this._allResults = results;
                displayResults = results.slice(0, this._limit);
                hasMore = results.length > this._limit;
            } else if (append) {
                this._lastResults = [...this._lastResults, ...results];
                displayResults = results; // Use newly fetched results for append
                hasMore = results.length === this._limit;
            } else {
                this._allResults = [];
                this._lastResults = results;
                displayResults = results;
                hasMore = results.length === this._limit;
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
        
        // --- 1. Top Bar Logic ---
        let connectionColor = '';
        if (this._currentConnection && this._currentConnection.color) {
            switch (this._currentConnection.color) {
                case 'red': connectionColor = '#F14C4C'; break;
                case 'orange': connectionColor = '#d18616'; break;
                case 'yellow': connectionColor = '#CCA700'; break;
                case 'green': connectionColor = '#37946e'; break;
                case 'blue': connectionColor = '#007acc'; break;
                case 'purple': connectionColor = '#652d90'; break;
            }
        }
        const contextTitle = context || 'Unknown Database';
        const headerHtml = this._getHeaderHtml(contextTitle, connectionColor);

        // --- 2. Info Bar Logic (Left 2/3 & Right 1/3) ---
        let firstLineQuery = '';
        if (this._currentQuery) {
            const cleanQuery = this._currentQuery.replace(/\s+/g, ' ').trim();
            firstLineQuery = cleanQuery.length > 80 ? cleanQuery.substring(0, 80) + '...' : cleanQuery;
        } else if (message) {
            firstLineQuery = message.substring(0, 80) + '...';
        }

        const timeText = this._lastExecutionTime !== undefined ? `${this._lastExecutionTime.toFixed(3)}s` : '-';
        
        let rowsText = '';
        const rowCount = results ? results.length : 0;
        if (hasMore) {
             rowsText = `First ${rowCount} rows fetched`;
        } else {
             rowsText = `${rowCount} rows fetched`;
        }
        if (affectedRows !== undefined && affectedRows >= 0) {
             rowsText += `, ${affectedRows} affected`;
        }

        // Right 1/3: Buttons or Status
        let rightSectionHtml = '<div id="transaction-area" style="width:100%; height:100%; display:flex;">';
        
        if (showButtons) {
            // Active Transaction -> Bold Icon Buttons
            rightSectionHtml += `
                <div class="transaction-buttons">
                    <button class="btn-block rollback" onclick="rollback()" title="ROLLBACK" style="position: relative;">
                        <svg viewBox="0 0 16 16" width="28" height="28" fill="currentColor"><path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" stroke="currentColor" stroke-width="2"/></svg>
                        <span id="rollbackTimer" style="font-size: 10px; position: absolute; bottom: 4px; left: 0; right: 0; text-align: center;"></span>
                    </button>
                    <button class="btn-block commit" onclick="commit()" title="COMMIT">
                        <svg viewBox="0 0 16 16" width="28" height="28" fill="currentColor"><path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z" stroke="currentColor" stroke-width="2"/></svg>
                    </button>
                </div>
            `;
        } else if (transactionAction) {
             // Finished Transaction -> Status
             let statusColor = '#666'; 
             let icon = '';
             if (transactionAction.toLowerCase().includes('committed')) {
                 statusColor = '#1e7e34'; // Green
                 icon = '✓';
             } else if (transactionAction.toLowerCase().includes('roll')) {
                 statusColor = '#8b0000'; // Red
                 icon = '✗';
             }
             
             rightSectionHtml += `
                <div class="transaction-status" style="background-color: ${statusColor};">
                    <span style="font-size: 1.2em; margin-right: 8px;">${icon}</span>
                    <span style="font-weight: 600;">${transactionAction}</span>
                </div>
             `;
        } else {
            // Empty right section if no transaction state
            rightSectionHtml += '<div class="transaction-placeholder"></div>';
        }
        rightSectionHtml += '</div>';

        const infoBarHtml = `
            <div class="info-bar">
                <div class="info-left">
                    <div class="info-row query" title="${this._currentQuery || ''}">${firstLineQuery}</div>
                    <div class="info-row stats">
                        <span class="badged">Time: ${timeText}</span>
                        <span class="badged" id="stats-rows">${rowsText}</span>
                    </div>
                </div>
                <div class="info-right">
                    ${rightSectionHtml}
                </div>
            </div>
        `;

        // --- 3. Content Area (Error or Results) ---
        let contentHtml = '';
        
        if (isError && message) {
             contentHtml = `
                <div class="error-container">
                    <div class="error-icon">⚠</div>
                    <div class="error-content">
                        <div class="error-title">Execution Error</div>
                        <div class="error-message">${message}</div>
                    </div>
                </div>
             `;
        } else {
             // Results Table or Empty Message
             if (!results || results.length === 0) {
                 const bannerStyle = connectionColor ? `background-color: ${connectionColor}; color: #fff;` : `background-color: #666; color: #fff;`;
                 if (affectedRows !== undefined && affectedRows >= 0) {
                     contentHtml = `
                        <div style="width: 100%; padding: 15px 20px; box-sizing: border-box; ${bannerStyle}">
                            <div style="font-size: 1.1em; font-style: italic;">No rows returned.</div>
                            ${affectedRows > 0 ? `<div style="margin-top: 5px; font-weight: bold;">${affectedRows} rows affected.</div>` : ''}
                        </div>
                     `;
                 } else {
                     contentHtml = `
                        <div style="width: 100%; padding: 15px 20px; box-sizing: border-box; ${bannerStyle}">
                            <div style="font-size: 1.1em; font-style: italic;">No rows returned.</div>
                        </div>
                     `;
                 }
             } else {
                 // Table
                const columns = Object.keys(results[0]);
                const headerRow = '<th></th>' + columns.map(col => `<th>${col}</th>`).join('');
                const config = vscode.workspace.getConfiguration('firebird');
                const locale = this._currentConnection?.resultLocale || config.get<string>('resultLocale', 'en-US');

                const rowsHtml = results.map((row, index) => {
                    const cells = columns.map(col => {
                        let val = row[col];
                        if (val === null) val = '<span class="null-value">[NULL]</span>';
                        else if (val instanceof Uint8Array) val = '[Blob]';
                        else if (typeof val === 'number') {
                             if (!Number.isInteger(val)) {
                                 try { val = val.toLocaleString(locale); } catch (e) { val = val.toString(); }
                             } else {
                                 val = val.toString();
                             }
                        } else if (val instanceof Date) {
                             try { val = val.toLocaleString(locale); } catch (e) { val = val.toString(); }
                        } else if (typeof val === 'object') {
                             val = JSON.stringify(val);
                        }
                        return `<td>${val}</td>`;
                    }).join('');
                    return `<tr><td class="row-index">${index + 1}</td>${cells}</tr>`;
                }).join('');

                contentHtml = `
                    <div class="table-container">
                        <table>
                            <thead><tr>${headerRow}</tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                        ${hasMore ? `<div class="load-more-container"><button id="loadMoreBtn" onclick="loadMore()">Load More Results</button></div>` : ''}
                    </div>
                `;
             }
        }


        // --- Scripts ---
        const scripts = `
            const vscode = acquireVsCodeApi();
            function commit() { vscode.postMessage({ command: 'commit' }); }
            function rollback() { vscode.postMessage({ command: 'rollback' }); }
            function loadMore() { 
                const btn = document.getElementById('loadMoreBtn');
                if(btn) {
                    btn.innerText = 'Loading...';
                    btn.disabled = true;
                }
                vscode.postMessage({ command: 'loadMore' }); 
            }
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'appendRows') {
                    const tbody = document.querySelector('tbody');
                    if(tbody) tbody.insertAdjacentHTML('beforeend', message.rowsHtml);
                    
                    const btn = document.getElementById('loadMoreBtn');
                    if (btn) {
                        btn.disabled = false;
                        if (message.hasMore) btn.innerText = 'Load More Results';
                        else btn.parentElement.remove();
                    }

                    // Update stats in info bar
                    const statsSpan = document.getElementById('stats-rows');
                    if (statsSpan) {
                         statsSpan.innerText = message.rowsText;
                    }

                    const contentArea = document.querySelector('.content-area');
                    if (contentArea) {
                        contentArea.scrollBy({ top: 50, behavior: 'smooth' });
                    }
                }

                if (message.command === 'updateTransaction') {
                    const area = document.getElementById('transaction-area');
                    if (area) {
                        if (message.hasTransaction) {
                            area.innerHTML = \`
                                <div class="transaction-buttons">
                                    <button class="btn-block rollback" onclick="rollback()" title="ROLLBACK" style="position: relative;">
                                        <svg viewBox="0 0 16 16" width="28" height="28" fill="currentColor"><path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" stroke="currentColor" stroke-width="2"/></svg>
                                        <span id="rollbackTimer" style="font-size: 10px; position: absolute; bottom: 4px; left: 0; right: 0; text-align: center;"></span>
                                    </button>
                                    <button class="btn-block commit" onclick="commit()" title="COMMIT">
                                        <svg viewBox="0 0 16 16" width="28" height="28" fill="currentColor"><path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z" stroke="currentColor" stroke-width="2"/></svg>
                                    </button>
                                </div>
                            \`;
                            rollbackDeadline = message.autoRollbackAt || 0;
                            updateTimer();
                        } else if (message.lastAction) {
                            const isCommit = message.lastAction.toLowerCase().includes('committed');
                            const color = isCommit ? '#1e7e34' : '#8b0000';
                            const icon = isCommit ? '✓' : '✗';
                            area.innerHTML = \`
                                <div class="transaction-status" style="background-color: \${color};">
                                    <span style="font-size: 1.2em; margin-right: 8px;">\${icon}</span>
                                    <span style="font-weight: 600;">\${message.lastAction}</span>
                                </div>
                            \`;
                            rollbackDeadline = 0;
                            updateTimer();
                        }
                    }
                }
            });

            let rollbackDeadline = ${this._currentAutoRollbackAt || 0};
            function updateTimer() {
                const span = document.getElementById('rollbackTimer');
                if (!rollbackDeadline || !span) return;
                const now = Date.now();
                const remaining = Math.ceil((rollbackDeadline - now) / 1000);
                if (remaining >= 0) {
                    span.innerText = remaining + 's';
                } else {
                    span.innerText = '';
                }
            }
            if (rollbackDeadline > 0) setInterval(updateTimer, 1000);
            updateTimer(); 
        `;

        // --- Styles ---
        const styles = `
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0 !important; margin: 0 !important; font-size: 13px; display: flex; flex-direction: column; height: 100vh; background-color: transparent; overflow: hidden !important; }
            
            /* Top Bar */
            .header-container {
                width: 100%;
                box-sizing: border-box;
                padding: 0;
                height: 32px;
                display: flex;
                align-items: center;
                flex-shrink: 0;
            }
            .db-icon { display: flex; align-items: center; margin: 0 8px 0 15px; }
            
            /* Info Bar */
            .info-bar {
                width: 100%;
                box-sizing: border-box;
                background-color: #333; /* Dark gray */
                color: #ddd;
                display: flex;
                flex-shrink: 0;
                border-bottom: 1px solid #222;
                min-height: 60px;
            }
            .info-left {
                width: 66.66%;
                padding: 10px 15px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 5px;
                border-right: 1px solid #444;
            }
            .info-right {
                width: 33.33%;
                padding: 0; /* No padding, buttons fill area */
                display: flex;
            }
            
            .info-row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .info-row.query { font-family: Consolas, 'Courier New', monospace; font-size: 0.9em; color: #fff; opacity: 0.9; }
            .info-row.stats { font-size: 0.85em; color: #aaa; display: flex; gap: 15px; }
            
            .transaction-buttons { display: flex; width: 100%; height: 100%; }
            .btn-block {
                flex: 1;
                border: none;
                color: white;
                cursor: pointer;
                transition: opacity 0.2s;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                border-radius: 0;
                height: 100%;
                margin: 0;
                padding: 0;
            }
            .btn-block svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }
            .btn-block.commit { background-color: #28a745; }
            .btn-block.commit:hover { background-color: #218838; }
            .btn-block.rollback { background-color: #8b0000; }
            .btn-block.rollback:hover { background-color: #a50000; }
            
            .transaction-status {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
            }
            .transaction-placeholder { background-color: #2e2e2e; width: 100%; height: 100%; }

            /* Content Area */
            .content-area {
                flex-grow: 1;
                overflow: hidden; /* Let child container handle scroll */
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                position: relative;
                margin: 0;
                padding: 0;
            }
            
            /* Table */
            .table-container { 
                width: 100%; 
                overflow: auto; 
                height: 100%; 
                margin: 0;
                padding: 0;
            }
            table { 
                border-collapse: separate; 
                border-spacing: 0;
                width: 100%; 
                font-size: 12px; 
                margin: 0;
                padding: 0;
            }
            th, td { 
                padding: 4px 8px; 
                text-align: left; 
                white-space: nowrap; 
                overflow: hidden; 
                text-overflow: ellipsis; 
                max-width: 300px; 
                border-right: 1px solid var(--vscode-panel-border);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            /* Left border for first column */
            th:first-child, td:first-child {
                border-left: 1px solid var(--vscode-panel-border);
            }
            
            th { 
                position: sticky; 
                top: 0; 
                z-index: 20; 
                background-color: #333; 
                font-weight: 700; 
                color: #fff; 
                /* Override borders for header */
                border-right: 1px solid #555;
                border-bottom: 2px solid #555; 
                border-top: 1px solid #555; /* Ensure top border exists */
                margin-top: 0;
            }
             /* First header gets left border too */
            th:first-child {
                border-left: 1px solid #555;
            }
            
            .row-index { background-color: #2a2a2a; color: #aaa; text-align: center; font-weight: bold; border-right: 2px solid #555; width: 1px; white-space: nowrap; padding: 4px 6px; }
            
            /* Hover effect */
            tbody tr:hover { background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.1)); }
            tbody tr:hover .row-index { background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.1)); }
            
            /* Error */
            .error-container {
                padding: 20px;
                display: flex;
                gap: 15px;
                background-color: #3e1b1b;
                color: #ff9999;
                border-bottom: 1px solid #5c2b2b;
            }
            .error-icon { font-size: 2em; }
            .error-title { font-weight: bold; font-size: 1.1em; margin-bottom: 5px; }
            .error-message { font-family: monospace; white-space: pre-wrap; word-break: break-all; }
            
            /* Empty State */
            .empty-state { padding: 40px; text-align: center; }
            
            /* Theme overrides */
            body.vscode-light .info-bar { background-color: #e0e0e0; color: #333; border-bottom: 1px solid #ccc; }
            body.vscode-light .info-left { border-right: 1px solid #ccc; }
            body.vscode-light .info-row.query { color: #222; }
            body.vscode-light .transaction-placeholder { background-color: #d6d6d6; }
            body.vscode-light .error-container { background-color: #fff0f0; color: #d32f2f; border-bottom: 1px solid #ffcdd2; }
            
            .null-value { color: #888; font-style: italic; }
            
            /* Load More */
            .load-more-container { padding: 0; margin: 0; text-align: center; border-top: 1px solid var(--vscode-panel-border); }
            #loadMoreBtn {
                display: block;
                width: 100%;
                min-height: 60px;
                padding: 10px 15px;
                ${
                    connectionColor 
                    ? `background-color: ${connectionColor};` 
                    : `background-color: #444;`
                }
                color: white;
                font-weight: bold;
                border: none;
                border-radius: 0;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            #loadMoreBtn:hover { 
                ${
                    connectionColor 
                    ? `filter: brightness(85%);` 
                    : `background-color: #333;`
                }
            }
            #loadMoreBtn:disabled {
                opacity: 0.7;
                cursor: not-allowed;
            }
        `;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>${styles}</style>
            <script>${scripts}</script>
        </head>
        <body class="${showButtons ? 'has-transaction' : ''}">
            ${headerHtml}
            ${infoBarHtml}
            <div class="content-area">
                ${contentHtml}
            </div>
        </body>
        </html>`;
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
