import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

import { DatabaseConnection } from '../database/types';
import { FavoriteItem } from './treeItems/favoritesItems';
import { findInTree, removeFromTree, insertIntoTree } from './treeUtils';

/**
 * Manages favorites (starred items) for each connection.
 * Handles CRUD operations on favorite objects, scripts, and folders.
 */
export class FavoritesManager {
    public favorites: Map<string, FavoriteItem[]> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private fireChanged: () => void
    ) {
        const savedFavorites = this.context.globalState.get<any[]>('firebird.favoritesList', []);
        savedFavorites.forEach(f => this.favorites.set(f.key, f.value));
    }

    // --- Script Favorites Helpers ---

    public isScriptFavorite(connectionId: string | undefined, scriptId: string): boolean {
        for (const items of this.favorites.values()) {
            if (findInTree<FavoriteItem>(items, i => i.type === 'script' && i.scriptId === scriptId)) {
                return true;
            }
        }
        return false;
    }

    public async removeScriptFavorite(scriptId: string) {
        let changed = false;
        this.favorites.forEach(items => {
            if (removeFromTree<FavoriteItem>(items, i => i.type === 'script' && i.scriptId === scriptId)) {
                changed = true;
            }
        });
        if (changed) {
            this.saveFavorites();
            this.fireChanged();
        }
    }

    // --- Favorites Management ---

    public addFavoriteScript(connectionId: string, scriptId: string, scriptName: string) {
        if (this.getFavorite(connectionId, scriptId, 'script')) return;

        const items = this.favorites.get(connectionId) || [];
        const newItem: FavoriteItem = {
            id: uuidv4(),
            type: 'script',
            label: scriptName,
            scriptId,
            connectionId
        };
        items.push(newItem);
        this.favorites.set(connectionId, items);
        this.saveFavorites();
    }

    public addFavorite(connection: DatabaseConnection, objectName: string, objectType: 'table' | 'view' | 'trigger' | 'procedure' | 'generator' | 'function' | 'index') {
        const items = this.favorites.get(connection.id) || [];
        const newItem: FavoriteItem = {
            id: uuidv4(),
            type: 'object',
            label: objectName,
            objectType,
            connectionId: connection.id
        };
        items.push(newItem);
        this.favorites.set(connection.id, items);
        this.saveFavorites();
    }

    public async removeFavorite(item: FavoriteItem) {
        if (!item.connectionId) return;
        const items = this.favorites.get(item.connectionId) || [];
        if (removeFromTree<FavoriteItem>(items, i => i.id === item.id)) {
            this.favorites.set(item.connectionId, items);
            this.saveFavorites();
        }
    }

    public async clearFavorites(connectionId: string) {
        if (this.favorites.has(connectionId)) {
            this.favorites.set(connectionId, []);
            this.saveFavorites();
        }
    }

    public async createFavoriteFolder(connection: DatabaseConnection, parent?: FavoriteItem) {
        const name = await vscode.window.showInputBox({ prompt: 'Folder Name' });
        if (!name) return;

        const newFolder: FavoriteItem = {
            id: uuidv4(),
            type: 'folder',
            label: name,
            children: [],
            connectionId: connection.id,
            isExpanded: true
        };

        const items = this.favorites.get(connection.id) || [];
        if (parent) {
            insertIntoTree<FavoriteItem>(items, newFolder, i => i.id === parent.id);
        } else {
            items.push(newFolder);
        }
        this.favorites.set(connection.id, items);
        this.saveFavorites();
    }

    public async deleteFavoriteFolder(item: FavoriteItem) {
        return this.removeFavorite(item);
    }

    public async renameFavoriteFolder(item: FavoriteItem) {
        if (!item.connectionId) return;

        const name = await vscode.window.showInputBox({ prompt: 'New Folder Name', value: item.label });
        if (!name) return;

        const items = this.favorites.get(item.connectionId) || [];
        const target = findInTree<FavoriteItem>(items, i => i.id === item.id);
        if (target) {
            target.label = name;
            this.favorites.set(item.connectionId, items);
            this.saveFavorites();
        }
    }

    public async moveFavorite(movedItem: FavoriteItem, targetParent: FavoriteItem | undefined, targetIndex?: number) {
        if (!movedItem.connectionId) return;

        const items = this.favorites.get(movedItem.connectionId) || [];

        const removed = removeFromTree<FavoriteItem>(items, i => i.id === movedItem.id);
        if (!removed) return;

        if (targetParent) {
            insertIntoTree<FavoriteItem>(items, removed, i => i.id === targetParent.id, targetIndex);
        } else {
            const clamped = (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= items.length)
                ? targetIndex
                : items.length;
            items.splice(clamped, 0, removed);
        }

        this.favorites.set(movedItem.connectionId, items);
        this.saveFavorites();
    }

    public getFavorite(connectionId: string, objectName: string, objectType: string): FavoriteItem | undefined {
        const items = this.favorites.get(connectionId) || [];
        return findInTree<FavoriteItem>(items, item => {
            if (item.type === 'object' && item.label === objectName && item.objectType === objectType) return true;
            if (item.type === 'script' && item.scriptId === objectName) return true;
            return false;
        });
    }

    public async removeFavoriteObject(connection: DatabaseConnection, objectName: string, objectType: string) {
        const items = this.favorites.get(connection.id) || [];
        const target = objectName.toUpperCase();
        const removed = removeFromTree<FavoriteItem>(
            items,
            i => i.type === 'object' && i.label.toUpperCase() === target && i.objectType === objectType
        );
        if (removed) {
            this.favorites.set(connection.id, items);
            this.saveFavorites();
        }
    }

    public saveFavorites() {
        const exportData: any[] = [];
        this.favorites.forEach((value, key) => {
            exportData.push({ key, value });
        });
        this.context.globalState.update('firebird.favoritesList', exportData);
        this.fireChanged();
    }

    public async removeFavoriteItem(item: FavoriteItem) {
        let changed = false;

        if (item.connectionId && this.favorites.has(item.connectionId)) {
            const items = this.favorites.get(item.connectionId)!;
            if (removeFromTree<FavoriteItem>(items, i => i.id === item.id)) {
                changed = true;
            }
        } else {
            // Fallback: search all connections if connectionId is missing (stuck items fix)
            this.favorites.forEach(items => {
                if (removeFromTree<FavoriteItem>(items, i => i.id === item.id)) {
                    changed = true;
                }
            });
        }

        if (changed) {
            this.saveFavorites();
        }
    }
}
