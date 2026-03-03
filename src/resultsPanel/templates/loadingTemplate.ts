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
                <span id="executing-timer">0.0s</span>
            </div>
            <div style="flex-grow: 1;"></div>
            <script>window.INITIAL_DATA = { startTime: ${startTime} };</script>
            <script>${jsContent}</script>
        </body>
        </html>`;
}
