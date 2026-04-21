import * as fs from 'fs';
import * as vscode from 'vscode';
import { DatabaseConnection } from '../database/types';
import { ExportService } from './exportService';

export class ExportConfigPanel {
    public static async show(
        extensionUri: vscode.Uri,
        query: string,
        connection: DatabaseConnection
    ) {
        const config = vscode.workspace.getConfiguration('firebird');
        const defaultEncoding = connection.charset || config.get<string>('charset', 'UTF8');
        const defaultDecimalSeparator = config.get<string>('csvDecimalSeparator', '.');
        const defaultFilename = 'export.csv';

        const panel = vscode.window.createWebviewPanel(
            'csvExportConfig',
            'Export to CSV',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = ExportConfigPanel.getHtml(extensionUri, query, defaultEncoding, defaultDecimalSeparator, defaultFilename, panel.webview.cspSource);

        panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'exportCsv') {
                    // Close the panel before the long operation to match user expectation,
                    // or keep it open and let ExportService report progress to it.
                    // The request says "Po vyexportování ho zavři." (After exporting, close it).
                    try {
                        await ExportService.exportCsv(panel, query, connection, message);
                    } finally {
                        panel.dispose();
                    }
                } else if (message.command === 'cancel') {
                    panel.dispose();
                }
            },
            undefined,
            []
        );
    }

    private static getHtml(
        extensionUri: vscode.Uri,
        query: string,
        defaultEncoding: string,
        defaultDecimalSeparator: string,
        defaultFilename: string,
        cspSource: string
    ): string {
        const cssPath = vscode.Uri.joinPath(extensionUri, 'src', 'resultsPanel', 'templates', 'styles.css').fsPath;
        let styles = '';
        try {
            styles = fs.readFileSync(cssPath, 'utf8');
        } catch (e) {
            console.error('Failed to load styles', e);
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>${styles}</style>
    <style>
        body {
            background-color: transparent !important;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }
        .query-preview {
            background-color: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.1));
            padding: 8px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 11px;
            max-height: 80px;
            overflow-y: auto;
            white-space: pre-wrap;
            margin-bottom: 15px;
            border: 1px solid var(--vscode-panel-border, #555);
            color: var(--vscode-editor-foreground, #ccc);
        }
    </style>
</head>
<body class="vscode-dark"> <!-- Defaulting to dark, VSCode handles theme via color variables anyway -->
    <div class="csv-modal-overlay visible" id="csvModalOverlay" style="background-color: transparent;">
        <div class="csv-modal">
            <h3>Export to CSV</h3>
            
            <div style="font-size: 12px; margin-bottom: 4px; color: #aaa;">SQL Query:</div>
            <div class="query-preview">${ExportConfigPanel.escapeHtml(query)}</div>

            <div id="csvExportStatusText" style="display:none; padding: 12px 0; font-size: 13px;"></div>
            
            <div id="csvModalForm">
                <div class="csv-modal-field">
                    <label for="csvDelimiter">Delimiter</label>
                    <input type="text" id="csvDelimiter" value=";" maxlength="5" />
                </div>
                <div class="csv-modal-field">
                    <label for="csvQualifier">String Qualifier</label>
                    <input type="text" id="csvQualifier" value="&quot;" maxlength="5" />
                </div>
                <div class="csv-modal-field">
                    <label for="csvDecimalSeparator">Decimal Separator</label>
                    <select id="csvDecimalSeparator">
                        <option value="." ${defaultDecimalSeparator === '.' ? 'selected' : ''}>Dot (.)</option>
                        <option value="," ${defaultDecimalSeparator === ',' ? 'selected' : ''}>Comma (,)</option>
                    </select>
                </div>
                <div class="csv-modal-field">
                    <label for="csvEncoding">Encoding</label>
                    <input type="text" id="csvEncoding" value="${defaultEncoding}" />
                </div>
                <div class="csv-modal-field">
                    <label for="csvFilename">Filename</label>
                    <input type="text" id="csvFilename" value="${defaultFilename}" />
                </div>
                <div class="csv-modal-buttons">
                    <button class="btn-cancel" onclick="cancel()">Cancel</button>
                    <button class="btn-export" onclick="exportCsv()">Export to file</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'csvExportStatus') {
                const statusEl = document.getElementById('csvExportStatusText');
                const formEl = document.getElementById('csvModalForm');
                if (statusEl) {
                    if (message.status) {
                        statusEl.innerText = message.status;
                        statusEl.style.display = 'block';
                        statusEl.style.color = message.status.startsWith('Error') ? '#f44' : '';
                        if (formEl) formEl.style.display = 'none';
                    } else {
                        statusEl.style.display = 'none';
                        statusEl.innerText = '';
                        if (formEl) formEl.style.display = 'block';
                    }
                }
            }
        });

        function cancel() {
            vscode.postMessage({ command: 'cancel' });
        }

        function exportCsv() {
            const delimiter = document.getElementById('csvDelimiter').value || ';';
            const qualifier = document.getElementById('csvQualifier').value || '"';
            const encoding = document.getElementById('csvEncoding').value || 'UTF8';
            const filename = document.getElementById('csvFilename').value || 'export.csv';
            const decimalSeparator = document.getElementById('csvDecimalSeparator').value || '.';
            
            vscode.postMessage({ 
                command: 'exportCsv',
                delimiter: delimiter,
                qualifier: qualifier,
                encoding: encoding,
                filename: filename,
                decimalSeparator: decimalSeparator
            });
        }
    </script>
</body>
</html>`;
    }

    private static escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
