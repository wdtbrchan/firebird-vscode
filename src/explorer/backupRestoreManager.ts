import * as vscode from 'vscode';

import { ConnectionGroup } from './treeItems/databaseItems';
import { DatabaseConnection } from '../database/types';
import { FavoriteItem } from './treeItems/favoritesItems';
import { ScriptService } from '../services/scriptService';

/**
 * Helper for merging recursive tree structures (Favorites, Scripts) based on ID.
 */
export function mergeTrees(existing: any[], incoming: any[]) {
    for (const newItem of incoming) {
        const existingItem = existing.find(e => e.id === newItem.id);
        if (existingItem) {
             if (newItem.children && newItem.children.length > 0) {
                 if (!existingItem.children) existingItem.children = [];
                 mergeTrees(existingItem.children, newItem.children);
             }
        } else {
            existing.push(newItem);
        }
    }
}

/**
 * Backup connections, groups, favorites, and scripts to a JSON file.
 */
export async function backupConnections(
    connections: DatabaseConnection[],
    groups: ConnectionGroup[],
    favorites: Map<string, FavoriteItem[]>
) {
    const result = await vscode.window.showSaveDialog({
        filters: { 'JSON': ['json'] },
        defaultUri: vscode.Uri.file('firebird-connections.json'),
        saveLabel: 'Backup'
    });

    if (!result) return;

    // Convert favorites Map to object
    const favoritesObj: { [key: string]: FavoriteItem[] } = {};
    favorites.forEach((value, key) => {
        favoritesObj[key] = value;
    });

    const scriptState = ScriptService.getInstance().getFullState();

    const data = {
        connections: connections,
        groups: groups,
        favorites: favoritesObj,
        scripts: {
            shared: scriptState.shared,
            connections: scriptState.connections
        }
    };

    try {
        await vscode.workspace.fs.writeFile(result, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
        vscode.window.showInformationMessage('Configuration backed up successfully.');
    } catch (err: any) {
        vscode.window.showErrorMessage(`Backup failed: ${err.message}`);
    }
}

/**
 * Restore connections, groups, favorites, and scripts from a JSON file.
 * Returns the restored data or undefined if cancelled/failed.
 */
export async function restoreConnections(
    currentConnections: DatabaseConnection[],
    currentGroups: ConnectionGroup[],
    favorites: Map<string, FavoriteItem[]>
): Promise<{ connections: DatabaseConnection[], groups: ConnectionGroup[], activeConnectionId: string | undefined } | undefined> {
    const result = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON': ['json'] },
        openLabel: 'Restore'
    });

    if (!result || result.length === 0) return undefined;

    try {
        const content = await vscode.workspace.fs.readFile(result[0]);
        const jsonStr = Buffer.from(content).toString('utf8');
        const data = JSON.parse(jsonStr);

        if (!Array.isArray(data.connections) && !Array.isArray(data.groups)) {
             vscode.window.showErrorMessage('Invalid backup file format: Missing connections or groups array.');
             return undefined;
        }

        const choice = await vscode.window.showWarningMessage(
            'Do you want to clear existing configuration before restoring?',
            { modal: true },
            'Yes, Clear and Restore',
            'No, Merge'
        );

        if (!choice) return undefined;

        let connections: DatabaseConnection[];
        let groups: ConnectionGroup[];
        const activeConnectionId: string | undefined = undefined;

        if (choice === 'Yes, Clear and Restore') {
            connections = data.connections || [];
            groups = data.groups || [];
            
            // Restore Favorites
            favorites.clear();
            if (data.favorites) {
                for (const key in data.favorites) {
                    favorites.set(key, data.favorites[key]);
                }
            }
            
            // Restore Scripts
            if (data.scripts) {
                const state = {
                    shared: data.scripts.shared || [],
                    connections: data.scripts.connections || data.scripts.local || {}
                };
                ScriptService.getInstance().setFullState(state);
            }
        } else {
            // Merge logic
            connections = [...currentConnections];
            groups = [...currentGroups];

            const newConns = (data.connections || []) as DatabaseConnection[];
            const newGroups = (data.groups || []) as ConnectionGroup[];

            const existingConnIds = new Set(connections.map(c => c.id));
            const existingGroupIds = new Set(groups.map(g => g.id));

            let addedC = 0;
            let addedG = 0;

            for (const g of newGroups) {
                if (!existingGroupIds.has(g.id)) {
                    groups.push(g);
                    existingGroupIds.add(g.id);
                    addedG++;
                }
            }

            for (const c of newConns) {
                 if (!existingConnIds.has(c.id)) {
                     connections.push(c);
                     existingConnIds.add(c.id);
                     addedC++;
                 }
            }

            // Merge Favorites
            if (data.favorites) {
                for (const connId in data.favorites) {
                    const newFavs = data.favorites[connId] as FavoriteItem[];
                    const existingFavs = favorites.get(connId) || [];
                    mergeTrees(existingFavs, newFavs);
                    favorites.set(connId, existingFavs);
                }
            }

            // Merge Scripts
            if (data.scripts) {
                const scriptService = ScriptService.getInstance();
                const currentState = scriptService.getFullState();
                
                if (data.scripts.shared) {
                    mergeTrees(currentState.shared, data.scripts.shared);
                }

                const connectionScripts = data.scripts.connections || data.scripts.local;
                
                if (connectionScripts) {
                    if (!currentState.connections) currentState.connections = {};
                    for (const connId in connectionScripts) {
                         if (!currentState.connections[connId]) currentState.connections[connId] = [];
                         mergeTrees(currentState.connections[connId], connectionScripts[connId]);
                    }
                }
                scriptService.setFullState(currentState);
            }

             vscode.window.showInformationMessage(`Restored: ${addedC} new connections, ${addedG} new groups.`);
        }

        return { connections, groups, activeConnectionId };

    } catch (err: any) {
         vscode.window.showErrorMessage(`Restore failed: ${err.message}`);
         return undefined;
    }
}
