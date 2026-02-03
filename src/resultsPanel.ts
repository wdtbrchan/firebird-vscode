import * as vscode from 'vscode';
import { Database } from './db';

export class ResultsPanel {
    public static currentPanel: ResultsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _lastResults: any[] = [];
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


    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
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
        this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; padding: 20px; display: flex; align-items: center; justify-content: center; height: 100vh; color: #888; flex-direction: column; }
                .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin-bottom: 15px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .timer { font-size: 0.9em; margin-top: 5px; color: #aaa; }
            </style>
            <script>
                const startTime = Date.now();
                setInterval(() => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    document.getElementById('timer').innerText = elapsed.toFixed(1) + 's';
                }, 100);
            </script>
        </head>
        <body>
            <div class="loader"></div>
            <div>Executing query...</div>
            <div id="timer" class="timer">0.0s</div>
        </body>
        </html>`;
    }

    public showSuccess(message: string, hasTransaction: boolean, context?: string) {
        this._updateContent([], message, hasTransaction, false, context);
    }

    public showError(message: string, hasTransaction: boolean, context?: string) {
        this._updateContent([], message, hasTransaction, true, context);
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
                    await Database.executeQuery(stmt, connection, { limit: 1000, offset: 0 }); // Ignoring limit practically
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
            await this._fetchAndDisplay(true);
        } catch (e) {
            console.error('Load more failed', e);
        }
    }

    private async _fetchAndDisplay(append: boolean = false) {
        if (!this._currentQuery) return;

        try {
            if (!append) {
                this.showLoading();
            }

            const start = performance.now();
            const results = await Database.executeQuery(this._currentQuery, this._currentConnection, {
                limit: this._limit,
                offset: this._currentOffset
            });
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

            if (append) {
                this._lastResults = [...this._lastResults, ...results];
            } else {
                this._lastResults = results;
            }
            
            // Check if we probably have more rows
            // If we got exactly 'limit' rows, there's a good chance there are more.
            // If we got less, we are done.
            // If we got 0, we are done.
            const hasMore = results.length === this._limit;

            if (this._lastResults.length > 0) {
                 this._updateContentForTable(this._lastResults, hasTransaction, undefined, hasMore);
            } else {
                 this.showSuccess('Query executed successfully. No rows returned.', hasTransaction);
            }

        } catch (err: any) {
            const hasTransaction = Database.hasActiveTransaction;
            this.showError(err.message, hasTransaction);
            throw err;
        }
    }

    private _updateContentForTable(results: any[], hasTransaction: boolean, context?: string, hasMore: boolean = false) {
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
        
         this._panel.webview.html = this._getHtmlForWebview(results, undefined, hasTransaction, false, this._lastContext, hasMore);
    }


    public update(results: any[], hasTransaction: boolean, context?: string) {
        // Legacy update method, or for simple internal updates. 
        // We assume no pagination if this is called directly? 
        // Or we just show what we are given.
        this._updateContentForTable(results, hasTransaction, context, false);
    }

    private _lastIsError: boolean = false;
    private _isLoading: boolean = false;
    private _lastContext: string | undefined;

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
         this._panel.webview.html = this._getHtmlForWebview(results, message, showButtons, isError, this._lastContext, false);
    }

    public setTransactionStatus(hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) {
        this._showButtons = hasTransaction;
        this._currentAutoRollbackAt = autoRollbackAt;
        
        if (lastAction) {
             this._lastTransactionAction = lastAction;
        }

        if (this._isLoading) return;
        
        this._panel.webview.html = this._getHtmlForWebview(this._lastResults, this._lastMessage, hasTransaction, this._lastIsError, this._lastContext, this._hasMore, this._lastTransactionAction);
    }

    private _hasMore: boolean = false;

    private _getHtmlForWebview(results: any[], message?: string, showButtons: boolean = false, isError: boolean = false, context?: string, hasMore: boolean = false, transactionAction?: string) {
        this._hasMore = hasMore;
        const countText = results ? `${results.length} rows` : '0 rows';
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
        if (contextText) subtitleParts.push(contextText);
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
            .btn.danger { background-color: #dc3545; }
            .btn.danger:hover { background-color: #c82333; }
            .content-area { flex-grow: 1; overflow: auto; padding: 5px; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 2px 4px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
            th { background-color: #f2f2f2; color: #333; font-weight: 600; top: 0; position: sticky; z-index: 1; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .success-message { color: #0c5460; font-weight: bold; padding: 10px; background-color: #d1ecf1; border: 1px solid #bee5eb; border-radius: 3px; margin: 10px; }
            .error-message { color: #d32f2f; font-weight: bold; padding: 10px; background-color: #ffebee; border: 1px solid #ffcdd2; border-radius: 3px; margin: 10px; }
            .row-index { background-color: #e0e0e0; color: #555; text-align: right; width: 30px; user-select: none; border-right: 2px solid #ccc; }
            
            // VS Code theme colors support
            body.vscode-light .header-container { background-color: #f3f3f3; border-bottom-color: #e0e0e0; }
            body.vscode-light th { background-color: #e3e3e3; }
            body.vscode-light .row-index { background-color: #eaeaea; color: #666; }
            
            body.vscode-dark .header-container { background-color: #252526; border-bottom-color: #3e3e3e; }
            body.vscode-dark th { background-color: #252526; color: #ccc; }
            body.vscode-dark .row-index { background-color: #2d2d2d; color: #888; border-right-color: #3e3e3e; }
            body.vscode-dark td { border-color: #3e3e3e; color: #cccccc; }
            body.vscode-dark tr:nth-child(even) { background-color: #2a2a2a; }
            body.vscode-dark tr:hover { background-color: #2a2d2e; }
            body.vscode-dark .error-message { background-color: #2c0b0e; border-color: #842029; color: #ea868f; }
            body.vscode-dark .success-message { background-color: #08303e; border-color: #0c5460; color: #66b0ff; }
        `;

        const header = `
            <div class="header-container">
                <div class="header-content">
                    ${isError || message ? `<h3>${isError ? 'Error' : message}</h3>` : ''} 
                    ${!isError && subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
                    ${querySnippet ? `<div class="query-snippet" title="${this._currentQuery}">${querySnippet}</div>` : ''}
                </div>
                ${buttonsHtml}
            </div>
        `;

        if (message) {
            const messageClass = isError ? 'error-message' : 'success-message';
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
                    ${message && !isError ? '' : `<div class="${messageClass}">${message}</div>`}
                </div>
            </body>
            </html>`;
        }

        if (!results || results.length === 0) {
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
                    <p>No results found or empty result set.</p>
                </div>
            </body>
            </html>`;
        }

        // Generate table headers
        const columns = Object.keys(results[0]);
        const headerRow = '<th></th>' + columns.map(col => `<th>${col}</th>`).join('');

        // Generate rows
        const rows = results.map((row, index) => {
            const cells = columns.map(col => {
                let val = row[col];
                if (val instanceof Uint8Array) {
                    val = '[Blob]'; // Simplified for now
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
