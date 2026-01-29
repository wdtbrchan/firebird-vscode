import * as vscode from 'vscode';

export class ResultsPanel {
    public static currentPanel: ResultsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._updateContent([]);
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

    public showSuccess(message: string) {
        this._updateContent([], message);
    }

    public update(results: any[]) {
        this._updateContent(results);
    }

    private _updateContent(results: any[], message?: string) {
        this._panel.webview.html = this._getHtmlForWebview(results, message);
    }

    private _getHtmlForWebview(results: any[], message?: string) {
        const style = `
            body { font-family: sans-serif; padding: 5px; font-size: 13px; }
            h3 { margin-top: 5px; margin-bottom: 5px; font-size: 1.1em; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 2px 4px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
            th { background-color: #f2f2f2; color: #333; font-weight: 600; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .success-message { color: green; font-weight: bold; padding: 10px; }
            // VS Code theme colors support
            body.vscode-light th { background-color: #e3e3e3; }
            body.vscode-dark th { background-color: #252526; color: #ccc; }
            body.vscode-dark td { border-color: #3e3e3e; color: #cccccc; }
            body.vscode-dark tr:nth-child(even) { background-color: #2a2a2a; }
            body.vscode-dark tr:hover { background-color: #2a2d2e; }
        `;

        if (message) {
            return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>${style}</style>
            </head>
            <body>
                <div class="success-message">Run: ${message}</div>
            </body>
            </html>`;
        }

        if (!results || results.length === 0) {
            return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>${style}</style>
            </head>
            <body>
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
        </head>
        <body>
            <h3>Query Results (${results.length} rows)</h3>
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
