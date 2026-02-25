import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from './databaseTreeDataProvider';
import { FavoritesRootItem, FavoriteFolderItem, FavoriteScriptItem, FavoriteItem } from './treeItems/favoritesItems';
import { ScriptItem, ScriptFolderItem } from './treeItems/scriptItems';
import { ObjectItem, FolderItem } from './treeItems/databaseItems';
import { ScriptService, ScriptItemData } from '../services/scriptService';

export class DropHandlers {
    public static handleFavoriteDrop(
        target: any | undefined,
        dataTransfer: vscode.DataTransfer,
        provider: DatabaseTreeDataProvider
    ): boolean {
        const favTransfer = dataTransfer.get('application/vnd.code.tree.firebird-favorites');
        if (!favTransfer || !favTransfer.value) return false;

        console.log('Processing Favorite Drop');
        const droppedItem = favTransfer.value;
        if (!target) return true;

        const droppedData = droppedItem as FavoriteItem;

        if (target instanceof FavoritesRootItem) {
            if (target.connection.id === droppedData.connectionId) {
                provider.favoritesManager.moveFavorite(droppedData, undefined);
            }
        } else if (target instanceof FavoriteFolderItem) {
            if (target.connection.id === droppedData.connectionId) {
                if (droppedData.id !== target.data.id) {
                    if (droppedData.type === 'folder' && this.isFavoriteDescendant(droppedData, target.data)) {
                        vscode.window.showWarningMessage('Cannot move a folder into its own child.');
                        return true;
                    }
                    provider.favoritesManager.moveFavorite(droppedData, target.data);
                }
            }
        } else if ((target instanceof ObjectItem && target.isFavorite) || target instanceof FavoriteScriptItem) {
            let targetConnId: string | undefined;
            let targetFav: FavoriteItem | undefined;

            if (target instanceof ObjectItem) {
                targetConnId = target.connection.id;
                if (target.favoriteId) {
                    targetFav = this.findFavoriteById(provider, targetConnId, target.favoriteId);
                } else {
                    targetFav = provider.favoritesManager.getFavorite(targetConnId, target.objectName, target.type);
                }
            } else if (target instanceof FavoriteScriptItem) {
                targetConnId = target.connection.id;
                targetFav = target.data;
            }

            if (targetConnId && targetFav && targetConnId === droppedData.connectionId) {
                const list = provider.favoritesManager.favorites.get(targetConnId) || [];
                let parentItem: FavoriteItem | undefined = undefined;
                let targetIndex: number = -1;

                const loc = this.findFavoriteLocation(list, targetFav.id);
                if (loc) {
                    parentItem = loc.parent;
                    targetIndex = loc.index;

                    if (droppedData.id === targetFav.id) return true;

                    provider.favoritesManager.moveFavorite(droppedData, parentItem, targetIndex);
                }
            }
        }
        return true;
    }

    public static handleScriptDrop(
        target: any | undefined,
        dataTransfer: vscode.DataTransfer
    ): boolean {
        const scriptTransfer = dataTransfer.get('application/vnd.code.tree.firebird-scripts');
        if (!scriptTransfer || !scriptTransfer.value) return false;

        const droppedItem = scriptTransfer.value;
        const service = ScriptService.getInstance();

        if (!target) {
            console.log('Dropping on root (undefined target)');
            const isShared = droppedItem.isShared || (droppedItem.data && droppedItem.data.isShared);
            if (isShared) {
                service.moveItem(droppedItem.id, undefined, undefined, true);
            }
            return true;
        }

        const isRootFolder = (target instanceof FolderItem || (target && target.contextValue && (target.contextValue.includes('local-scripts') || target.contextValue.includes('global-scripts'))));
        const isScriptFolder = target instanceof ScriptFolderItem || (target && target.contextValue === 'script-folder');
        const isScript = target instanceof ScriptItem || (target && (target.contextValue === 'script-file' || target.contextValue === 'script-file-favorite'));

        if (isRootFolder && (target.type === 'local-scripts' || target.type === 'global-scripts')) {
            console.log('Dropping on Root Scripts Folder');
            const isGlobal = target.type === 'global-scripts';
            service.moveItem(droppedItem.id, undefined, isGlobal ? undefined : target.connection.id, isGlobal);
        } else if (isScriptFolder) {
            console.log('Dropping on Script Folder');
            const targetData = target.data || target;
            const targetParentId = targetData.id;
            const targetConnId = target.connectionId;

            if (droppedItem.type === 'folder' && droppedItem.id === targetParentId) return true;

            const freshDropped = service.getScriptById(droppedItem.id);
            const freshTarget = service.getScriptById(targetParentId);

            if (freshDropped && freshTarget && freshDropped.type === 'folder' && this.isScriptDescendant(freshDropped, freshTarget)) {
                vscode.window.showWarningMessage('Cannot move a folder into its own child.');
                return true;
            }

            service.moveItem(droppedItem.id, targetParentId, targetConnId, targetConnId === undefined);
        } else if (isScript) {
            console.log('Dropping on Script Item');
            const targetData = target.data || target;
            const targetId = targetData.id;
            const targetConnId = target.connectionId;
            const isGlobal = targetConnId === undefined;
            const collection = service.getScripts(targetConnId);

            let result = this.findScriptListContaining(collection, targetId);
            if (result) {
                let targetIndex = result.list.findIndex(i => i.id === targetId);
                if (targetIndex !== -1) {
                    service.moveItem(droppedItem.id, result.parentId, targetConnId, isGlobal, targetIndex);
                }
            }
        }
        return true;
    }

    private static isFavoriteDescendant(parent: FavoriteItem, potentialChild: FavoriteItem): boolean {
        if (!parent.children) return false;
        for (const child of parent.children) {
            if (child.id === potentialChild.id) return true;
            if (this.isFavoriteDescendant(child, potentialChild)) return true;
        }
        return false;
    }

    private static findFavoriteById(provider: DatabaseTreeDataProvider, connectionId: string, favoriteId: string): FavoriteItem | undefined {
        const find = (arr: FavoriteItem[]): FavoriteItem | undefined => {
            for (const i of arr) {
                if (i.id === favoriteId) return i;
                if (i.children) {
                    const f = find(i.children);
                    if (f) return f;
                }
            }
            return undefined;
        };
        const items = provider.favorites.get(connectionId) || [];
        return find(items);
    }

    private static findFavoriteLocation(arr: FavoriteItem[], targetId: string, parent?: FavoriteItem): { parent: FavoriteItem | undefined, index: number } | undefined {
        const idx = arr.findIndex(i => i.id === targetId);
        if (idx !== -1) {
            return { parent, index: idx };
        }
        for (const child of arr) {
            if (child.children) {
                const res = this.findFavoriteLocation(child.children, targetId, child);
                if (res) return res;
            }
        }
        return undefined;
    }

    private static isScriptDescendant(parent: ScriptItemData, potentialChild: ScriptItemData): boolean {
        if (!parent.children) return false;
        for (const child of parent.children) {
            if (child.id === potentialChild.id) return true;
            if (this.isScriptDescendant(child, potentialChild)) return true;
        }
        return false;
    }

    private static findScriptListContaining(list: ScriptItemData[], targetId: string, parentId?: string): { list: ScriptItemData[], parentId: string | undefined } | undefined {
        if (list.some(i => i.id === targetId)) return { list, parentId };
        for (const item of list) {
            if (item.children) {
                const found = this.findScriptListContaining(item.children, targetId, item.id);
                if (found) return found;
            }
        }
        return undefined;
    }
}
