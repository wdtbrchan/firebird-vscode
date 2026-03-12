/**
 * Loading page template - shown while a query is executing.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Returns the full HTML for the loading/executing state.
 */
export function getLoadingHtml(extensionUri: vscode.Uri, headerHtml: string, startTime: number): string {
    const cssPath = vscode.Uri.joinPath(extensionUri, 'src', 'resultsPanel', 'templates', 'loading.css').fsPath;
    const jsPath = vscode.Uri.joinPath(extensionUri, 'src', 'resultsPanel', 'templates', 'loading.js').fsPath;
    
    let cssContent = '';
    let jsContent = '';
    
    try {
        cssContent = fs.readFileSync(cssPath, 'utf8');
        jsContent = fs.readFileSync(jsPath, 'utf8');
    } catch (e) {
        console.error('Failed to load loading templates', e);
    }

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>${cssContent}</style>
        </head>
        <body>
            ${headerHtml}
            <div class="executing-bar">
                <div style="display: flex; align-items: center;">
                    <div class="spinner"></div>
                    <span>Executing...</span>
                </div>
                <div style="display: flex; align-items: center; margin-right: 15px;">
                    <span id="executing-timer" style="margin-right: 15px;">0.0s</span>
                    <button id="cancel-query-btn" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 10px; cursor: pointer; border-radius: 2px;">Cancel Query</button>
                    <button id="kill-query-btn" style="background: var(--vscode-errorForeground); color: var(--vscode-button-foreground); border: none; padding: 4px 10px; cursor: pointer; border-radius: 2px; margin-left: 10px; display: none;">Kill Process</button>
                </div>
            </div>
            <div style="flex-grow: 1;"></div>
            <script>window.INITIAL_DATA = { startTime: ${startTime} };</script>
            <script>${jsContent}</script>
        </body>
        </html>`;
}
