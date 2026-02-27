import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

import { DatabaseConnection } from '../database/types';
import { FavoriteItem } from './treeItems/favoritesItems';

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
        // Load favorites from global state
        const savedFavorites = this.context.globalState.get<any[]>('firebird.favoritesList', []);
        savedFavorites.forEach(f => this.favorites.set(f.key, f.value));
    }

    // --- Script Favorites Helpers ---

    public isScriptFavorite(connectionId: string | undefined, scriptId: string): boolean {
        let found = false;
        this.favorites.forEach((items) => {
            const search = (list: FavoriteItem[]): boolean => {
                for (const item of list) {
                    if (item.type === 'script' && item.scriptId === scriptId) return true;
                    if (item.children && search(item.children)) return true;
                }
                return false;
            };
            if (search(items)) found = true;
        });
        return found;
    }

    public async removeScriptFavorite(scriptId: string) {
        let changed = false;
        this.favorites.forEach((items, connId) => {
            const removeRecursive = (list: FavoriteItem[]): boolean => {
                const idx = list.findIndex(i => i.type === 'script' && i.scriptId === scriptId);
                if (idx !== -1) {
                    list.splice(idx, 1);
                    return true;
                }
                for (const child of list) {
                    if (child.children && removeRecursive(child.children)) return true;
                }
                return false;
            };
            if (removeRecursive(items)) {
                changed = true;
            }
        });
        if (changed) {
            this.saveFavorites();
            this.fireChanged();
        }
    }

    // --- Favorites Management ---

    public async addFavoriteScript(connectionId: string, scriptId: string, scriptName: string) {
        const items = this.favorites.get(connectionId) || [];
        
        if (this.getFavorite(connectionId, scriptId, 'script')) return;

        const newItem: FavoriteItem = {
            id: uuidv4(),
            type: 'script',
            label: scriptName,
            scriptId: scriptId,
            connectionId: connectionId
        };

        items.push(newItem);
        this.favorites.set(connectionId, items);
        this.saveFavorites();
    }

    public async addFavorite(connection: DatabaseConnection, objectName: string, objectType: 'table' | 'view' | 'trigger' | 'procedure' | 'generator' | 'function' | 'index') {
        const items = this.favorites.get(connection.id) || [];
        
        const newItem: FavoriteItem = {
            id: uuidv4(),
            type: 'object',
            label: objectName,
            objectType: objectType,
            connectionId: connection.id
        };

        items.push(newItem);
        this.favorites.set(connection.id, items);
        this.saveFavorites();
    }

    public async removeFavorite(item: FavoriteItem) {
        if (!item.connectionId) return;
        
        const items = this.favorites.get(item.connectionId) || [];
        
        const removeItemRecursive = (list: FavoriteItem[]): boolean => {
            const index = list.findIndex(i => i.id === item.id);
            if (index !== -1) {
                list.splice(index, 1);
                return true;
            }
            
            for (const child of list) {
                if (child.children) {
                     if (removeItemRecursive(child.children)) return true;
                }
            }
            return false;
        };

        if (removeItemRecursive(items)) {
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

        if (parent) {
            const rootItems = this.favorites.get(connection.id) || [];
            const findAndAdd = (list: FavoriteItem[]): boolean => {
                const p = list.find(i => i.id === parent.id);
                if (p) {
                    if (!p.children) p.children = [];
                    p.children.push(newFolder);
                    return true;
                }
                for (const item of list) {
                    if (item.children) {
                        if (findAndAdd(item.children)) return true;
                    }
                }
                return false;
            };
            findAndAdd(rootItems);
            this.favorites.set(connection.id, rootItems);
        } else {
             const items = this.favorites.get(connection.id) || [];
             items.push(newFolder);
             this.favorites.set(connection.id, items);
        }
        this.saveFavorites();
    }
    
    public async deleteFavoriteFolder(item: FavoriteItem) {
         this.removeFavorite(item);
    }

    public async renameFavoriteFolder(item: FavoriteItem) {
        if (!item.connectionId) return;
        
        const name = await vscode.window.showInputBox({ prompt: 'New Folder Name', value: item.label });
        if (!name) return;

        const items = this.favorites.get(item.connectionId) || [];
        
        const findAndRename = (list: FavoriteItem[]): boolean => {
            const target = list.find(i => i.id === item.id);
            if (target) {
                target.label = name;
                return true;
            }
             for (const child of list) {
                if (child.children) {
                     if (findAndRename(child.children)) return true;
                }
            }
            return false;
        };

        if (findAndRename(items)) {
             this.favorites.set(item.connectionId, items);
             this.saveFavorites();
        }
    }

    public async moveFavorite(movedItem: FavoriteItem, targetParent: FavoriteItem | undefined, targetIndex?: number) {
        if (!movedItem.connectionId) return;
        
        const items = this.favorites.get(movedItem.connectionId) || [];
        
        // 1. Remove from old location
        let removed: FavoriteItem | undefined;
        
        const removeRecursive = (list: FavoriteItem[]): boolean => {
            const idx = list.findIndex(i => i.id === movedItem.id);
            if (idx !== -1) {
                removed = list[idx];
                list.splice(idx, 1);
                return true;
            }
            for (const child of list) {
                if (child.children) {
                    if (removeRecursive(child.children)) return true;
                }
            }
            return false;
        };

        if (!removeRecursive(items)) return; // Not found?

        // 2. Add to new location
        if (targetParent) {
            // Find parent
            const addToParent = (list: FavoriteItem[]): boolean => {
                const p = list.find(i => i.id === targetParent.id);
                if (p) {
                    if (!p.children) p.children = [];
                    if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= p.children.length) {
                        p.children.splice(targetIndex, 0, removed!);
                    } else {
                        p.children.push(removed!);
                    }
                    return true;
                }
                for (const child of list) {
                   if (child.children) {
                       if (addToParent(child.children)) return true;
                   }
                }
                return false;
            };
            addToParent(items);
        } else {
            // Add to root
            if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= items.length) {
                items.splice(targetIndex, 0, removed!);
            } else {
                items.push(removed!);
            }
        }
        
        this.favorites.set(movedItem.connectionId, items);
        this.saveFavorites();
    }

    public getFavorite(connectionId: string, objectName: string, objectType: string): FavoriteItem | undefined {
        const items = this.favorites.get(connectionId) || [];
        const find = (list: FavoriteItem[]): FavoriteItem | undefined => {
            for (const item of list) {
                if (item.type === 'object' && item.label === objectName && item.objectType === objectType) {
                    return item;
                }
                if (item.type === 'script' && item.scriptId === objectName) {
                    return item;
                }
                if (item.children) {
                    const found = find(item.children);
                    if (found) return found;
                }
            }
            return undefined;
        };
        return find(items);
    }

    public async removeFavoriteObject(connection: DatabaseConnection, objectName: string, objectType: string) {
        const items = this.favorites.get(connection.id) || [];
        
        const findAndRemove = (list: FavoriteItem[]): boolean => {
            const idx = list.findIndex(i => i.type === 'object' && i.label.toUpperCase() === objectName.toUpperCase() && i.objectType === objectType);
            if (idx !== -1) {
                list.splice(idx, 1);
                return true;
            }
            for (const child of list) {
                if (child.children) {
                    if (findAndRemove(child.children)) return true;
                }
            }
            return false;
        };

        if (findAndRemove(items)) {
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

        const removeRecursive = (list: FavoriteItem[]): boolean => {
             const idx = list.findIndex(i => i.id === item.id);
             if (idx !== -1) {
                 list.splice(idx, 1);
                 return true;
             }
             for (const child of list) {
                 if (child.children) {
                     if (removeRecursive(child.children)) return true;
                 }
             }
             return false;
        };

        if (item.connectionId && this.favorites.has(item.connectionId)) {
            const items = this.favorites.get(item.connectionId)!;
            if (removeRecursive(items)) {
                changed = true;
            }
        } else {
            // Fallback: search all connections if connectionId is missing (stuck items fix)
            this.favorites.forEach((items, connId) => {
                if (removeRecursive(items)) {
                    changed = true;
                }
            });
        }

        if (changed) {
            this.saveFavorites();
        }
    }
}
