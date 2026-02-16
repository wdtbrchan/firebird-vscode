import * as vscode from 'vscode';
import { DatabaseConnection } from '../explorer/treeItems/databaseItems';
import { MetadataService } from '../services/metadataService';

export class IndexInfoPanel {
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, connection: DatabaseConnection, indexName: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const panel = vscode.window.createWebviewPanel(
            'firebirdIndexInfo',
            `INDEX: ${indexName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        const instance = new IndexInfoPanel(panel, extensionUri);
        instance._update(connection, indexName);
    }

    public dispose() {
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update(connection: DatabaseConnection, indexName: string) {
        this._panel.webview.html = this._getLoadingHtml(indexName);
        
        try {
            const indexDetails = await MetadataService.getIndexDetails(connection, indexName);
            this._panel.webview.html = this._getHtmlForWebview(indexName, indexDetails);
        } catch (err) {
            this._panel.webview.html = this._getErrorHtml(indexName, err);
        }
    }

    private _getLoadingHtml(indexName: string): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${indexName}</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); }
            </style>
        </head>
        <body>
            <h2>Loading info for ${indexName}...</h2>
        </body>
        </html>`;
    }

    private _getErrorHtml(indexName: string, error: any): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${indexName}</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); }
                .error { color: var(--vscode-errorForeground); }
            </style>
        </head>
        <body>
            <h2>Error loading info for ${indexName}</h2>
            <p class="error">${error}</p>
        </body>
        </html>`;
    }

    private _getHtmlForWebview(indexName: string, details: any): string {
        const style = `
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background); 
            }
            h1 { font-size: 1.5em; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
            table { border-collapse: collapse; margin-bottom: 10px; font-size: 0.9em; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
            th { font-weight: 600; min-width: 150px; }
            .tag { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
            .tag-active { background-color: var(--vscode-testing-iconPassed); color: #fff; }
            .tag-inactive { background-color: var(--vscode-testing-iconFailed); color: #fff; }
        `;

        const statusTag = details.startus === 'INACTIVE' 
            ? '<span class="tag tag-inactive">Inactive</span>' 
            : '<span class="tag tag-active">Active</span>';

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${indexName}</title>
            <style>${style}</style>
        </head>
        <body>
            <h1>INDEX: ${indexName}</h1>
            <table>
                <tr>
                    <th>Table</th>
                    <td>${details.relation}</td>
                </tr>
                <tr>
                    <th>Status</th>
                    <td>${statusTag}</td>
                </tr>
                <tr>
                    <th>Type</th>
                    <td>${details.unique ? 'UNIQUE' : 'NON-UNIQUE'}</td>
                </tr>
                <tr>
                    <th>Sorting</th>
                    <td>${details.descending ? 'DESCENDING' : 'ASCENDING'}</td>
                </tr>
                <tr>
                    <th>Columns / Expression</th>
                    <td><strong>${details.definition}</strong></td>
                </tr>
                <tr>
                    <th>Statistics</th>
                    <td>${details.statistics !== undefined ? details.statistics : 'N/A'}</td>
                </tr>
            </table>
        </body>
        </html>`;
    }
}
