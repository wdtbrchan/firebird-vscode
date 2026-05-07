import * as vscode from 'vscode';
import { DatabaseConnection } from '../database/types';
import { MetadataService } from '../services/metadataService';
import { renderIndexInfoHtml } from './indexInfoTemplate';

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
        return renderIndexInfoHtml(indexName, details);
    }
}
