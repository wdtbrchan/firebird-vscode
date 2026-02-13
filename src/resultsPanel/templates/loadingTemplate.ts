/**
 * Loading page template - shown while a query is executing.
 */

import { getLoadingStyles } from './styles';
import { getLoadingScript } from './scripts';

/**
 * Returns the full HTML for the loading/executing state.
 */
export function getLoadingHtml(headerHtml: string, startTime: number): string {
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>${getLoadingStyles()}</style>
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
            <script>${getLoadingScript(startTime)}</script>
        </body>
        </html>`;
}
