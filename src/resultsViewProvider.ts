import * as vscode from 'vscode';

export class ResultsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'firebird.resultsView';

    private _view?: vscode.WebviewView;

    constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
        console.log('ResultsViewProvider.resolveWebviewView called');
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview([]);
	}

    public update(results: any[]) {
        if (this._view) {
            this._view.show?.(true); // Show if hidden
            this._view.webview.html = this._getHtmlForWebview(results);
        }
    }

    private _getHtmlForWebview(results: any[]) {
        if (!results || results.length === 0) {
            return `<!DOCTYPE html>
            <html lang="en">
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
            <style>
                body { font-family: sans-serif; padding: 10px; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; color: #333; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                // VS Code theme colors support
                body.vscode-light th { background-color: #e3e3e3; }
                body.vscode-dark th { background-color: #333; color: #fff; }
                body.vscode-dark td { border-color: #444; }
                body.vscode-dark tr:nth-child(even) { background-color: #2a2a2a; }
            </style>
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
}
