
import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from './databaseTreeDataProvider';
import { DatabaseConnection } from '../database/types';
import { FavoriteFolderItem, FavoriteScriptItem, FavoriteItem } from './treeItems/favoritesItems';
import { ScriptItem, ScriptFolderItem } from './treeItems/scriptItems';
import { ObjectItem } from './treeItems/databaseItems';
import { DropHandlers } from './dropHandlers';

type TreeElement = unknown;

export class DatabaseDragAndDropController implements vscode.TreeDragAndDropController<TreeElement> {
    public dropMimeTypes = ['application/vnd.code.tree.firebird-databases', 'application/vnd.code.tree.firebird-scripts', 'application/vnd.code.tree.firebird-favorites'];
    public dragMimeTypes = ['application/vnd.code.tree.firebird-databases', 'application/vnd.code.tree.firebird-scripts', 'application/vnd.code.tree.firebird-favorites'];

    constructor(private provider: DatabaseTreeDataProvider) {}

    private isConnectionItem(item: unknown): item is DatabaseConnection {
        return !!item && typeof item === 'object' && 'host' in item;
    }

    private isGroupItem(item: unknown): item is { id: string; name: string } {
        if (!item || typeof item !== 'object') return false;
        if (this.isConnectionItem(item)) return false;
        if (item instanceof vscode.TreeItem) return false;
        return 'id' in item && 'name' in item;
    }

    private isScriptItem(item: unknown): boolean {
        return item instanceof ScriptItem || (!!item && typeof item === 'object' && (
            (item as { contextValue?: string }).contextValue === 'script-file' ||
            (item as { contextValue?: string }).contextValue === 'script-file-favorite'
        ));
    }

    private isScriptFolderItem(item: unknown): boolean {
        return item instanceof ScriptFolderItem ||
            (!!item && typeof item === 'object' && (item as { contextValue?: string }).contextValue === 'script-folder');
    }

    handleDrag(source: TreeElement[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): void | Thenable<void> {
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

    handleDrop(target: TreeElement | undefined, dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): void | Thenable<void> {
        console.log('handleDrop called. Target:', target);
        
        // Handle Favorite Drop
        if (DropHandlers.handleFavoriteDrop(target, dataTransfer, this.provider)) {
            return;
        }

        // Handle Script Drop
        if (DropHandlers.handleScriptDrop(target, dataTransfer, this.provider)) {
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
                    const targetIndex = groupConns.findIndex((c: DatabaseConnection) => c.id === targetConn.id);
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
                    const draggedGroup = droppedItem as { id: string };
                    if (draggedGroup.id === target.id) return;
                    const allGroups = this.provider.groupManager.getGroups();
                    const targetIndex = allGroups.findIndex(g => g.id === target.id);
                    if (targetIndex >= 0) {
                        this.provider.groupManager.moveGroup(draggedGroup.id, targetIndex);
                    }
                }
            }
        }
    }
}
