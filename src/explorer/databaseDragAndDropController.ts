
import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from './databaseTreeDataProvider';
import { DatabaseConnection } from './treeItems/databaseItems';
import { FavoritesRootItem, FavoriteFolderItem, FavoriteScriptItem, FavoriteItem } from './treeItems/favoritesItems';
import { ScriptItem, ScriptFolderItem } from './treeItems/scriptItems';
import { ObjectItem, FolderItem } from './treeItems/databaseItems';
import { ScriptService, ScriptItemData } from '../services/scriptService';
import { DropHandlers } from './dropHandlers';

export class DatabaseDragAndDropController implements vscode.TreeDragAndDropController<any> {
    public dropMimeTypes = ['application/vnd.code.tree.firebird-databases', 'application/vnd.code.tree.firebird-scripts', 'application/vnd.code.tree.firebird-favorites'];
    public dragMimeTypes = ['application/vnd.code.tree.firebird-databases', 'application/vnd.code.tree.firebird-scripts', 'application/vnd.code.tree.firebird-favorites'];

    constructor(private provider: DatabaseTreeDataProvider) {}

    private isConnectionItem(item: any): boolean {
        const res = item && 'host' in item;
        // console.log('isConnectionItem', item, res);
        return res;
    }

    private isGroupItem(item: any): boolean {
        const res = item && !this.isConnectionItem(item) && !(item instanceof vscode.TreeItem) && 'id' in item && 'name' in item;
        // console.log('isGroupItem', item, res);
        return res;
    }

    private isScriptItem(item: any): boolean {
        return item instanceof ScriptItem || (item && (item.contextValue === 'script-file' || item.contextValue === 'script-file-favorite'));
    }

    private isScriptFolderItem(item: any): boolean {
        return item instanceof ScriptFolderItem || (item && item.contextValue === 'script-folder');
    }

    handleDrag(source: any[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        console.log('handleDrag called', source);
        const item = source[0];
        if (!item) return;

        console.log('Dragging item:', item);
        
        // Connections and Groups
        if (this.isConnectionItem(item) || this.isGroupItem(item)) {
             console.log('Adding drag data for Connection/Group');
             dataTransfer.set('application/vnd.code.tree.firebird-databases', new vscode.DataTransferItem(item));
        } else if (this.isScriptItem(item) || this.isScriptFolderItem(item)) {
             console.log('Adding drag data for Script');
             dataTransfer.set('application/vnd.code.tree.firebird-scripts', new vscode.DataTransferItem(item));
        } else if (item instanceof ObjectItem && item.isFavorite) {
             let favItem: FavoriteItem | undefined;
             if (item.favoriteId) {
                 // Fast lookup by ID
                 const find = (arr: FavoriteItem[]): FavoriteItem | undefined => {
                     for (const i of arr) {
                         if (i.id === item.favoriteId) return i;
                         if (i.children) {
                             const f = find(i.children);
                             if (f) return f;
                         }
                     }
                     return undefined;
                 };
                 const items = this.provider.favorites.get(item.connection.id) || [];
                 favItem = find(items);
             } else {
                 // Fallback
                 favItem = this.provider.favoritesManager.getFavorite(item.connection.id, item.objectName, item.type);
             }
             
             if (favItem) {
                 dataTransfer.set('application/vnd.code.tree.firebird-favorites', new vscode.DataTransferItem(favItem));
             }
        } else if (item instanceof FavoriteFolderItem) {
             dataTransfer.set('application/vnd.code.tree.firebird-favorites', new vscode.DataTransferItem(item.data));
        } else if (item instanceof FavoriteScriptItem) {
             dataTransfer.set('application/vnd.code.tree.firebird-favorites', new vscode.DataTransferItem(item.data));
        }
    }

    handleDrop(target: any | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        console.log('handleDrop called. Target:', target);
        
        // Handle Favorite Drop
        if (DropHandlers.handleFavoriteDrop(target, dataTransfer, this.provider)) {
            return;
        }

        // Handle Script Drop
        if (DropHandlers.handleScriptDrop(target, dataTransfer)) {
            return;
        }

        // Handle Connection / Group Drop
        const transferItem = dataTransfer.get('application/vnd.code.tree.firebird-databases');
        if (transferItem && transferItem.value) {
            const droppedItem = transferItem.value;

            if (this.isConnectionItem(droppedItem)) {
                const droppedConnection = droppedItem as DatabaseConnection;

                if (!target) {
                    this.provider.connectionManager.moveConnection(droppedConnection, undefined);
                    return;
                }

                if (this.isConnectionItem(target)) {
                    const targetConn = target as DatabaseConnection;
                    const targetGroupId = targetConn.groupId;
                    const groupConns = this.provider.connectionManager.getConnectionsInGroup(targetGroupId);
                    let targetIndex = groupConns.findIndex((c: DatabaseConnection) => c.id === targetConn.id);
                    this.provider.connectionManager.moveConnection(droppedConnection, targetGroupId, targetIndex >= 0 ? targetIndex : undefined);
                } else if (this.isGroupItem(target)) {
                    this.provider.connectionManager.moveConnection(droppedConnection, target.id);
                }
            } else if (this.isGroupItem(droppedItem)) {
                if (!target) {
                    const allGroups = this.provider.groupManager.getGroups();
                    this.provider.groupManager.moveGroup(droppedItem.id, allGroups.length);
                    return;
                }

                if (this.isGroupItem(target)) {
                    if (droppedItem.id === target.id) return;
                    const allGroups = this.provider.groupManager.getGroups();
                    let targetIndex = allGroups.findIndex(g => g.id === target.id);
                    if (targetIndex >= 0) {
                        this.provider.groupManager.moveGroup(droppedItem.id, targetIndex);
                    }
                }
            }
        }
    }
}
