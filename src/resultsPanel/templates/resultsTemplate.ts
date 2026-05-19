/**
 * Main results page template - assembles all sub-templates into a full HTML page.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { getHeaderHtml, resolveConnectionColor } from './headerTemplate';
import { getInfoBarHtml, InfoBarParams } from './infoBarTemplate';
import { getErrorHtml, getNoResultsHtml, getResultsTableHtml, escapeHtml } from './contentTemplates';
import { iconCommit, iconRollback } from './icons';
import { DatabaseConnection } from '../../database/types';

export interface ResultsPageParams {
    results: Record<string, unknown>[];
    message: string | undefined;
    showButtons: boolean;
    isError: boolean;
    isPlan?: boolean;
    context: string | undefined;
    hasMore: boolean;
    transactionAction: string | undefined;
    affectedRows: number | undefined;
    currentQuery: string | undefined;
    displayQuery?: string;
    currentConnection: DatabaseConnection | undefined;
    lastExecutionTime: number | undefined;
    autoRollbackAt: number;
    locale: string;
}

/**
 * Extracts the table name from a SQL query (best-effort, parses FROM clause).
 */
export function extractTableName(query: string | undefined): string | undefined {
    if (!query) return undefined;
    const match = query.match(/\bFROM\s+([^\s,;()+]+)/i);
    return match ? match[1].replace(/['"]/g, '') : undefined;
}

/**
 * Keeps inline editing limited to result sets where the target table is
 * reasonably unambiguous. SQL parsing stays intentionally conservative here.
 */
export function getEditableTableName(query: string | undefined): string | undefined {
    if (!query) return undefined;
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (!/^select\b/i.test(normalized)) return undefined;
    if (/\b(join|union|intersect|except|group\s+by|having)\b/i.test(normalized)) return undefined;
    const fromMatch = normalized.match(/\bfrom\s+([^\s,;()+]+)/i);
    if (!fromMatch) return undefined;
    const afterFrom = normalized.slice((fromMatch.index || 0) + fromMatch[0].length);
    if (/^\s*,/.test(afterFrom)) return undefined;
    return fromMatch[1].replace(/['"]/g, '');
}

/**
 * Assembles the full HTML page for the results webview.
 */
export function getResultsPageHtml(extensionUri: vscode.Uri, params: ResultsPageParams): string {
    // --- Connection color ---
    const connectionColor = resolveConnectionColor(params.currentConnection?.color);
    const contextTitle = params.context || 'Unknown Database';
    const headerHtml = getHeaderHtml(contextTitle, connectionColor);

    // --- Info bar ---
    const timeText = params.lastExecutionTime !== undefined ? `${params.lastExecutionTime.toFixed(3)}s` : '-';

    let rowsText: string;
    const rowCount = params.results ? params.results.length : 0;
    if (params.hasMore) {
        rowsText = `First ${rowCount} rows fetched`;
    } else {
        rowsText = `${rowCount} rows fetched`;
    }
    if (params.affectedRows !== undefined && params.affectedRows >= 0) {
        rowsText += `, ${params.affectedRows} affected`;
    }

    const infoBarParams: InfoBarParams = {
        query: params.displayQuery || params.currentQuery,
        timeText,
        rowsText,
        showButtons: params.showButtons,
        transactionAction: params.transactionAction,
    };
    const infoBarHtml = getInfoBarHtml(infoBarParams);

    // --- Content area ---
    let contentHtml: string;
    if (params.isError && params.message) {
        contentHtml = getErrorHtml(params.message);
    } else if (params.isPlan && params.message) {
        contentHtml = `<div style="padding: 15px; font-family: monospace; white-space: pre-wrap; word-wrap: break-word; color: var(--vscode-editor-foreground);">${escapeHtml(params.message)}</div>`;
    } else if (!params.results || params.results.length === 0) {
        contentHtml = getNoResultsHtml(params.affectedRows);
    } else {
        const encoding = params.currentConnection?.charset || 'UTF8';
        const tableName = extractTableName(params.currentQuery);
        const editableTableName = getEditableTableName(params.currentQuery);
        const config = vscode.workspace.getConfiguration('firebird');
        const decimalSeparator = config.get<string>('csvDecimalSeparator', '.');
        contentHtml = getResultsTableHtml(params.results, params.locale, params.hasMore, params.showButtons, params.transactionAction, encoding, tableName, decimalSeparator, editableTableName);
    }

    // --- Static Files ---
    const cssPath = vscode.Uri.joinPath(extensionUri, 'src', 'resultsPanel', 'templates', 'styles.css').fsPath;
    const jsPath = vscode.Uri.joinPath(extensionUri, 'src', 'resultsPanel', 'templates', 'scripts.js').fsPath;

    let styles = '';
    let scripts = '';
    try {
        styles = fs.readFileSync(cssPath, 'utf8');
        scripts = fs.readFileSync(jsPath, 'utf8');
    } catch (e) {
        console.error('Failed to load result template files', e);
    }
    
    // Inject dynamic connection color
    if (connectionColor) {
        styles += `\n#loadMoreBtn { background-color: ${connectionColor}; }\n`;
        styles += `#loadMoreBtn:hover { filter: brightness(85%); }\n`;
    }

    const initialData = {
        autoRollbackAt: params.autoRollbackAt,
        iconCommit: iconCommit,
        iconRollback: iconRollback
    };

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>${styles}</style>
            <script>window.INITIAL_DATA = ${JSON.stringify(initialData)};</script>
            <script>${scripts}</script>
        </head>
        <body class="${params.showButtons ? 'has-transaction' : ''}">
            ${headerHtml}
            ${infoBarHtml}
            <div class="content-area">
                ${contentHtml}
            </div>
        </body>
        </html>`;
}
