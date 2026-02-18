/**
 * JavaScript code injected into the results panel webview.
 */

import { iconCommit, iconRollback } from './icons';

/**
 * Returns the webview JavaScript for commit/rollback, loadMore, and transaction updates.
 * @param autoRollbackAt - Timestamp for auto-rollback deadline, or 0.
 */
export function getWebviewScripts(autoRollbackAt: number): string {
    return `
        const vscode = acquireVsCodeApi();
        function commit() { vscode.postMessage({ command: 'commit' }); }
        function rollback() { vscode.postMessage({ command: 'rollback' }); }
        function loadMore() { 
            const btn = document.getElementById('loadMoreBtn');
            if(btn) {
                btn.innerText = 'Loading...';
                btn.disabled = true;
            }
            vscode.postMessage({ command: 'loadMore' }); 
        }
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

            if (message.command === 'updateTransaction') {
                const area = document.getElementById('transaction-area');
                if (area) {
                    if (message.hasTransaction) {
                        area.innerHTML = \`
                            <div class="transaction-buttons">
                                <button class="btn-block rollback" onclick="rollback()" title="ROLLBACK" style="position: relative;">
                                    ${iconRollback}
                                    <span id="rollbackTimer" style="font-size: 10px; position: absolute; bottom: 4px; left: 0; right: 0; text-align: center;"></span>
                                </button>
                                <button class="btn-block commit" onclick="commit()" title="COMMIT">
                                    ${iconCommit}
                                </button>
                            </div>
                        \`;
                        rollbackDeadline = message.autoRollbackAt || 0;
                        updateTimer();
                    } else if (message.lastAction) {
                        const isCommit = message.lastAction.toLowerCase().includes('committed');
                        const statusClass = isCommit ? 'committed' : 'rollbacked';
                        const icon = isCommit 
                            ? \`${iconCommit}\`
                            : \`${iconRollback}\`;
                        area.innerHTML = \`
                            <div class="transaction-status \${statusClass}">
                                <span style="font-size: 1.2em; margin-right: 8px; display: flex;">\${icon}</span>
                                <span style="font-weight: 600;">\${message.lastAction}</span>
                            </div>
                        \`;
                        
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

                        rollbackDeadline = 0;
                        updateTimer();
                    }
                }
            }
        });

        let rollbackDeadline = ${autoRollbackAt};
        function updateTimer() {
            const span = document.getElementById('rollbackTimer');
            if (!rollbackDeadline || !span) return;
            const now = Date.now();
            const remaining = Math.ceil((rollbackDeadline - now) / 1000);
            if (remaining >= 0) {
                span.innerText = remaining + 's';
            } else {
                span.innerText = '';
            }
        }
        if (rollbackDeadline > 0) setInterval(updateTimer, 1000);
        updateTimer(); 

        // --- Context Menu & Copy Functionality ---
        (function() {
            let contextMenu = null;
            let currentTargetCell = null;

            function createContextMenu() {
                if (contextMenu) return;
                contextMenu = document.createElement('div');
                contextMenu.className = 'context-menu';
                contextMenu.innerHTML = \`
                    <div class="context-menu-item" id="cm-copy-val">Copy Value</div>
                    <div class="context-menu-item" id="cm-copy-col">Copy Column '...'</div>
                    <div class="context-menu-separator"></div>
                    <div class="context-menu-item" id="cm-copy-table">Copy All</div>
                \`;
                document.body.appendChild(contextMenu);

                contextMenu.querySelector('#cm-copy-val').addEventListener('click', () => {
                   if(currentTargetCell) copyToClipboard(currentTargetCell.innerText);
                   hideContextMenu();
                });

                contextMenu.querySelector('#cm-copy-col').addEventListener('click', () => {
                   if(currentTargetCell) copyColumn(currentTargetCell.cellIndex);
                   hideContextMenu();
                });

                contextMenu.querySelector('#cm-copy-table').addEventListener('click', () => {
                   copyTable();
                   hideContextMenu();
                });
            }

            function showContextMenu(e, cell) {
                e.preventDefault();
                createContextMenu();
                currentTargetCell = cell;

                // Update column name in menu
                const table = document.querySelector('table');
                if (table) {
                    const header = table.rows[0].cells[cell.cellIndex];
                    const colName = header ? header.innerText : 'Column';
                    const item = document.getElementById('cm-copy-col');
                    if (item) item.innerText = \`Copy Column '\${colName}'\`;
                }

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
                         text += row.cells[colIndex].innerText + '\\n';
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
                     text += headerCells[j].innerText + (j < headerCells.length - 1 ? '\\t' : '');
                 }
                 text += '\\n';

                 // Rows
                 for (let i = 1; i < table.rows.length; i++) {
                     const row = table.rows[i];
                     for (let j = 1; j < row.cells.length; j++) {
                         text += row.cells[j].innerText + (j < row.cells.length - 1 ? '\\t' : '');
                     }
                     text += '\\n';
                 }
                 copyToClipboard(text);
            }

        })();
    `;
}

/**
 * Returns the JavaScript for the loading page timer.
 * @param startTime - Timestamp when execution started.
 */
export function getLoadingScript(startTime: number): string {
    return `
        (function() {
            const startTime = ${startTime};
            const timerEl = document.getElementById('executing-timer');
            
            if (timerEl) {
                function update() {
                    const now = Date.now();
                    const diff = ((now - startTime) / 1000).toFixed(1);
                    timerEl.textContent = diff + 's';
                }
                setInterval(update, 100);
                update(); 
            }
        })();
    `;
}
