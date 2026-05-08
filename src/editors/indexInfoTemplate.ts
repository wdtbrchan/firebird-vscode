/**
 * HTML template generation for the IndexInfoPanel webview.
 * Pure function with no vscode dependency – kept testable in isolation.
 */

import { IndexDetails } from '../services/metadata/types';
export type { IndexDetails };

const STYLE = `
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

export function renderIndexInfoHtml(indexName: string, details: IndexDetails): string {
    const statusTag = details.status === 'INACTIVE'
        ? '<span class="tag tag-inactive">Inactive</span>'
        : '<span class="tag tag-active">Active</span>';

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${indexName}</title>
            <style>${STYLE}</style>
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
