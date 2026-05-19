const vscode = acquireVsCodeApi();
const editedRows = new Map();
let activeEditCell = null;

function init() {
    const data = window.INITIAL_DATA;
    if (!data) return;

    window.rollbackDeadline = data.autoRollbackAt || 0;
    updateTimer();
    if (window.rollbackDeadline > 0) setInterval(updateTimer, 1000);
}

window.commit = function() { vscode.postMessage({ command: 'commit' }); };
window.rollback = function() { vscode.postMessage({ command: 'rollback' }); };
window.loadMore = function() { 
    const btn = document.getElementById('loadMoreBtn');
    if(btn) {
        btn.innerText = 'Loading...';
        btn.disabled = true;
    }
    vscode.postMessage({ command: 'loadMore' }); 
};

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'appendRows') {
        const tbody = document.querySelector('tbody');
        if(tbody) tbody.insertAdjacentHTML('beforeend', message.rowsHtml);
        
        const btn = document.getElementById('loadMoreBtn');
        if (btn) {
            btn.disabled = false;
            if (message.hasMore) btn.innerText = 'Load More Results';
            else btn.parentElement.remove();
        }

        // Update stats in info bar
        const statsSpan = document.getElementById('stats-rows');
        if (statsSpan) {
             statsSpan.innerText = message.rowsText;
        }

        const contentArea = document.querySelector('.content-area');
        if (contentArea) {
            contentArea.scrollBy({ top: 50, behavior: 'smooth' });
        }
    }

    if (message.command === 'csvExportStatus') {
        const statusEl = document.getElementById('csvExportStatusText');
        const formEl = document.getElementById('csvModalForm');
        const overlay = document.getElementById('csvModalOverlay');
        if (statusEl && overlay) {
            if (message.status) {
                statusEl.innerText = message.status;
                statusEl.style.display = 'block';
                statusEl.style.color = message.status.startsWith('Error') ? '#f44' : '';
                if (formEl) formEl.style.display = 'none';
                overlay.classList.add('visible');
            } else {
                statusEl.style.display = 'none';
                statusEl.innerText = '';
                if (formEl) formEl.style.display = 'block';
                overlay.classList.remove('visible');
            }
        }
    }

    if (message.command === 'updateTransaction') {
        const area = document.getElementById('transaction-area');
        if (area) {
            if (message.hasTransaction) {
                // Determine icon from data attribute or fallback
                const iconCommit = window.INITIAL_DATA?.iconCommit || '✓';
                const iconRollback = window.INITIAL_DATA?.iconRollback || '✗';
                
                area.innerHTML = `
                    <div class="transaction-buttons">
                        <button class="btn-block rollback" onclick="rollback()" title="ROLLBACK" style="position: relative;">
                            ${iconRollback}
                            <span id="rollbackTimer" style="font-size: 10px; position: absolute; bottom: 4px; left: 0; right: 0; text-align: center;"></span>
                        </button>
                        <button class="btn-block commit" onclick="commit()" title="COMMIT">
                            ${iconCommit}
                        </button>
                    </div>
                `;
                window.rollbackDeadline = message.autoRollbackAt || 0;
                updateTimer();
            } else if (message.lastAction) {
                const isCommit = message.lastAction.toLowerCase().includes('committed');
                const statusClass = isCommit ? 'committed' : 'rollbacked';
                const iconCommit = window.INITIAL_DATA?.iconCommit || '✓';
                const iconRollback = window.INITIAL_DATA?.iconRollback || '✗';
                
                const icon = isCommit ? iconCommit : iconRollback;
                area.innerHTML = `
                    <div class="transaction-status ${statusClass}">
                        <span style="font-size: 1.2em; margin-right: 8px; display: flex;">${icon}</span>
                        <span style="font-weight: 600;">${message.lastAction}</span>
                    </div>
                `;
                
                // Disable Load More button on transaction end
                const loadMoreBtn = document.getElementById('loadMoreBtn');
                if (loadMoreBtn) {
                    loadMoreBtn.disabled = true;
                    if (!isCommit) { // Rolled back
                        loadMoreBtn.innerText = 'Load More (Rolled back)';
                    } else {
                        loadMoreBtn.innerText = 'Load More (Transaction closed)';
                    }
                }

                window.rollbackDeadline = 0;
                updateTimer();
            }
        }
    }

    if (message.command === 'primaryKeyColumns') {
        const input = document.getElementById('savePrimaryKeys');
        if (input && !input.value.trim()) {
            input.value = (message.columns || []).join(', ');
        }
    }

    if (message.command === 'updateScriptError') {
        const error = document.getElementById('saveChangesError');
        if (error) error.innerText = message.message || 'Unable to generate SQL.';
    }
});

