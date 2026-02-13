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
