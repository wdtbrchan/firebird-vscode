document.addEventListener('DOMContentLoaded', () => {
    const data = window.INITIAL_DATA;
    if (!data) return;
    
    const startTime = data.startTime;
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

    const cancelBtn = document.getElementById('cancel-query-btn');
    const killBtn = document.getElementById('kill-query-btn');
    if (cancelBtn) {
        const vscode = acquireVsCodeApi();
        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancelQuery' });
            cancelBtn.textContent = 'Cancelling...';
            cancelBtn.style.opacity = '0.7';
            cancelBtn.disabled = true;

            if (killBtn) {
                setTimeout(() => {
                    // If the page hasn't reloaded yet, it means it's stuck.
                    killBtn.style.display = 'inline-block';
                }, 5000);
            }
        });
        
        if (killBtn) {
            killBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'killProcess' });
                killBtn.textContent = 'Killing...';
                killBtn.style.opacity = '0.7';
                killBtn.disabled = true;
            });
        }
    }
});