function updateTimer() {
    const span = document.getElementById('rollbackTimer');
    if (!window.rollbackDeadline || !span) return;
    const now = Date.now();
    const remaining = Math.ceil((window.rollbackDeadline - now) / 1000);
    if (remaining >= 0) {
        span.innerText = remaining + 's';
    } else {
        span.innerText = '';
    }
}

// --- Context Menu & Copy Functionality ---
(function() {
    let contextMenu = null;
    let currentTargetCell = null;

    function createContextMenu() {
        if (contextMenu) return;
        contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.innerHTML = `
            <div class="context-menu-item" id="cm-copy-val">Copy Value</div>
            <div class="context-menu-item" id="cm-copy-col">Copy Column '...'</div>
            <div class="context-menu-item" id="cm-copy-col-list">Copy Column as list</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" id="cm-copy-table">Copy All</div>
        `;
        document.body.appendChild(contextMenu);

        contextMenu.querySelector('#cm-copy-val').addEventListener('click', () => {
           if(currentTargetCell) copyToClipboard(currentTargetCell.innerText);
           hideContextMenu();
        });

        contextMenu.querySelector('#cm-copy-col').addEventListener('click', () => {
           if(currentTargetCell) copyColumn(currentTargetCell.cellIndex);
           hideContextMenu();
        });

        contextMenu.querySelector('#cm-copy-col-list').addEventListener('click', () => {
           if(currentTargetCell) copyColumnAsList(currentTargetCell.cellIndex);
           hideContextMenu();
        });

        contextMenu.querySelector('#cm-copy-table').addEventListener('click', () => {
           copyTable();
           hideContextMenu();
        });
    }

    function updateContextMenuContent(colIndex) {
        const table = document.querySelector('table');
        if (!table) return;
        
        const header = table.rows[0].cells[colIndex];
        const colNameElt = header ? header.querySelector('.col-name') : null;
        const colName = colNameElt ? colNameElt.innerText : (header ? header.innerText : 'Column');
        
        const copyValItem = document.getElementById('cm-copy-val');
        const copyColItem = document.getElementById('cm-copy-col');
        const copyColListItem = document.getElementById('cm-copy-col-list');
        
        if (copyColItem) copyColItem.innerText = `Copy Column '${colName}'`;
        if (copyColListItem) copyColListItem.innerText = `Copy Column '${colName}' as list`;
        if (copyValItem) {
            copyValItem.style.display = (currentTargetCell && currentTargetCell.tagName === 'TD') ? 'block' : 'none';
        }
    }

    window.showColumnMenu = function(e, trigger, colIndex) {
        e.preventDefault();
        e.stopPropagation();
        createContextMenu();
        
        currentTargetCell = { cellIndex: colIndex, tagName: 'TH' }; 
        updateContextMenuContent(colIndex);

        contextMenu.style.display = 'block';
        const rect = trigger.getBoundingClientRect();
        
        let left = rect.left;
        let top = rect.bottom;
        
        const menuWidth = contextMenu.offsetWidth || 150;
        if (left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 5;
        }

        contextMenu.style.left = left + 'px';
        contextMenu.style.top = top + 'px';
    };

    function showContextMenu(e, cell) {
        e.preventDefault();
        createContextMenu();
        currentTargetCell = cell;

        updateContextMenuContent(cell.cellIndex);

        const menuWidth = contextMenu.offsetWidth || 150;
        const menuHeight = contextMenu.offsetHeight || 100;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let left = e.clientX;
        let top = e.clientY;

        if (left + menuWidth > windowWidth) left = windowWidth - menuWidth;
        if (top + menuHeight > windowHeight) top = windowHeight - menuHeight;

        contextMenu.style.left = left + 'px';
        contextMenu.style.top = top + 'px';
        contextMenu.style.display = 'block';
    }

    function hideContextMenu() {
        if (contextMenu) contextMenu.style.display = 'none';
        currentTargetCell = null;
    }

    // Global click to close menu
    document.addEventListener('click', (e) => {
        if (contextMenu && contextMenu.style.display === 'block') {
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        }
    });

    // Delegate right-click logic
    document.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest('td');
        if (cell && cell.closest('table')) {
            // Start from cellIndex 1 to skip row number
            if (cell.cellIndex > 0) { 
                showContextMenu(e, cell);
            }
        }
    });

    function copyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Failed to copy', err);
        }
        document.body.removeChild(textarea);
    }

    function copyColumn(colIndex) {
         const table = document.querySelector('table');
         if (!table) return;
         let text = '';
         // Skip header row usually, but user asked for "values under each other"
         // If strictly values, start from row 1.
         for (let i = 1; i < table.rows.length; i++) {
             const row = table.rows[i];
             if (row.cells.length > colIndex) {
                 text += row.cells[colIndex].innerText + '\n';
             }
         }
         copyToClipboard(text);
    }

    function copyColumnAsList(colIndex) {
         const table = document.querySelector('table');
         if (!table) return;
         let values = [];
         for (let i = 1; i < table.rows.length; i++) {
             const row = table.rows[i];
             if (row.cells.length > colIndex) {
                 const cell = row.cells[colIndex];
                 let val = cell.dataset.raw !== undefined ? cell.dataset.raw : cell.innerText.trim();
                 
                 if (cell.dataset.null === 'true') {
                     values.push('NULL');
                 } else if (cell.dataset.isnum === 'true') {
                     values.push(val);
                 } else {
                     val = val.replace(/'/g, "''");
                     values.push(`'${val}'`);
                 }
             }
         }
         
         let text = '';
         for (let i = 0; i < values.length; i++) {
             text += values[i];
             if (i < values.length - 1) {
                 text += ', ';
                 if ((i + 1) % 5 === 0) {
                     text += '\n';
                 }
             }
         }
         copyToClipboard(text);
    }

    function copyTable() {
         const table = document.querySelector('table');
         if (!table) return;
         let text = '';
         
         // Header
         // Skip first column (row index) by starting at index 1
         const headerCells = table.rows[0].cells;
         for (let j = 1; j < headerCells.length; j++) {
             text += headerCells[j].innerText + (j < headerCells.length - 1 ? '\t' : '');
         }
         text += '\n';

         // Rows
         for (let i = 1; i < table.rows.length; i++) {
             const row = table.rows[i];
             for (let j = 1; j < row.cells.length; j++) {
                 text += row.cells[j].innerText + (j < row.cells.length - 1 ? '\t' : '');
             }
             text += '\n';
         }
         copyToClipboard(text);
    }

})();

