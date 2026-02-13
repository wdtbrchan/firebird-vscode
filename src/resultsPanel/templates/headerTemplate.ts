/**
 * Header bar template and connection color resolver.
 */

import { iconDatabase } from './icons';

/**
 * Maps a named connection color to its hex value.
 */
export function resolveConnectionColor(color: string | undefined): string {
    if (!color) return '';
    switch (color) {
        case 'red': return '#F14C4C';
        case 'orange': return '#d18616';
        case 'yellow': return '#CCA700';
        case 'green': return '#37946e';
        case 'blue': return '#007acc';
        case 'purple': return '#652d90';
        default: return '';
    }
}

/**
 * Generates the top header bar HTML with database icon and context title.
 */
export function getHeaderHtml(contextTitle: string, connectionColor: string): string {
    const bgStyle = connectionColor
        ? `background-color: ${connectionColor}; color: #fff;`
        : `background-color: #444; color: #fff;`;

    return `
        <div class="header-container" style="${bgStyle}">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="db-icon">
                    ${iconDatabase}
                </div>
                <div style="font-size: 0.9em; font-weight: 700;">${contextTitle}</div>
            </div>
        </div>
    `;
}
