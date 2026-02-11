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

        this._updateContent([], undefined, false);
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

    public showLoading() {
        this._isLoading = true;
        this._startTime = Date.now();
        // Initial HTML generation logic moved fully into webview.html assignment below for safety
        // Removed pre-calculated script string to avoid template literal complexity

         this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: transparent;
                    color: #ccc;
                }
                .loading-container {
                    /* Inline styles used below overrides this class, but keeping for reference */
                }
                .spinner {
                    border: 3px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    border-top: 3px solid #ffffff;
                    width: 20px;
                    height: 20px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div id="loading-box" style="position: fixed; top: 0; left: 0; width: 100%; text-align: center; background-color: #1e7e34; color: #ffffff; padding: 10px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2); display: flex; justify-content: center; gap: 10px; align-items: center; z-index: 9999;">
                <div class="spinner"></div>
                Executing... <span id="executing-timer" style="margin-left: 5px;">(0.0s)</span>
            </div>
            <script>
                // Use IIFE to ensure scope doesn't leak and runs
                (function() {
                    const startTime = ${this._startTime};
                    const timerEl = document.getElementById('executing-timer');
                    
                    if (timerEl) {
                        function update() {
                            const now = Date.now();
                            const diff = ((now - startTime) / 1000).toFixed(1);
                            timerEl.textContent = '(' + diff + 's)';
                        }
                        setInterval(update, 100);
                        update(); // Initial call
                    }
                })();
            </script>
        </body>
        </html>`;
    }

    public showSuccess(message: string, hasTransaction: boolean, context?: string) {
        this._updateContent([], message, hasTransaction, false, context);
    }

    public showError(message: string, hasTransaction: boolean, context?: string) {
        this._isLoading = false;
        this._lastIsError = true;
        this._lastMessage = message;
        this._showButtons = hasTransaction; // Show buttons if transaction is active
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
        
        await this._fetchAndDisplay();
    }

    public async runScript(statements: string[], connection: any, context?: string) {
        this._currentConnection = connection;
        this._currentContext = context;
        this._limit = vscode.workspace.getConfiguration('firebird').get<number>('maxRows', 1000);
        this._lastResults = [];
        this._lastTransactionAction = undefined;

        this.showLoading();
        // Custom loading message for script
        this._panel.webview.postMessage({ command: 'message', text: 'Executing script...' });

        let executedCount = 0;
        const total = statements.length;

        try {
            for (let i = 0; i < total; i++) {
                const stmt = statements[i];
                // Update UI to show progress? 
                // We'll rely on the final result or error.
                // Or we can try to show intermediate success messages?
                // For now, let's run them.
                
                // If it's the last statement, we want to show its results if it is a SELECT.
                // If it is DDL/DML, we show success.
                
                // We reuse _currentQuery logic partially or direct Database call.
                this._currentQuery = stmt; // Set strictly for potential error reporting or refresh
                
                if (i === total - 1) {
                    // Last statement - standard display
                     this._currentOffset = 0;
                     await this._fetchAndDisplay();
                } else {
                    // Intermediate statement - execute and ignore result unless error
                    await Database.executeQuery(stmt, connection, { limit: 1000, offset: 0 }); 
                }
                executedCount++;
            }
            
            if (total > 1 && executedCount === total) {
                 // If we had multiple statements and all succeeded, and the last one didn't return rows (e.g. DDL script),
                 // _fetchAndDisplay (called for last one) would handle showing "Success".
                 // We might want to append a summary message.
                 // But _fetchAndDisplay overwrites the view.
                 // Let's assume the user is happy seeing the result of the last statement.
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
                // Client-side: just slice more from already fetched data
                const startIndex = this._currentOffset;
                const endIndex = this._currentOffset + this._limit;
                const newRows = this._allResults.slice(startIndex, endIndex);
                const hasMore = endIndex < this._allResults.length;
                this._lastResults = this._allResults.slice(0, endIndex);
                // Append rows via postMessage to preserve scroll
                this._appendRowsToWebview(newRows, startIndex, hasMore);
            } else {
                // Server-side: fetch next page
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
        
        this._panel.webview.postMessage({
            command: 'appendRows',
            rowsHtml: rowsHtml,
            hasMore: hasMore,
            totalRows: this._lastResults.length
        });
    }

    private async _fetchAndDisplay(append: boolean = false) {
        if (!this._currentQuery) return;

        try {
            if (!append) {
                this.showLoading();
            }

            const start = performance.now();
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

            const activeDetails = this._currentConnection; 
             // Note: Connection details passed might be raw options or the object from tree. 
             // Ideally we pass context string or reconstruct it.
             // For now let's assume calling code handled context title, but here we need to update it mostly for successful APPENDs or REFRESHES.
             // But actually runQuery command sets context initially.
            
            // Heuristic for context title if missing? 
            // We'll rely on update() being called with accumulated results?
            // No, we need to accumulate results here if appending.

            // Check if server applied pagination (returned exactly limit rows)
            // If more rows returned, server didn't paginate - use client-side
            this._useClientSidePagination = !append && results.length > this._limit;
            
            let displayResults: any[];
            let hasMore: boolean;
            
            if (this._useClientSidePagination) {
                // Server returned all rows - use client-side pagination
                this._allResults = results;
                displayResults = results.slice(0, this._limit);
                hasMore = results.length > this._limit;
            } else if (append) {
                // Server-side pagination: appending to existing results
                this._lastResults = [...this._lastResults, ...results];
                displayResults = this._lastResults;
                hasMore = results.length === this._limit;
            } else {
                // Server-side pagination: initial fetch
                this._allResults = [];
                this._lastResults = results;
                displayResults = results;
                hasMore = results.length === this._limit;
            }
            
            this._lastResults = displayResults;

            if (this._lastResults.length > 0 || (affectedRows !== undefined && affectedRows >= 0)) {
                 this._updateContentForTable(this._lastResults, hasTransaction, undefined, hasMore, affectedRows);
            } else {
                 this._updateContentForTable([], hasTransaction, undefined, false, undefined);
            }

        } catch (err: any) {
            const hasTransaction = Database.hasActiveTransaction;
            this.showError(err.message, hasTransaction);
            throw err;
        }
    }

    private _updateContentForTable(results: any[], hasTransaction: boolean, context?: string, hasMore: boolean = false, affectedRows?: number) {
         this._isLoading = false;
         // this._lastResults is already updated in _fetchAndDisplay if that was called.
         // If called from outside (just update()), we trust results passed.
         this._lastResults = results;
         this._lastMessage = undefined;
         this._lastTransactionAction = undefined; // Clear action on new results
         this._showButtons = hasTransaction;
         this._lastIsError = false;
         this._lastIsError = false;
         // Use the passed context or the stored context context
         if (context) this._lastContext = context;
         else this._lastContext = this._currentContext;
        
         this._affectedRows = affectedRows;
         this._panel.webview.html = this._getHtmlForWebview(results, undefined, hasTransaction, false, this._lastContext, hasMore, undefined, affectedRows);
    }


    public update(results: any[], hasTransaction: boolean, context?: string) {
        // Legacy update method, or for simple internal updates. 
        // We assume no pagination if this is called directly? 
        // Or we just show what we are given.
        this._updateContentForTable(results, hasTransaction, context, false);
    }


    // Modified signature to generic _updateContent not really valid anymore with new logic, removing it or adapting.
    // Let's keep a generic internal setter for message based updates.
    private _updateContent(results: any[], message?: string, showButtons: boolean = false, isError: boolean = false, context?: string) {
         this._isLoading = false;
         this._lastResults = results;
         this._lastMessage = message;
         this._showButtons = showButtons;
         this._lastIsError = isError;
         // Use provided context or fallback to current established context
         this._lastContext = context || this._currentContext;
         this._affectedRows = undefined;
         this._panel.webview.html = this._getHtmlForWebview(results, message, showButtons, isError, this._lastContext, false);
    }

    public setTransactionStatus(hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) {
        this._showButtons = hasTransaction;
        this._currentAutoRollbackAt = autoRollbackAt;
        
        if (lastAction) {
             this._lastTransactionAction = lastAction;
        }

        // Do not update the view if we are currently loading a query, 
        // to prevent flashing "0 rows" or empty table before results arrive.
        if (this._isLoading) {
            return;
        }

        this._panel.webview.html = this._getHtmlForWebview(this._lastResults, this._lastMessage, hasTransaction, this._lastIsError, this._lastContext, this._hasMore, this._lastTransactionAction, this._affectedRows);
    }


    private _getHtmlForWebview(results: any[], message?: string, showButtons: boolean = false, isError: boolean = false, context?: string, hasMore: boolean = false, transactionAction?: string, affectedRows?: number) {
        this._hasMore = hasMore;
        let countText = results ? `${results.length} rows` : '0 rows';
        if (affectedRows !== undefined && affectedRows >= 0) {
            if (results && results.length > 0) {
                 countText += `, ${affectedRows} affected`;
            } else {
                 countText = `${affectedRows} rows affected`;
            }
        }
        
        const rowsText = hasMore ? `First ${countText}` : countText;
        const timeText = this._lastExecutionTime !== undefined ? `${this._lastExecutionTime.toFixed(3)}s` : '';
        const contextText = context || 'Unknown Database';
        
        let querySnippet = '';
        if (this._currentQuery) {
            const cleanQuery = this._currentQuery.replace(/\s+/g, ' ').trim();
            querySnippet = cleanQuery.length > 50 ? cleanQuery.substring(0, 50) + '...' : cleanQuery;
        }



        const subtitleParts = [];
        if (!isError && !message) {
            subtitleParts.push(rowsText);
        }
        // Context is now shown separately with color
        if (timeText && !isError) subtitleParts.push(timeText);
        if (transactionAction) subtitleParts.push(transactionAction);

        const subtitle = subtitleParts.join(' • ');

        const script = `
            const vscode = acquireVsCodeApi();
            function commit() { vscode.postMessage({ command: 'commit' }); }
            function rollback() { vscode.postMessage({ command: 'rollback' }); }
            function loadMore() { 
                const btn = document.getElementById('loadMoreBtn');
                if(btn) btn.innerText = 'Loading...';
                vscode.postMessage({ command: 'loadMore' }); 
            }
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'appendRows') {
                    const tbody = document.querySelector('tbody');
                    if (tbody) {
                        tbody.insertAdjacentHTML('beforeend', message.rowsHtml);
                    }
                    // Update row count in header
                    const subtitle = document.querySelector('.subtitle');
                    if (subtitle) {
                        const prefix = message.hasMore ? 'First ' : '';
                        subtitle.textContent = prefix + message.totalRows + ' rows';
                    }
                    // Update or hide Load More button
                    const btn = document.getElementById('loadMoreBtn');
                    if (btn) {
                        if (message.hasMore) {
                            btn.innerText = 'Load More Results';
                        } else {
                            btn.parentElement.remove();
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
                
                if (remaining > 0) {
                    span.innerText = 'Auto-rollback: ' + remaining + 's';
                } else {
                    span.innerText = '';
                }
            }

            if (rollbackDeadline > 0) {
               const startTimer = () => {
                    updateTimer(); // Initial update
                    setInterval(updateTimer, 1000);
               };

               if (document.readyState === 'loading') {
                   document.addEventListener('DOMContentLoaded', startTimer);
               } else {
                   startTimer();
               }
            }

            function updateTimer() {
                const span = document.getElementById('rollbackTimer');
                if (!rollbackDeadline || !span) return;
                
                const now = Date.now();
                const remaining = Math.ceil((rollbackDeadline - now) / 1000);
                
                if (remaining >= 0) {
                    span.innerText = '(' + remaining + 's)';
                    span.style.display = 'inline';
                } else {
                    span.innerText = '';
                    span.style.display = 'none';
                }
            }
        `;
        
        // ... (styles same) ...
        const buttonsHtml = showButtons ? `
            <div class="actions">
                <button class="btn danger" style="width: 130px;" onclick="rollback()">Rollback <span id="rollbackTimer" style="margin-left: 2px; display: none;"></span></button>
                <button class="btn success" onclick="commit()">Commit</button>
            </div>
        ` : '';



        const style = `
            body { font-family: sans-serif; padding: 0; margin: 0; font-size: 13px; display: flex; flex-direction: column; height: 100vh; }
            h3 { margin: 0; font-size: 1.1em; }
            .subtitle { font-size: 0.85em; color: #888; margin-top: 2px; }
            .query-snippet { font-size: 0.8em; color: #aaa; margin-top: 2px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .header-container { padding: 10px; border-bottom: 1px solid #ccc; flex-shrink: 0; min-height: 40px; display: flex; align-items: center; justify-content: space-between; }
            .header-content { display: flex; flex-direction: column; }
            .actions { display: flex; gap: 10px; align-items: center; }
            .btn { border: none; padding: 5px 10px; color: white; cursor: pointer; border-radius: 3px; font-size: 12px; }
            .btn.success { background-color: #28a745; }
            .btn.success:hover { background-color: #218838; }
            .btn.danger { background-color: #8b0000; }
            .btn.danger:hover { background-color: #a50000; }
            .content-area { flex-grow: 1; overflow: auto; padding: 0; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { padding: 2px 4px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
            td { border: 1px solid #ccc; }
            th { border: none; border-right: 1px solid #ccc; background-color: #e0e0e0; color: #222; font-weight: 600; top: 0; position: sticky; z-index: 1; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .success-message { color: #0c5460; font-weight: bold; padding: 10px; background-color: #d1ecf1; border: 1px solid #bee5eb; border-radius: 3px; margin: 10px; }
            .error-message { color: #d32f2f; font-weight: bold; padding: 10px; background-color: #ffebee; border: 1px solid #ffcdd2; border-radius: 3px; margin: 10px; }
            .row-index { background-color: #e0e0e0; color: #555; text-align: right; width: 30px; user-select: none; border-right: 2px solid #ccc; border-bottom: 1px solid #ccc; }
            
            // VS Code theme colors support
            body.vscode-light .header-container { background-color: #f3f3f3; border-bottom-color: #e0e0e0; }
            body.vscode-light th { background-color: #e0e0e0; color: #222; }
            body.vscode-light .row-index { background-color: #eaeaea; color: #666; }
            
            body.vscode-dark .header-container { background-color: #252526; border-bottom-color: #3e3e3e; }
            body.vscode-dark th { background-color: #d6d6d6; color: #111; border-right-color: #888; }
            body.vscode-dark .row-index { background-color: #2d2d2d; color: #888; border-right-color: #3e3e3e; }
            body.vscode-dark td { border-color: #3e3e3e; color: #cccccc; }
            body.vscode-dark tr:nth-child(even) { background-color: #2a2a2a; }
            body.vscode-dark tr:hover { background-color: #2a2d2e; }
            body.vscode-dark .error-message { background-color: #2c0b0e; border-color: #842029; color: #ea868f; }
            body.vscode-dark .success-message { background-color: #08303e; border-color: #0c5460; color: #66b0ff; }
            .null-value { color: #888; font-style: italic; }


        `;

        // Connection Color Logic
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

        const headerStyle = connectionColor ? `border-top: 6px solid ${connectionColor};` : '';
        // User requested removing the colored badge for database name.
        // const contextStyle = ... (removed)

        const header = `
            <div class="header-container" style="${headerStyle}">
                <div class="header-content">
                    ${!isError && message ? `<h3>${message}</h3>` : ''}
                    <div style="display: flex; align-items: baseline; gap: 10px;">
                        ${!isError && subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
                        ${contextText ? `<div style="font-size: 0.85em; font-weight: bold; color: ${connectionColor || '#888'};">${contextText}</div>` : ''}
                    </div>
                    ${querySnippet ? `<div class="query-snippet" title="${this._currentQuery}">${querySnippet}</div>` : ''}
                </div>
                ${buttonsHtml}
            </div>
        `;
        
        let errorMessageHtml = '';
        if (isError && message) {
            errorMessageHtml = `
                <div style="width: 100%; padding: 10px 15px; display: flex; align-items: center; box-sizing: border-box; margin-bottom: 0; background-color: #dc3545; color: #ffffff;">
                    <span style="font-size: 1.5em; margin-right: 10px;">⚠</span>
                    <div style="font-weight: 500; font-size: 1.1em;">Error: ${message}</div>
                </div>
            `;
        }

        // Generate transaction message separately from main message/error
        let transactionMessageHtml = '';
        const transactionMsg = transactionAction;
        
        // Connection color banner style for generic success
        const bannerStyle = connectionColor ? 
            `background-color: ${connectionColor}; color: #ffffff;` : 
            'background-color: #666666; color: #ffffff;';

        if (transactionMsg) {
            let icon = '';
            let msgStyle = '';
            const msgLower = transactionMsg.toLowerCase();
            
            if (msgLower.includes('committed')) {
                icon = '<span style="font-size: 1.5em; margin-right: 10px;">✓</span>';
                msgStyle = 'background-color: #1e7e34; color: #ffffff;'; // Green
            } else if (msgLower.includes('roll')) { 
                icon = '<span style="font-size: 1.5em; margin-right: 10px;">✗</span>';
                msgStyle = 'background-color: #8b0000; color: #ffffff;'; // Dark Red
            } else {
                 msgStyle = bannerStyle;
            }

            transactionMessageHtml = `
                <div style="width: 100%; padding: 10px 15px; display: flex; align-items: center; box-sizing: border-box; margin-bottom: 0; ${msgStyle}">
                    ${icon}
                    <div style="font-weight: 500; font-size: 1.1em;">${transactionMsg}</div>
                </div>
            `;
        }

        // Handle generic message if it's NOT a transaction action (or if we want to show both?)
        // If message is error, we show it (already handled in header or below).
        // If message is same as transactionAction, we don't show it again.
        
        // Let's rely on 'message' being for Errors or Generic infos.
        // 'transactionAction' is strictly for Commit/Rollback feedback.

        // Affected rows strip (Full width, top)
        let affectedRowsHtml = '';

        if (affectedRows !== undefined && affectedRows >= 0) {
             affectedRowsHtml = `
                <div style="width: 100%; padding: 10px 20px; display: flex; align-items: center; box-sizing: border-box; margin-bottom: 0; ${bannerStyle}">
                    <div style="font-size: 1.1em; font-weight: 400;"><strong style="font-weight: 700;">${affectedRows}</strong> rows affected</div>
                </div>
            `;
        }

        if (!results || results.length === 0) {
            let content = '';
            
            if (affectedRowsHtml) {
                // If we have affected rows, that's our content (plus transaction msg if any)
                content = affectedRowsHtml;
            } else if (!message) {
                 // No results and no specific message (e.g. SELECT with 0 rows)
                 content = `
                    <div style="width: 100%; padding: 10px 20px; display: flex; align-items: center; box-sizing: border-box; margin-bottom: 0; ${bannerStyle}">
                         <div style="font-size: 1.1em; font-weight: 500;">0 rows returned</div>
                    </div>
                 `;
            }

            return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    ${style}
                    .content-area {
                        display: flex !important;
                        flex-direction: column;
                        align-items: stretch;
                        justify-content: flex-start;
                    }
                </style>
                <script>${script}</script>
            </head>
            <body>
                 ${header}
                <div class="content-area">
                    ${errorMessageHtml}
                    ${affectedRowsHtml && !content.includes(affectedRowsHtml) ? affectedRowsHtml : ''} 
                    ${content}
                    ${transactionMessageHtml}
                </div>
            </body>
            </html>`;
        }



        // Generate table headers
        const columns = Object.keys(results[0]);
        const headerRow = '<th></th>' + columns.map(col => `<th>${col}</th>`).join('');

        // Generate rows
        const config = vscode.workspace.getConfiguration('firebird');
        // Use connection-specific locale if set, otherwise fallback to global setting or en-US
        const locale = this._currentConnection?.resultLocale || config.get<string>('resultLocale', 'en-US');

        const rows = results.map((row, index) => {
            const cells = columns.map(col => {
                let val = row[col];
                if (val === null) {
                    val = '<span class="null-value">[NULL]</span>';
                } else if (val instanceof Uint8Array) {
                    val = '[Blob]'; // Simplified for now
                } else if (typeof val === 'number') {
                    // Start formatting change
                    if (Number.isInteger(val)) {
                        val = val.toString(); // Don't format integers (ids etc.)
                    } else {
                        try {
                            val = val.toLocaleString(locale);
                        } catch (e) {
                             // Fallback if locale is invalid
                             val = val.toString(); 
                        }
                    }
                } else if (val instanceof Date) {
                    try {
                        val = val.toLocaleString(locale);
                    } catch (e) {
                        val = val.toString();
                    }
                } else if (typeof val === 'object' && val !== null) {
                    val = JSON.stringify(val);
                }
                return `<td>${val}</td>`;
            }).join('');
            return `<tr><td class="row-index">${index + 1}</td>${cells}</tr>`;
        }).join('');

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>${style}</style>
            <script>${script}</script>
        </head>
        <body>
             ${header}
            <div class="content-area">
                ${errorMessageHtml}
                ${affectedRowsHtml}
                ${transactionMessageHtml}
                <table>
                    <thead>
                        <tr>${headerRow}</tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                ${hasMore ? `<div style="text-align: center; margin-top: 10px;"><button id="loadMoreBtn" class="btn success" style="background-color: #007acc; width: 100%; padding: 10px;" onclick="loadMore()">Load More Results</button></div>` : ''}
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