function getCellValue(cell) {
    const kind = cell.dataset.kind || 'string';
    if (kind === 'null') return { kind: 'null', value: null };
    return { kind, value: cell.dataset.raw || '' };
}

function renderCellValue(cell, value) {
    cell.dataset.kind = value.kind;
    cell.dataset.raw = value.value === null ? '' : value.value;
    cell.dataset.null = value.kind === 'null' ? 'true' : 'false';
    if (value.kind === 'null') {
        cell.innerHTML = '<span class="null-value">[NULL]</span>';
    } else {
        cell.innerText = value.value || '';
    }
}

function valuesEqual(left, right) {
    return left.kind === right.kind && left.value === right.value;
}

function ensureEditedRow(row) {
    const rowId = row.dataset.rowId;
    if (!editedRows.has(rowId)) {
        const originalValues = {};
        row.querySelectorAll('td[data-column-name]').forEach(cell => {
            originalValues[cell.dataset.columnName] = getCellValue(cell);
        });
        editedRows.set(rowId, {
            rowIndex: Number(rowId),
            row,
            originalValues,
            changedValues: {}
        });
    }
    return editedRows.get(rowId);
}

function updateChangeState() {
    let changedCells = 0;
    editedRows.forEach(entry => {
        const rowChanged = Object.keys(entry.changedValues).length > 0;
        entry.row.classList.toggle('modified-row', rowChanged);
        changedCells += Object.keys(entry.changedValues).length;
    });

    const changedRows = Array.from(editedRows.values()).filter(entry => Object.keys(entry.changedValues).length > 0).length;
    const bar = document.getElementById('changesBar');
    const summary = document.getElementById('changesSummary');
    if (bar) bar.classList.toggle('visible', changedRows > 0);
    if (summary) summary.innerText = `${changedRows} changed row${changedRows === 1 ? '' : 's'}, ${changedCells} changed cell${changedCells === 1 ? '' : 's'}`;
}

window.hideEditModal = function() {
    document.getElementById('editModalOverlay')?.classList.remove('visible');
    activeEditCell = null;
};

