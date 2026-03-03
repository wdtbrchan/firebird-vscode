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
});
