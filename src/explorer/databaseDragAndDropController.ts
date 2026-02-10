
import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from './databaseTreeDataProvider';
import { DatabaseConnection } from './treeItems/databaseItems';
import { FavoritesRootItem, FavoriteFolderItem, FavoriteScriptItem, FavoriteItem } from './treeItems/favoritesItems';
import { ScriptItem, ScriptFolderItem } from './treeItems/scriptItems';
import { ObjectItem, FolderItem } from './treeItems/databaseItems';
import { ScriptService, ScriptItemData } from '../services/scriptService';

export class DatabaseDragAndDropController implements vscode.TreeDragAndDropController<any> {
    public dropMimeTypes = ['application/vnd.code.tree.firebird-databases', 'application/vnd.code.tree.firebird-scripts', 'application/vnd.code.tree.firebird-favorites'];
    public dragMimeTypes = ['application/vnd.code.tree.firebird-databases', 'application/vnd.code.tree.firebird-scripts', 'application/vnd.code.tree.firebird-favorites'];

    constructor(private provider: DatabaseTreeDataProvider) {}

    handleDrag(source: any[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        const item = source[0];
        // Only allow dragging connections
        if ('host' in item || (item.contextValue === 'group')) {
             dataTransfer.set('application/vnd.code.tree.firebird-databases', new vscode.DataTransferItem(item));
        } else if (item instanceof ScriptItem || item instanceof ScriptFolderItem) {
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
                 favItem = this.provider.getFavorite(item.connection.id, item.objectName, item.type);
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
          // Handle Favorite Drop FIRST (before scripts, as VS Code may add script MIME types automatically)
          const favTransfer = dataTransfer.get('application/vnd.code.tree.firebird-favorites');
          if (favTransfer) {
                const droppedItem = favTransfer.value;
                if (!target) return;

                const droppedData = droppedItem as FavoriteItem;

                if (target instanceof FavoritesRootItem) {
                    if (target.connection.id === droppedData.connectionId) {
                         this.provider.moveFavorite(droppedData, undefined);
                    }
                } else if (target instanceof FavoriteFolderItem) {
                    if (target.connection.id === droppedData.connectionId) {
                         if (droppedData.id !== target.data.id) {
                            // Prevent moving a folder into its own descendant
                            const isDescendant = (parent: FavoriteItem, potentialChild: FavoriteItem): boolean => {
                                if (!parent.children) return false;
                                for (const child of parent.children) {
                                    if (child.id === potentialChild.id) return true;
                                    if (isDescendant(child, potentialChild)) return true;
                                }
                                return false;
                            };

                            if (droppedData.type === 'folder' && isDescendant(droppedData, target.data)) {
                                vscode.window.showWarningMessage('Cannot move a folder into its own child.');
                                return;
                            }

                            this.provider.moveFavorite(droppedData, target.data);
                         }
                    }
                } else if ((target instanceof ObjectItem && target.isFavorite) || target instanceof FavoriteScriptItem) {
                    // Reordering: Dropped onto a leaf item (Object or Script)
                    let targetConnId: string | undefined;
                    let targetFav: FavoriteItem | undefined;

                    if (target instanceof ObjectItem) {
                        targetConnId = target.connection.id;
                        if (target.favoriteId) {
                            // We need the FavoriteItem object to get its ID properly (though stored in favoriteId)
                            // But for consistency we fetch the object reference from our tree data
                             const find = (arr: FavoriteItem[]): FavoriteItem | undefined => {
                                 for (const i of arr) {
                                     if (i.id === target.favoriteId) return i;
                                     if (i.children) {
                                         const f = find(i.children);
                                         if (f) return f;
                                     }
                                 }
                                 return undefined;
                             };
                             const items = this.provider.favorites.get(targetConnId) || [];
                             targetFav = find(items);
                        } else {
                            targetFav = this.provider.getFavorite(targetConnId, target.objectName, target.type);
                        }
                    } else if (target instanceof FavoriteScriptItem) {
                        targetConnId = target.connection.id;
                        targetFav = target.data;
                    }

                    if (targetConnId && targetFav && targetConnId === droppedData.connectionId) {
                         const list = this.provider.favorites.get(targetConnId) || [];
                         
                         let parentItem: FavoriteItem | undefined = undefined;
                         let targetIndex: number = -1;
                         
                         const findLoc = (arr: FavoriteItem[], p?: FavoriteItem): boolean => {
                             const idx = arr.findIndex(i => i.id === targetFav!.id);
                             if (idx !== -1) {
                                 parentItem = p;
                                 targetIndex = idx;
                                 return true;
                             }
                             for (const child of arr) {
                                 if (child.children) {
                                     if (findLoc(child.children, child)) return true;
                                 }
                             }
                             return false;
                         };
                         
                         if (findLoc(list)) {
                             if (droppedData.id === targetFav.id) return;
                             
                             let movedParent: FavoriteItem | undefined = undefined;
                             let movedIndex: number = -1;
                             const findMoved = (arr: FavoriteItem[], p?: FavoriteItem): boolean => {
                                 const idx = arr.findIndex(i => i.id === droppedData.id);
                                 if (idx !== -1) {
                                     movedParent = p;
                                     movedIndex = idx;
                                     return true;
                                 }
                                 for (const child of arr) {
                                    if (child.children) {
                                        if (findMoved(child.children, child)) return true;
                                    }
                                 }
                                 return false;
                             };
                             findMoved(list);

                             let finalIndex = targetIndex;
                             const sameParent = (parentItem && movedParent && (parentItem as FavoriteItem).id === (movedParent as FavoriteItem).id) || (!parentItem && !movedParent);
                             
                             if (sameParent && movedIndex !== -1 && movedIndex < targetIndex) {
                                 finalIndex = targetIndex - 1;
                             }
                            
                            // To allow dropping "after" vs "before", VS Code doesn't give precise info.
                            // But usually drop-on means prepend or replace.
                            // We will insert BEFORE the target item, effectively reordering.
                             this.provider.moveFavorite(droppedData, parentItem, finalIndex);
                         }
                    }
                }
                return;
          }

          // Handle Script Drop
          const scriptTransfer = dataTransfer.get('application/vnd.code.tree.firebird-scripts');
          if (scriptTransfer) {
              const droppedItem = scriptTransfer.value;
              if (!target) return;
              
              const service = ScriptService.getInstance();

              if (target instanceof FolderItem && (target.type === 'local-scripts' || target.type === 'global-scripts')) {
                  const isGlobal = target.type === 'global-scripts';
                  service.moveItem(droppedItem.id, undefined, isGlobal ? undefined : target.connection.id, isGlobal);
              } else if (target instanceof ScriptFolderItem) {
                  const targetParentId = target.data.id;
                  const targetConnId = target.connectionId;
                  service.moveItem(droppedItem.id, targetParentId, targetConnId, targetConnId === undefined);
              } else if (target instanceof ScriptItem) {
                  const targetId = target.data.id;
                  const targetConnId = target.connectionId;
                  const isGlobal = targetConnId === undefined;
                  const collection = service.getScripts(targetConnId);
                  
                  let parentId: string | undefined = undefined;
                  const findListContaining = (list: ScriptItemData[]): ScriptItemData[] | undefined => {
                      if (list.some(i => i.id === targetId)) return list;
                      for (const item of list) {
                          if (item.children) {
                              const found = findListContaining(item.children);
                              if (found) {
                                  parentId = item.id;
                                  return found;
                              }
                          }
                      }
                      return undefined;
                  };

                  const targetList = findListContaining(collection);
                  if (targetList) {
                       const targetIndex = targetList.findIndex(i => i.id === targetId);
                       if (targetIndex !== -1) {
                           service.moveItem(droppedItem.id, parentId, targetConnId, isGlobal, targetIndex);
                       }
                  }
              }
              return;
          }

         const transferItem = dataTransfer.get('application/vnd.code.tree.firebird-databases');
         if (!transferItem) return;

         const droppedConnection = transferItem.value as DatabaseConnection;
         
         let targetGroupId: string | undefined = undefined;

         if (target) {
             if ('host' in target) {
                 // Dropped on another connection -> move to that connection's group
                 targetGroupId = target.groupId;
             } else {
                 // Dropped on a group -> move to that group
                 targetGroupId = target.id;
             }
         } else {
             // Dropped on root (undefined target) -> move to root (ungroup)
             targetGroupId = undefined;
         }

         this.provider.moveConnection(droppedConnection, targetGroupId);
    }
}
