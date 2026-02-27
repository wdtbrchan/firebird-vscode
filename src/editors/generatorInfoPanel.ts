import * as vscode from 'vscode';
import { DatabaseConnection } from '../database/types';
import { MetadataService } from '../services/metadataService';

export class GeneratorInfoPanel {
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, connection: DatabaseConnection, generatorName: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const panel = vscode.window.createWebviewPanel(
            'firebirdGeneratorInfo',
            `GENERATOR: ${generatorName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        const instance = new GeneratorInfoPanel(panel, extensionUri);
        instance._update(connection, generatorName);
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

    private async _update(connection: DatabaseConnection, generatorName: string) {
        this._panel.webview.html = this._getLoadingHtml(generatorName);
        
        try {
            const value = await MetadataService.getGeneratorValue(connection, generatorName);
            this._panel.webview.html = this._getHtmlForWebview(generatorName, value);
        } catch (err) {
            this._panel.webview.html = this._getErrorHtml(generatorName, err);
        }
    }

    private _getLoadingHtml(name: string): string {
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
            <h2>Loading ${name}...</h2>
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

    private _getHtmlForWebview(name: string, value: string): string {
        const style = `
            body { 
                font-family: var(--vscode-font-family); 
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background); 
            }
            h1 { font-size: 1.5em; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
            .info-box { 
                padding: 15px; 
                background-color: var(--vscode-textBlockQuote-background); 
                border-left: 5px solid var(--vscode-textLink-activeForeground);
                margin-bottom: 20px;
            }
            .label { font-weight: 600; font-size: 1.1em; display: block; margin-bottom: 5px; color: var(--vscode-descriptionForeground); }
            .value { font-size: 2em; font-weight: bold; }
        `;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${name}</title>
            <style>${style}</style>
        </head>
        <body>
            <h1>GENERATOR: ${name}</h1>
            
            <div class="info-box">
                <span class="label">Current Value</span>
                <span class="value">${value}</span>
            </div>
            
            <p><small>Note: This value was retrieved at the time of loading. It may have changed.</small></p>
        </body>
        </html>`;
    }
}
