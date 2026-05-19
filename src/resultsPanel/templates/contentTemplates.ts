/**
 * Content area templates - results table, error message, no-results state.
 */

/**
 * Escapes HTML characters to prevent rendering them as HTML.
 */
export function escapeHtml(unsafe: string): string {
    if (unsafe === null || unsafe === undefined) {
        return '';
    }
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Formats a cell value for display in the results table.
 */
export function formatCellValue(val: unknown, locale: string): string {
    if (val === null) {
        return '<span class="null-value">[NULL]</span>';
    }
    
    let result: string;
    if (val instanceof Uint8Array) {
        result = '[Blob]';
    } else if (typeof val === 'number') {
        if (!Number.isInteger(val)) {
            try { result = val.toLocaleString(locale); } catch (_e) { result = val.toString(); }
        } else {
            result = val.toString();
        }
    } else if (val instanceof Date) {
        const isDateOnly = val.getHours() === 0 && val.getMinutes() === 0 && val.getSeconds() === 0 && val.getMilliseconds() === 0;
        try {
            if (isDateOnly) {
                result = val.toLocaleDateString(locale);
            } else {
                result = val.toLocaleString(locale);
            }
        } catch (_e) {
            result = val.toString();
        }
    } else if (typeof val === 'object' && val !== null) {
        result = JSON.stringify(val);
    } else {
        result = String(val);
    }
    
    return escapeHtml(result);
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

function getCellKind(rowVal: unknown): 'null' | 'number' | 'date' | 'string' | 'blob' {
    if (rowVal === null) return 'null';
    if (rowVal instanceof Uint8Array) return 'blob';
    if (typeof rowVal === 'number') return 'number';
    if (rowVal instanceof Date) return 'date';
    return 'string';
}

function getRawValue(rowVal: unknown): string {
    if (rowVal === null || rowVal instanceof Uint8Array) return '';
    if (rowVal instanceof Date) {
        const pad = (n: number) => n.toString().padStart(2, '0');
        const isDateOnly = rowVal.getHours() === 0 && rowVal.getMinutes() === 0 && rowVal.getSeconds() === 0 && rowVal.getMilliseconds() === 0;
        return isDateOnly
            ? `${rowVal.getFullYear()}-${pad(rowVal.getMonth()+1)}-${pad(rowVal.getDate())}`
            : `${rowVal.getFullYear()}-${pad(rowVal.getMonth()+1)}-${pad(rowVal.getDate())} ${pad(rowVal.getHours())}:${pad(rowVal.getMinutes())}:${pad(rowVal.getSeconds())}`;
    }
    return String(rowVal);
}

function getCellAttributes(column: string, rowVal: unknown): string {
    const kind = getCellKind(rowVal);
    const attributes = [
        ` data-column-name="${escapeHtml(column)}"`,
        ` data-kind="${kind}"`,
        ` data-raw="${escapeHtml(getRawValue(rowVal))}"`
    ];
    if (kind === 'null') attributes.push(' data-null="true"');
    if (kind === 'number') attributes.push(' data-isnum="true"');
    if (kind === 'blob') attributes.push(' data-editable="false"');
    return attributes.join('');
}

/**
 * Returns the HTML for the results data table.
 */
export function getResultsTableHtml(results: Record<string, unknown>[], locale: string, hasMore: boolean, showButtons: boolean = true, transactionAction?: string, encoding?: string, tableName?: string, decimalSeparator?: string, editableTableName?: string): string {
    const columns = Object.keys(results[0]);
    const headerRow = '<th></th>' + columns.map((col, idx) => `
        <th data-col-index="${idx + 1}">
            <div class="col-header-content">
                <span class="col-name">${escapeHtml(col)}</span>
                <span class="col-dropdown-trigger" onclick="showColumnMenu(event, this, ${idx + 1})">${iconChevronDown}</span>
            </div>
        </th>`).join('');
    
    const rowsHtml = results.map((row, index) => {
        const cells = columns.map(col => {
            const rowVal = row[col];
            const val = formatCellValue(rowVal, locale);
            return `<td${getCellAttributes(col, rowVal)}>${val}</td>`;
        }).join('');
        return `<tr data-row-id="${index + 1}"><td class="row-index">${index + 1}</td>${cells}</tr>`;
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
    const defaultDecimalSeparator = decimalSeparator || '.';

    return `
        <div class="export-bar">
            <button id="exportCsvBtn" onclick="showCsvModal()">⤓ Export CSV</button>
        </div>
        <div class="table-container" data-editable-table="${editableTableName ? escapeHtml(editableTableName) : ''}">
            <table>
                <thead><tr>${headerRow}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            ${loadMoreButtonHtml}
        </div>
        <div class="changes-bar" id="changesBar">
            <div id="changesSummary"></div>
            <div class="changes-actions">
                <button class="btn-secondary" onclick="discardAllChanges()">Discard changes</button>
                <button class="btn-primary" onclick="showSaveChangesModal()">Save changes</button>
            </div>
        </div>
        <div class="edit-modal-overlay" id="editModalOverlay">
            <div class="edit-modal">
                <h3 id="editModalTitle">Edit value</h3>
                <textarea id="editValueTextarea"></textarea>
                <label class="checkbox-row">
                    <input type="checkbox" id="editValueNull" />
                    <span>Set NULL</span>
                </label>
                <div class="edit-modal-buttons">
                    <button class="btn-secondary" onclick="hideEditModal()">Cancel</button>
                    <button class="btn-primary" onclick="applyCellEdit()">Save value</button>
                </div>
            </div>
        </div>
        <div class="edit-modal-overlay" id="saveChangesModalOverlay">
            <div class="edit-modal">
                <h3>Generate UPDATE script</h3>
                <div class="csv-modal-field">
                    <label for="saveTableName">Table</label>
                    <input type="text" id="saveTableName" value="${editableTableName ? escapeHtml(editableTableName) : ''}" />
                </div>
                <div class="csv-modal-field">
                    <label for="savePrimaryKeys">Primary key columns</label>
                    <input type="text" id="savePrimaryKeys" placeholder="ID or ID, TENANT_ID" />
                </div>
                <div id="saveChangesError" class="modal-error"></div>
                <div class="edit-modal-buttons">
                    <button class="btn-secondary" onclick="hideSaveChangesModal()">Cancel</button>
                    <button class="btn-primary" onclick="generateUpdateScript()">Generate SQL</button>
                </div>
            </div>
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
export function generateRowsHtml(rows: Record<string, unknown>[], startIndex: number, locale: string): string {
    if (rows.length === 0) return '';
    const columns = Object.keys(rows[0]);
    return rows.map((row, idx) => {
        const rowIndex = startIndex + idx + 1;
        const cells = columns.map(col => {
            const rowVal = row[col];
            const val = formatCellValue(rowVal, locale);
            return `<td${getCellAttributes(col, rowVal)}>${val}</td>`;
        }).join('');
        return `<tr data-row-id="${rowIndex}"><td class="row-index">${rowIndex}</td>${cells}</tr>`;
    }).join('');
}
