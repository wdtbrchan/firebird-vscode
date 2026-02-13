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
                <div style="font-size: 1.1em; font-style: italic;">No rows returned.</div>
                ${affectedRows > 0 ? `<div style="margin-top: 5px; font-weight: bold;">${affectedRows} rows affected.</div>` : ''}
            </div>
        `;
    }
    return `
        <div class="no-results-bar">
            <div style="font-size: 1.1em; font-style: italic;">No rows returned.</div>
        </div>
    `;
}

/**
 * Returns the HTML for the results data table.
 */
export function getResultsTableHtml(results: any[], locale: string, hasMore: boolean): string {
    const columns = Object.keys(results[0]);
    const headerRow = '<th></th>' + columns.map(col => `<th>${col}</th>`).join('');
    
    const rowsHtml = results.map((row, index) => {
        const cells = columns.map(col => {
            const val = formatCellValue(row[col], locale);
            return `<td>${val}</td>`;
        }).join('');
        return `<tr><td class="row-index">${index + 1}</td>${cells}</tr>`;
    }).join('');

    return `
        <div class="table-container">
            <table>
                <thead><tr>${headerRow}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            ${hasMore ? `<div class="load-more-container"><button id="loadMoreBtn" onclick="loadMore()">Load More Results</button></div>` : ''}
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
