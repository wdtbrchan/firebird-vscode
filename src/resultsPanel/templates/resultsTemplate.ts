/**
 * Main results page template - assembles all sub-templates into a full HTML page.
 */

import { getMainStyles } from './styles';
import { getWebviewScripts } from './scripts';
import { getHeaderHtml, resolveConnectionColor } from './headerTemplate';
import { getInfoBarHtml, InfoBarParams } from './infoBarTemplate';
import { getErrorHtml, getNoResultsHtml, getResultsTableHtml } from './contentTemplates';

export interface ResultsPageParams {
    results: any[];
    message: string | undefined;
    showButtons: boolean;
    isError: boolean;
    context: string | undefined;
    hasMore: boolean;
    transactionAction: string | undefined;
    affectedRows: number | undefined;
    currentQuery: string | undefined;
    displayQuery?: string;
    currentConnection: any;
    lastExecutionTime: number | undefined;
    autoRollbackAt: number;
    locale: string;
}

/**
 * Extracts the table name from a SQL query (best-effort, parses FROM clause).
 */
function extractTableName(query: string | undefined): string | undefined {
    if (!query) return undefined;
    const match = query.match(/\bFROM\s+([^\s,;()+]+)/i);
    return match ? match[1].replace(/['"]/g, '') : undefined;
}

/**
 * Assembles the full HTML page for the results webview.
 */
export function getResultsPageHtml(params: ResultsPageParams): string {
    // --- Connection color ---
    const connectionColor = resolveConnectionColor(params.currentConnection?.color);
    const contextTitle = params.context || 'Unknown Database';
    const headerHtml = getHeaderHtml(contextTitle, connectionColor);

    // --- Info bar ---
    const timeText = params.lastExecutionTime !== undefined ? `${params.lastExecutionTime.toFixed(3)}s` : '-';

    let rowsText = '';
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
    let contentHtml = '';
    if (params.isError && params.message) {
        contentHtml = getErrorHtml(params.message);
    } else if (!params.results || params.results.length === 0) {
        contentHtml = getNoResultsHtml(params.affectedRows);
    } else {
        const encoding = params.currentConnection?.charset || 'UTF8';
        const tableName = extractTableName(params.currentQuery);
        contentHtml = getResultsTableHtml(params.results, params.locale, params.hasMore, params.showButtons, params.transactionAction, encoding, tableName);
    }

    // --- Scripts ---
    const scripts = getWebviewScripts(params.autoRollbackAt);

    // --- Styles ---
    const styles = getMainStyles(connectionColor);

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>${styles}</style>
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