window.applyCellEdit = function() {
    if (!activeEditCell) return;
    const textarea = document.getElementById('editValueTextarea');
    const nullCheckbox = document.getElementById('editValueNull');
    const newValue = nullCheckbox && nullCheckbox.checked
        ? { kind: 'null', value: null }
        : { kind: activeEditCell.dataset.kind === 'null' ? 'string' : (activeEditCell.dataset.kind || 'string'), value: textarea ? textarea.value : '' };
    const row = activeEditCell.closest('tr');
    const editedRow = ensureEditedRow(row);
    const columnName = activeEditCell.dataset.columnName;
    const originalValue = editedRow.originalValues[columnName];
    renderCellValue(activeEditCell, newValue);
    if (valuesEqual(originalValue, newValue)) {
        delete editedRow.changedValues[columnName];
        activeEditCell.classList.remove('modified-cell');
    } else {
        editedRow.changedValues[columnName] = newValue;
        activeEditCell.classList.add('modified-cell');
    }
    if (Object.keys(editedRow.changedValues).length === 0) {
        editedRows.delete(row.dataset.rowId);
    }
    updateChangeState();
    window.hideEditModal();
};

window.discardAllChanges = function() {
    editedRows.forEach(entry => {
        entry.row.querySelectorAll('td[data-column-name]').forEach(cell => {
            renderCellValue(cell, entry.originalValues[cell.dataset.columnName]);
            cell.classList.remove('modified-cell');
        });
        entry.row.classList.remove('modified-row');
    });
    editedRows.clear();
    updateChangeState();
};

window.showSaveChangesModal = function() {
    const overlay = document.getElementById('saveChangesModalOverlay');
    const tableName = document.querySelector('.table-container')?.dataset.editableTable || '';
    const tableInput = document.getElementById('saveTableName');
    const error = document.getElementById('saveChangesError');
    if (tableInput && !tableInput.value.trim()) tableInput.value = tableName;
    if (error) error.innerText = '';
    overlay?.classList.add('visible');
    if (tableName) vscode.postMessage({ command: 'requestPrimaryKeyColumns', tableName });
};

window.hideSaveChangesModal = function() {
    document.getElementById('saveChangesModalOverlay')?.classList.remove('visible');
};

window.generateUpdateScript = function() {
    const tableName = document.getElementById('saveTableName')?.value.trim() || '';
    const primaryKeyColumns = (document.getElementById('savePrimaryKeys')?.value || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    const rows = Array.from(editedRows.values())
        .filter(entry => Object.keys(entry.changedValues).length > 0)
        .map(entry => ({
            rowIndex: entry.rowIndex,
            originalValues: entry.originalValues,
            changedValues: entry.changedValues
        }));
    const error = document.getElementById('saveChangesError');
    if (!tableName || primaryKeyColumns.length === 0) {
        if (error) error.innerText = 'Table and primary key columns are required.';
        return;
    }
    vscode.postMessage({ command: 'generateUpdateScript', tableName, primaryKeyColumns, rows });
};

document.addEventListener('click', event => {
    const cell = event.target.closest('td[data-column-name]');
    if (!cell || cell.dataset.editable === 'false') return;
    if (!cell.closest('.table-container')?.dataset.editableTable) return;
    activeEditCell = cell;
    const textarea = document.getElementById('editValueTextarea');
    const nullCheckbox = document.getElementById('editValueNull');
    const title = document.getElementById('editModalTitle');
    if (textarea) textarea.value = cell.dataset.raw || '';
    if (nullCheckbox) nullCheckbox.checked = cell.dataset.kind === 'null';
    if (title) title.innerText = `Edit ${cell.dataset.columnName}`;
    document.getElementById('editModalOverlay')?.classList.add('visible');
    textarea?.focus();
});

// --- CSV Export Modal ---
window.showCsvModal = function() {
    const overlay = document.getElementById('csvModalOverlay');
    if (overlay) overlay.classList.add('visible');
}
window.hideCsvModal = function() {
    const overlay = document.getElementById('csvModalOverlay');
    if (overlay) overlay.classList.remove('visible');
}
window.exportCsv = function() {
    const delimiter = document.getElementById('csvDelimiter').value || ';';
    const qualifier = document.getElementById('csvQualifier').value || '"';
    const encoding = document.getElementById('csvEncoding').value || 'UTF8';
    const filename = document.getElementById('csvFilename').value || 'export.csv';
    const decimalSeparator = document.getElementById('csvDecimalSeparator').value || '.';
    window.hideCsvModal();
    vscode.postMessage({ 
        command: 'exportCsv',
        delimiter: delimiter,
        qualifier: qualifier,
        encoding: encoding,
        filename: filename,
        decimalSeparator: decimalSeparator
    });
}
// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
    init();
    const overlay = document.getElementById('csvModalOverlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) window.hideCsvModal();
        });
    }
    ['editModalOverlay', 'saveChangesModalOverlay'].forEach(id => {
        const modalOverlay = document.getElementById(id);
        if (modalOverlay) {
            modalOverlay.addEventListener('click', function(e) {
                if (e.target === modalOverlay) modalOverlay.classList.remove('visible');
            });
        }
    });
});
