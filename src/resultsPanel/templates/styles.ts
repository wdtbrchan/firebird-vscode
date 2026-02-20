/**
 * CSS styles for the results panel webview.
 */

/**
 * Returns the main CSS styles for the results page.
 * @param connectionColor - Hex color for the "Load More" button, or empty string.
 */
export function getMainStyles(connectionColor: string): string {
    return `
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0 !important; margin: 0 !important; font-size: 13px; display: flex; flex-direction: column; height: 100vh; background-color: transparent; overflow: hidden !important; }
        
        :root {
            --trans-green: #3e5c3e; /* Dark grayish green */
            --trans-red: #4d2626;   /* Dark grayish red */
            --trans-txt: #ccc;
        }
        body.vscode-light {
            --trans-green: #52ff52; /* Light grayish green */
            --trans-red: #f76c6c;   /* Light grayish red */
            --trans-txt: #444;
        }
        
        /* Top Bar */
        .header-container {
            width: 100%;
            box-sizing: border-box;
            padding: 0;
            height: 32px;
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }
        .db-icon { display: flex; align-items: center; margin: 0 8px 0 15px; }
        
        /* Info Bar */
        .info-bar {
            width: 100%;
            box-sizing: border-box;
            background-color: #333; /* Dark gray */
            color: #ddd;
            display: flex;
            flex-shrink: 0;
            border-bottom: 1px solid #222;
            min-height: 60px;
        }
        .info-left {
            width: 66.66%;
            padding: 10px 15px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 5px;
            border-right: 1px solid #444;
        }
        .info-right {
            width: 33.33%;
            padding: 0; /* No padding, buttons fill area */
            display: flex;
        }
        
        .info-row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .info-row.query { font-family: Consolas, 'Courier New', monospace; font-size: 0.9em; color: #fff; opacity: 0.9; }
        .info-row.stats { font-size: 0.85em; color: #aaa; display: flex; gap: 15px; }
        
        .transaction-buttons { display: flex; width: 100%; height: 100%; background-color: transparent; gap: 0; }
        .btn-block {
            flex: 1;
            border: 0 !important;
            outline: none !important;
            color: var(--trans-txt);
            cursor: pointer;
            transition: opacity 0.2s;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border-radius: 0;
            height: 100%;
            margin: 0;
            padding: 0;
        }
        .btn-block svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }
        .btn-block.commit { background-color: var(--trans-green); }
        .btn-block.commit:hover { filter: brightness(115%); }
        .btn-block.rollback { background-color: var(--trans-red); }
        .btn-block.rollback:hover { filter: brightness(115%); }
        
        .transaction-status {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--trans-txt);
        }
        .transaction-status.committed { background-color: var(--trans-green); }
        .transaction-status.rollbacked { background-color: var(--trans-red); }
        .transaction-placeholder { background-color: #2e2e2e; width: 100%; height: 100%; }

        /* Content Area */
        .content-area {
            flex-grow: 1;
            overflow: hidden; /* Let child container handle scroll */
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            position: relative;
            margin: 0;
            padding: 0;
        }
        
        /* Table */
        .table-container { 
            width: 100%; 
            overflow: auto; 
            height: 100%; 
            margin: 0;
            padding: 0;
        }
        table { 
            border-collapse: separate; 
            border-spacing: 0;
            width: 100%; 
            font-size: 12px; 
            margin: 0;
            padding: 0;
        }
        th, td { 
            padding: 4px 8px; 
            text-align: left; 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            max-width: 300px; 
            border-right: 1px solid var(--vscode-panel-border);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        /* Left border for first column */
        th:first-child, td:first-child {
            border-left: 1px solid var(--vscode-panel-border);
        }
        
        th { 
            position: sticky; 
            top: 0; 
            z-index: 20; 
            background-color: #333; 
            font-weight: 700; 
            color: #fff; 
            /* Override borders for header */
            border-right: 1px solid #555;
            border-bottom: 2px solid #555; 
            border-top: 1px solid #555; /* Ensure top border exists */
            margin-top: 0;
        }
         /* First header gets left border too */
        th:first-child {
            border-left: 1px solid #555;
        }
        
        .row-index { background-color: #2a2a2a; color: #aaa; text-align: center; font-weight: bold; border-right: 2px solid #555; width: 1px; white-space: nowrap; padding: 4px 6px; }
        
        /* Hover effect */
        tbody tr:hover { background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.1)); }
        tbody tr:hover .row-index { background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.1)); }
        
        .no-results-bar { width: 100%; padding: 15px 20px; box-sizing: border-box; background-color: #333; color: #fff; }
        
        /* Error */
        .error-container {
            padding: 20px;
            display: flex;
            gap: 15px;
            background-color: #333; /* Dark gray */
            color: #ff9999;
            border-bottom: 1px solid #5c2b2b;
        }
        .error-icon { font-size: 2em; }
        .error-title { font-weight: bold; font-size: 1.1em; margin-bottom: 5px; }
        .error-message { font-family: monospace; white-space: pre-wrap; word-break: break-all; }
        
        /* Empty State */
        .empty-state { padding: 40px; text-align: center; }
        
        /* Theme overrides */
        body.vscode-light .info-bar { background-color: #e0e0e0; color: #333; border-bottom: 1px solid #e5e5e5; }
        body.vscode-light .info-left { border-right: 1px solid #e5e5e5; }
        body.vscode-light .info-row.query { color: #222; }
        body.vscode-light .transaction-placeholder { background-color: #d6d6d6; }
        body.vscode-light .error-container { background-color: #fff0f0; color: #d32f2f; border-bottom: 1px solid #ffcdd2; }
        body.vscode-light th { background-color: #e0e0e0; color: #333; border-right: 1px solid #ccc; border-bottom: 2px solid #ccc; border-top: 1px solid #ccc; }
        body.vscode-light .row-index { background-color: #f0f0f0; color: #666; border-right: 2px solid #ccc; }
        body.vscode-light .no-results-bar { background-color: #e0e0e0; color: #333; }
        
        .null-value { color: #888; font-style: italic; }
        
        /* Load More */
        .load-more-container { padding: 0; margin: 0; text-align: center; border-top: 1px solid var(--vscode-panel-border); }
        #loadMoreBtn {
            display: block;
            width: 100%;
            min-height: 60px;
            padding: 10px 15px;
            ${
                connectionColor 
                ? `background-color: ${connectionColor};` 
                : `background-color: #444;`
            }
            color: white;
            font-weight: bold;
            border: none;
            border-radius: 0;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        #loadMoreBtn:hover { 
            ${
                connectionColor 
                ? `filter: brightness(85%);` 
                : `background-color: #333;`
            }
        }
        #loadMoreBtn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }

        /* Export CSV Button */
        .export-bar {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        #exportCsvBtn {
            padding: 3px 10px;
            font-size: 12px;
            background-color: transparent;
            color: var(--vscode-button-secondaryForeground, #ccc);
            border: 1px solid var(--vscode-button-secondaryBackground, #555);
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: background-color 0.15s;
        }
        #exportCsvBtn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground, #444);
        }

        /* CSV Modal */
        .csv-modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 2000;
            align-items: center;
            justify-content: center;
        }
        .csv-modal-overlay.visible { display: flex; }
        .csv-modal {
            background-color: #252526;
            border: 1px solid #454545;
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            padding: 20px 24px;
            min-width: 380px;
            max-width: 440px;
            color: #ccc;
        }
        .csv-modal h3 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #fff;
        }
        .csv-modal-field {
            margin-bottom: 12px;
        }
        .csv-modal-field label {
            display: block;
            font-size: 12px;
            margin-bottom: 4px;
            color: #aaa;
        }
        .csv-modal-field input,
        .csv-modal-field select {
            width: 100%;
            box-sizing: border-box;
            padding: 5px 8px;
            font-size: 13px;
            background-color: #3c3c3c;
            color: #ccc;
            border: 1px solid #555;
            border-radius: 3px;
            outline: none;
        }
        .csv-modal-field input:focus,
        .csv-modal-field select:focus {
            border-color: var(--vscode-focusBorder, #007fd4);
        }
        .csv-modal-buttons {
            display: flex;
            justify-content: space-between;
            margin-top: 18px;
            gap: 10px;
        }
        .csv-modal-buttons button {
            padding: 6px 16px;
            font-size: 13px;
            border-radius: 3px;
            cursor: pointer;
            border: none;
        }
        .csv-modal-buttons .btn-cancel {
            background-color: transparent;
            color: #ccc;
            border: 1px solid #555;
        }
        .csv-modal-buttons .btn-cancel:hover {
            background-color: #3c3c3c;
        }
        .csv-modal-buttons .btn-export {
            background-color: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
        }
        .csv-modal-buttons .btn-export:hover {
            background-color: var(--vscode-button-hoverBackground, #1177bb);
        }

        /* CSV Modal Light Theme */
        body.vscode-light .csv-modal {
            background-color: #f3f3f3;
            border: 1px solid #cecece;
            color: #333;
        }
        body.vscode-light .csv-modal h3 { color: #222; }
        body.vscode-light .csv-modal-field label { color: #666; }
        body.vscode-light .csv-modal-field input,
        body.vscode-light .csv-modal-field select {
            background-color: #fff;
            color: #333;
            border: 1px solid #cecece;
        }
        body.vscode-light .csv-modal-buttons .btn-cancel {
            color: #333;
            border: 1px solid #cecece;
        }
        body.vscode-light .csv-modal-buttons .btn-cancel:hover {
            background-color: #e0e0e0;
        }

        /* Context Menu */
        .context-menu {
            display: none;
            position: absolute;
            z-index: 1000;
            background-color: #252526;
            border: 1px solid #454545;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            padding: 4px 0;
            min-width: 140px;
            border-radius: 3px;
        }
        .context-menu-item {
            padding: 6px 12px;
            cursor: pointer;
            color: #cccccc;
            font-size: 13px;
            display: flex;
            align-items: center;
        }
        .context-menu-item:hover {
            background-color: #094771;
            color: white;
        }
        .context-menu-separator {
            height: 1px;
            background-color: #454545;
            margin: 4px 0;
        }
        
        /* Context Menu Light Theme Overrides */
        body.vscode-light .context-menu {
            background-color: #f3f3f3;
            border: 1px solid #cecece;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            color: #333;
        }
        body.vscode-light .context-menu-item {
            color: #333;
        }
        body.vscode-light .context-menu-item:hover {
            background-color: #0060c0;
            color: white;
        }
        body.vscode-light .context-menu-separator {
            background-color: #cecece;
        }
    `;
}

/**
 * Returns the CSS styles for the loading page.
 */
export function getLoadingStyles(): string {
    return `
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            flex-direction: column;
            height: 100vh;
            margin: 0 !important;
            padding: 0 !important;
            background-color: transparent;
            color: #fff;
            overflow: hidden;
        }
        .header-container {
             width: 100%;
             box-sizing: border-box;
             padding: 0; 
             display: flex; 
             align-items: center; 
             height: 32px; 
             flex-shrink: 0;
        }
        .db-icon { display: flex; align-items: center; margin: 0 8px 0 15px; }
        .executing-bar {
            width: 100%;
            box-sizing: border-box;
            background-color: #333; /* Dark gray */
            color: #fff;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;                   
            flex-shrink: 0;
            min-height: 60px;
        }
        .executing-bar > div { margin-left: 15px; }
        .executing-bar > span { margin-right: 15px; }
        .spinner {
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 2px solid #ffffff;
            width: 14px;
            height: 14px;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        /* Theme overrides */
        body.vscode-light .executing-bar { background-color: #e0e0e0; color: #333; }
        body.vscode-light .spinner { border: 2px solid rgba(0, 0, 0, 0.1); border-top: 2px solid #333; }
    `;
}
