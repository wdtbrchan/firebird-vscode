import * as vscode from 'vscode';
import { DatabaseConnection } from '../explorer/treeItems/databaseItems';
import { MetadataService } from '../services/metadataService';

export class SourceCodePanel {
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, connection: DatabaseConnection, name: string, type: 'trigger' | 'procedure' | 'view' | 'function' | 'generator') {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const panel = vscode.window.createWebviewPanel(
            'firebirdSourceInfo',
            `${type.toUpperCase()}: ${name}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        const instance = new SourceCodePanel(panel, extensionUri);
        instance._update(connection, name, type);
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

    private async _update(connection: DatabaseConnection, name: string, type: string) {
        this._panel.webview.html = this._getLoadingHtml(name, type);
        
        try {
            let source = '';
            switch (type) {
                case 'trigger': source = await MetadataService.getTriggerSource(connection, name); break;
                case 'procedure': source = await MetadataService.getProcedureSource(connection, name); break;
                case 'view': source = await MetadataService.getViewSource(connection, name); break;
                case 'function': source = `-- Function source retrieval not implemented yet`; break; // TODO
                case 'generator': source = await MetadataService.getGeneratorDDL(connection, name); break;
                default: source = `-- Unknown object type: ${type}`;
            }

            this._panel.webview.html = this._getHtmlForWebview(name, type, source);
        } catch (err) {
            this._panel.webview.html = this._getErrorHtml(name, err);
        }
    }

    private _getLoadingHtml(name: string, type: string): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${name}</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); }
            </style>
        </head>
        <body>
            <h2>Loading ${type} ${name}...</h2>
        </body>
        </html>`;
    }

    private _getErrorHtml(name: string, error: any): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${name}</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); }
                .error { color: var(--vscode-errorForeground); }
            </style>
        </head>
        <body>
            <h2>Error loading info for ${name}</h2>
            <p class="error">${error}</p>
        </body>
        </html>`;
    }

    private _getHtmlForWebview(name: string, type: string, source: string): string {
        const style = `
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background); 
            }
            h1 { font-size: 1.5em; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
            pre { 
                background-color: var(--vscode-textCodeBlock-background); 
                border: 1px solid var(--vscode-panel-border);
                padding: 15px; 
                overflow-x: auto; 
                border-radius: 5px;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
                display: block;
                box-sizing: border-box;
            }
            code {
                white-space: pre-wrap;
                background-color: transparent;
            }
        `;

        // Simple HTML escaping
        const escapedSource = source.replace(/&/g, "&amp;")
                                    .replace(/</g, "&lt;")
                                    .replace(/>/g, "&gt;")
                                    .replace(/"/g, "&quot;")
                                    .replace(/'/g, "&#039;");

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${name}</title>
            <style>${style}</style>
        </head>
        <body>
            <h1>${type.toUpperCase()}: ${name}</h1>
            <pre><code>${escapedSource}</code></pre>
        </body>
        </html>`;
    }
}
