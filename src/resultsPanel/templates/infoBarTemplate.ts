/**
 * Info bar template - query info, stats, and transaction area.
 */

import { iconCommit, iconRollback } from './icons';

export interface InfoBarParams {
    query: string | undefined;
    timeText: string;
    rowsText: string;
    showButtons: boolean;
    transactionAction: string | undefined;
}

/**
 * Returns the HTML for the transaction area (right 1/3 of info bar).
 */
function getTransactionAreaHtml(showButtons: boolean, transactionAction: string | undefined): string {
    let rightSectionHtml = '<div id="transaction-area" style="width:100%; height:100%; display:flex;">';

    if (showButtons) {
        // Active Transaction -> Bold Icon Buttons
        rightSectionHtml += `
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
    } else if (transactionAction) {
        // Finished Transaction -> Status
        let statusClass = '';
        let icon = '';
        const actionLower = transactionAction.toLowerCase();
        if (actionLower.includes('committed')) {
            statusClass = 'committed';
            icon = iconCommit;
        } else if (actionLower.includes('roll')) {
            statusClass = 'rollbacked';
            icon = iconRollback;
        }

        rightSectionHtml += `
            <div class="transaction-status ${statusClass}">
                <span style="font-size: 1.2em; margin-right: 8px;">${icon}</span>
                <span style="font-weight: 600;">${transactionAction}</span>
            </div>
        `;
    } else {
        // Empty right section if no transaction state
        rightSectionHtml += '<div class="transaction-placeholder"></div>';
    }
    rightSectionHtml += '</div>';

    return rightSectionHtml;
}

/**
 * Returns the full info bar HTML.
 */
export function getInfoBarHtml(params: InfoBarParams): string {
    let firstLineQuery = '';
    if (params.query) {
        const cleanQuery = params.query.replace(/\s+/g, ' ').trim();
        firstLineQuery = cleanQuery.length > 80 ? cleanQuery.substring(0, 80) + '...' : cleanQuery;
    }

    const rightSectionHtml = getTransactionAreaHtml(params.showButtons, params.transactionAction);

    return `
        <div class="info-bar">
            <div class="info-left">
                <div class="info-row query" title="${params.query || ''}">${firstLineQuery}</div>
                <div class="info-row stats">
                    <span class="badged">Time: ${params.timeText}</span>
                    <span class="badged" id="stats-rows">${params.rowsText}</span>
                </div>
            </div>
            <div class="info-right">
                ${rightSectionHtml}
            </div>
        </div>
    `;
}
