/**
 * Content area templates - results table, error message, no-results state.
 */

/**
 * Formats a cell value for display in the results table.
 */
export function formatCellValue(val: any, locale: string): string {
    if (val === null) {
        return '<span class="null-value">[NULL]</span>';
    } else if (val instanceof Uint8Array) {
        return '[Blob]';
    } else if (typeof val === 'number') {
        if (!Number.isInteger(val)) {
            try { return val.toLocaleString(locale); } catch (e) { return val.toString(); }
        } else {
            return val.toString();
        }
    } else if (val instanceof Date) {
        try { return val.toLocaleString(locale); } catch (e) { return val.toString(); }
    } else if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val);
    }
    return String(val);
}

/**
 * Returns the HTML for an error message.
 */
export function getErrorHtml(message: string): string {
    return `
        <div class="error-container">
            <div class="error-icon">⚠</div>
            <div class="error-content">
                <div class="error-title">Execution Error</div>
                <div class="error-message">${message}</div>
            </div>
        </div>
    `;
}

/**
 * Returns the HTML for the "no results" state.
 */
export function getNoResultsHtml(affectedRows: number | undefined): string {
    if (affectedRows !== undefined && affectedRows >= 0) {
        return `
            <div class="no-results-bar">
                <div style="font-size: 1.1em; font-style: italic;">Query executed successfully. No rows returned.</div>
                ${affectedRows > 0 ? `<div style="margin-top: 5px; font-weight: bold;">${affectedRows} rows affected.</div>` : ''}
            </div>
        `;
    }
    return `
        <div class="no-results-bar">
            <div style="font-size: 1.1em; font-style: italic;">Query executed successfully. No rows returned.</div>
        </div>
    `;
}

import { iconChevronDown } from './icons';

/**
 * Returns the HTML for the results data table.
 */
export function getResultsTableHtml(results: any[], locale: string, hasMore: boolean, showButtons: boolean = true, transactionAction?: string, encoding?: string, tableName?: string): string {
    const columns = Object.keys(results[0]);
    const headerRow = '<th></th>' + columns.map((col, idx) => `
        <th data-col-index="${idx + 1}">
            <div class="col-header-content">
                <span class="col-name">${col}</span>
                <span class="col-dropdown-trigger" onclick="showColumnMenu(event, this, ${idx + 1})">${iconChevronDown}</span>
            </div>
        </th>`).join('');
    
    const rowsHtml = results.map((row, index) => {
        const cells = columns.map(col => {
            const val = formatCellValue(row[col], locale);
            return `<td>${val}</td>`;
        }).join('');
        return `<tr><td class="row-index">${index + 1}</td>${cells}</tr>`;
    }).join('');

    let loadMoreButtonHtml = '';
    if (hasMore) {
        if (showButtons) {
            loadMoreButtonHtml = `<div class="load-more-container"><button id="loadMoreBtn" onclick="loadMore()">Load More Results</button></div>`;
        } else {
             let btnText = 'Load More (Transaction closed)';
             if (transactionAction && transactionAction.toLowerCase().includes('rolled back')) {
                 btnText = 'Load More (Rolled back)';
             }
             loadMoreButtonHtml = `<div class="load-more-container"><button id="loadMoreBtn" disabled>${btnText}</button></div>`;
        }
    }

    const defaultFilename = (tableName || 'export') + '.csv';
    const defaultEncoding = encoding || 'UTF8';

    return `
        <div class="export-bar">
            <button id="exportCsvBtn" onclick="showCsvModal()">⤓ Export CSV</button>
        </div>
        <div class="table-container">
            <table>
                <thead><tr>${headerRow}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            ${loadMoreButtonHtml}
        </div>
        <div class="csv-modal-overlay" id="csvModalOverlay">
            <div class="csv-modal">
                <h3>Export to CSV</h3>
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
                    <label for="csvEncoding">Encoding</label>
                    <input type="text" id="csvEncoding" value="${defaultEncoding}" />
                </div>
                <div class="csv-modal-field">
                    <label for="csvFilename">Filename</label>
                    <input type="text" id="csvFilename" value="${defaultFilename}" />
                </div>
                <div class="csv-modal-buttons">
                    <button class="btn-cancel" onclick="hideCsvModal()">Cancel</button>
                    <button class="btn-export" onclick="exportCsv()">Export to file</button>
                </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generates row HTML for appending to an existing table (used by _appendRowsToWebview).
 */
export function generateRowsHtml(rows: any[], startIndex: number, locale: string): string {
    if (rows.length === 0) return '';
    const columns = Object.keys(rows[0]);
    return rows.map((row, idx) => {
        const rowIndex = startIndex + idx + 1;
        const cells = columns.map(col => {
            const val = formatCellValue(row[col], locale);
            return `<td>${val}</td>`;
        }).join('');
        return `<tr><td class="row-index">${rowIndex}</td>${cells}</tr>`;
    }).join('');
}
