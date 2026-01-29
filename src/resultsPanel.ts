import * as vscode from 'vscode';

export class ResultsPanel {
    public static currentPanel: ResultsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _lastResults: any[] = [];
    private _lastMessage: string | undefined;
    private _showButtons: boolean = false;

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
            'Firebird Results',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        ResultsPanel.currentPanel = new ResultsPanel(panel, extensionUri);
    }

    public showLoading() {
        this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; padding: 20px; display: flex; align-items: center; justify-content: center; height: 100vh; color: #888; }
                .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin-right: 10px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="loader"></div>
            <div>Executing query...</div>
        </body>
        </html>`;
    }

    public showSuccess(message: string, hasTransaction: boolean) {
        this._updateContent([], message, hasTransaction, false);
    }

    public showError(message: string, hasTransaction: boolean) {
        this._updateContent([], message, hasTransaction, true);
    }

    public update(results: any[], hasTransaction: boolean) {
        this._updateContent(results, undefined, hasTransaction, false);
    }

    public setTransactionStatus(hasTransaction: boolean) {
        // Re-render with new status, preserving content
        // If there was an error, we want to keep showing it potentially?
        // Actually if we just committed/rolled back, the error is "old" context, but let's reset to empty or success message?
        // Usually commit/rollback clears the transaction.
        this._updateContent(this._lastResults, this._lastMessage, hasTransaction, this._lastIsError);
    }

    private _lastIsError: boolean = false;

    private _updateContent(results: any[], message?: string, showButtons: boolean = false, isError: boolean = false) {
        this._lastResults = results;
        this._lastMessage = message;
        this._showButtons = showButtons;
        this._lastIsError = isError;
        this._panel.webview.html = this._getHtmlForWebview(results, message, showButtons, isError);
    }

    private _getHtmlForWebview(results: any[], message?: string, showButtons: boolean = false, isError: boolean = false) {
        const script = `
            const vscode = acquireVsCodeApi();
            function commit() { vscode.postMessage({ command: 'commit' }); }
            function rollback() { vscode.postMessage({ command: 'rollback' }); }
        `;

        const buttonsHtml = showButtons ? `
            <div class="actions">
                <button class="btn success" onclick="commit()">Commit</button>
                <button class="btn danger" onclick="rollback()">Rollback</button>
            </div>
        ` : '';

        const style = `
            body { font-family: sans-serif; padding: 5px; font-size: 13px; }
            h3 { margin: 0; font-size: 1.1em; flex-grow: 1; }
            .header { display: flex; align-items: center; margin-bottom: 5px; justify-content: space-between; }
            .actions { display: flex; gap: 10px; }
            .btn { border: none; padding: 5px 10px; color: white; cursor: pointer; border-radius: 3px; font-size: 12px; }
            .btn.success { background-color: #28a745; }
            .btn.success:hover { background-color: #218838; }
            .btn.danger { background-color: #dc3545; }
            .btn.danger:hover { background-color: #c82333; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 5px; }
            th, td { border: 1px solid #ccc; padding: 2px 4px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
            th { background-color: #f2f2f2; color: #333; font-weight: 600; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .success-message { color: green; font-weight: bold; padding: 10px; }
            .error-message { color: #d32f2f; font-weight: bold; padding: 10px; background-color: #ffebee; border: 1px solid #ffcdd2; border-radius: 3px; }
            // VS Code theme colors support
            body.vscode-light th { background-color: #e3e3e3; }
            body.vscode-dark th { background-color: #252526; color: #ccc; }
            body.vscode-dark td { border-color: #3e3e3e; color: #cccccc; }
            body.vscode-dark tr:nth-child(even) { background-color: #2a2a2a; }
            body.vscode-dark tr:hover { background-color: #2a2d2e; }
            body.vscode-dark .error-message { background-color: #2c0b0e; border-color: #842029; color: #ea868f; }
        `;

        const header = `
            <div class="header">
                <h3>${isError ? 'Error' : (message ? 'Result' : `Query Results (${results.length} rows)`)}</h3>
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
                <div class="${messageClass}">${message}</div>
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
                <p>No results found or empty result set.</p>
            </body>
            </html>`;
        }

        // Generate table headers
        const columns = Object.keys(results[0]);
        const headerRow = columns.map(col => `<th>${col}</th>`).join('');

        // Generate rows
        const rows = results.map(row => {
            const cells = columns.map(col => {
                let val = row[col];
                if (val instanceof Uint8Array) {
                    val = '[Blob]'; // Simplified for now
                } else if (typeof val === 'object' && val !== null) {
                    val = JSON.stringify(val);
                }
                return `<td>${val}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
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
            <table>
                <thead>
                    <tr>${headerRow}</tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
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
