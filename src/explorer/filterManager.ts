import * as vscode from 'vscode';

/**
 * Manages filters for database object lists in the explorer.
 * Filters are persisted in globalState.
 */
export class FilterManager {
    private filters: Map<string, string> = new Map();

    constructor(private context: vscode.ExtensionContext) {
        const savedFilters = context.globalState.get<any[]>('firebird.filters', []);
        savedFilters.forEach(f => this.filters.set(f.key, f.value));
    }

    getFilter(connectionId: string, type: string): string {
        return this.filters.get(`${connectionId}|${type}`) || '';
    }

    setFilter(connectionId: string, type: string, value: string) {
        this.filters.set(`${connectionId}|${type}`, value);
    }

    applyFilter(items: string[], filter: string): string[] {
        if (!filter) return items;
        return items.filter(i => i.toLowerCase().includes(filter.toLowerCase()));
    }
}
