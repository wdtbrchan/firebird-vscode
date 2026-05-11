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
    h2 { font-size: 1.15em; margin: 24px 0 10px; }
    table.props { border-collapse: collapse; margin-bottom: 10px; font-size: 0.9em; }
    table.props th, table.props td { text-align: left; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    table.props th { font-weight: 600; min-width: 150px; }
    .tag { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
    .tag-active { background-color: var(--vscode-testing-iconPassed); color: #fff; }
    .tag-inactive { background-color: var(--vscode-testing-iconFailed); color: #fff; }

    table.columns {
        border-collapse: collapse;
        width: 100%;
        max-width: 720px;
        font-size: 0.95em;
        border: 1px solid var(--vscode-panel-border);
        background-color: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    }
    table.columns thead th {
        text-align: left;
        padding: 10px 14px;
        background-color: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-sideBar-background));
        color: var(--vscode-foreground);
        border-bottom: 2px solid var(--vscode-focusBorder, var(--vscode-panel-border));
        font-weight: 600;
        letter-spacing: 0.02em;
    }
    table.columns tbody td {
        padding: 9px 14px;
        border-bottom: 1px solid var(--vscode-panel-border);
        vertical-align: top;
    }
    table.columns tbody tr:nth-child(even) {
        background-color: var(--vscode-list-hoverBackground, rgba(127,127,127,0.06));
    }
    table.columns tbody tr:last-child td { border-bottom: none; }
    .col-pos { width: 56px; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
    .col-name {
        font-family: var(--vscode-editor-font-family, monospace);
        font-weight: 600;
        color: var(--vscode-symbolIcon-fieldForeground, var(--vscode-editor-foreground));
    }
    .computed-row td {
        background-color: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.08));
    }
    .computed-label {
        display: inline-block;
        font-size: 0.75em;
        font-weight: 600;
        letter-spacing: 0.04em;
        padding: 2px 6px;
        margin-right: 8px;
        border-radius: 3px;
        background-color: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
    }
    .expression {
        font-family: var(--vscode-editor-font-family, monospace);
        white-space: pre-wrap;
        word-break: break-word;
    }
`;

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderColumnsSection(details: IndexDetails): string {
    if (details.expression) {
        return `
            <h2>Computed expression</h2>
            <table class="columns">
                <thead>
                    <tr><th>Definition</th></tr>
                </thead>
                <tbody>
                    <tr class="computed-row">
                        <td>
                            <span class="computed-label">COMPUTED BY</span>
                            <span class="expression">${escapeHtml(details.expression)}</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    if (!details.columns || details.columns.length === 0) {
        return `
            <h2>Columns</h2>
            <p><em>No columns reported for this index.</em></p>
        `;
    }

    const rows = details.columns.map((col, i) => `
        <tr>
            <td class="col-pos">#${i + 1}</td>
            <td class="col-name">${escapeHtml(col)}</td>
        </tr>
    `).join('');

    return `
        <h2>Columns <span style="font-weight:normal;color:var(--vscode-descriptionForeground);">(${details.columns.length})</span></h2>
        <table class="columns">
            <thead>
                <tr>
                    <th class="col-pos">#</th>
                    <th>Column</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

export function renderIndexInfoHtml(indexName: string, details: IndexDetails): string {
    const statusTag = details.status === 'INACTIVE'
        ? '<span class="tag tag-inactive">Inactive</span>'
        : '<span class="tag tag-active">Active</span>';

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(indexName)}</title>
            <style>${STYLE}</style>
        </head>
        <body>
            <h1>INDEX: ${escapeHtml(indexName)}</h1>
            <table class="props">
                <tr>
                    <th>Table</th>
                    <td>${escapeHtml(details.relation)}</td>
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
                    <th>Statistics</th>
                    <td>${details.statistics !== undefined ? details.statistics : 'N/A'}</td>
                </tr>
            </table>

            ${renderColumnsSection(details)}
        </body>
        </html>`;
}
