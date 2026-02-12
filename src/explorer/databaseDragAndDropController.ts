
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
        console.log('handleDrop called. Target:', target);
        
        // Log all MIME types present
        const mimeTypes: string[] = [];
        dataTransfer.forEach((item, mimeType) => {
            mimeTypes.push(mimeType);
            console.log(`MIME: ${mimeType}, Value:`, item.value);
        });
        console.log('Available MIME types:', mimeTypes);

          // Handle Favorite Drop FIRST (before scripts, as VS Code may add script MIME types automatically)
          const favTransfer = dataTransfer.get('application/vnd.code.tree.firebird-favorites');
          if (favTransfer && favTransfer.value) {
                console.log('Processing Favorite Drop');
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
                                 // finalIndex = targetIndex - 1; 
                                 // User request: dragging down should place item BELOW target.
                                 // Since item is removed first, the target shifts down.
                                 // Inserting at original targetIndex places it AFTER the target.
                                 // So we do NOT decrement.
                             }
                            
                             this.provider.moveFavorite(droppedData, parentItem, finalIndex);
                         }
                    }
                }
                return;
          }

          // Handle Script Drop
          const scriptTransfer = dataTransfer.get('application/vnd.code.tree.firebird-scripts');
          if (scriptTransfer && scriptTransfer.value) {
              const droppedItem = scriptTransfer.value;
              const service = ScriptService.getInstance();

              if (!target) {
                  // Drop on root (undefined target)
                  console.log('Dropping on root (undefined target)');
                  const isShared = droppedItem.isShared || (droppedItem.data && droppedItem.data.isShared);
                  if (isShared) {
                      service.moveItem(droppedItem.id, undefined, undefined, true);
                  }
                  return;
              }
              
              const isRootFolder = (target instanceof FolderItem || (target && target.contextValue && (target.contextValue.includes('local-scripts') || target.contextValue.includes('global-scripts'))));
              const isScriptFolder = this.isScriptFolderItem(target);
              const isScript = this.isScriptItem(target);

              if (isRootFolder && (target.type === 'local-scripts' || target.type === 'global-scripts')) {
                  // Drop on root scripts folder → append as last
                  console.log('Dropping on Root Scripts Folder');
                  const isGlobal = target.type === 'global-scripts';
                  service.moveItem(droppedItem.id, undefined, isGlobal ? undefined : target.connection.id, isGlobal);
              } else if (isScriptFolder) {
                  // Drop on script folder → append as last child (Nesting)
                  console.log('Dropping on Script Folder');
                  const targetData = target.data || target;
                  const targetParentId = targetData.id;
                  const targetConnId = target.connectionId;
                  
                  // Verify we are not dropping a folder into itself
                  if (droppedItem.type === 'folder' && droppedItem.id === targetParentId) return;

                   // Check for recursive drop
                   const isDescendant = (parent: ScriptItemData, potentialChild: ScriptItemData): boolean => {
                       if (!parent.children) return false;
                       for (const child of parent.children) {
                           if (child.id === potentialChild.id) return true;
                           if (isDescendant(child, potentialChild)) return true;
                       }
                       return false;
                   };
                   
                   const freshDropped = service.getScriptById(droppedItem.id);
                   const freshTarget = service.getScriptById(targetParentId);

                   if (freshDropped && freshTarget && freshDropped.type === 'folder' && isDescendant(freshDropped, freshTarget)) {
                        vscode.window.showWarningMessage('Cannot move a folder into its own child.');
                        return;
                   }

                  service.moveItem(droppedItem.id, targetParentId, targetConnId, targetConnId === undefined);
              } else if (isScript) {
                  // Drop on script item → insert before it (Reordering)
                  console.log('Dropping on Script Item');
                  const targetData = target.data || target;
                  const targetId = targetData.id;
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
                       let targetIndex = targetList.findIndex(i => i.id === targetId);
                       if (targetIndex !== -1) {
                           const droppedIndex = targetList.findIndex(i => i.id === droppedItem.id);
                           if (droppedIndex !== -1 && droppedIndex < targetIndex) {
                               // targetIndex--;
                           }
                           service.moveItem(droppedItem.id, parentId, targetConnId, isGlobal, targetIndex);
                       }
                  }
              }
              return;
          }

          // Handle Connection / Group Drop
          const transferItem = dataTransfer.get('application/vnd.code.tree.firebird-databases');
          if (transferItem && transferItem.value) {

         const droppedItem = transferItem.value;

         if (this.isConnectionItem(droppedItem)) {
             const droppedConnection = droppedItem as DatabaseConnection;

             if (!target) {
                 // Dropped on root (empty space) -> move to ungrouped, append at end
                 this.provider.moveConnection(droppedConnection, undefined);
                 return;
             }

             if (this.isConnectionItem(target)) {
                 // Dropped on another connection → insert before the target connection
                 const targetConn = target as DatabaseConnection;
                 const targetGroupId = targetConn.groupId;

                 // Find the target's index within its group
                 const groupConns = this.provider.getConnectionsInGroup(targetGroupId);
                 let targetIndex = groupConns.findIndex((c: DatabaseConnection) => c.id === targetConn.id);
                 
                 // Adjust for same-group moves (off-by-one after removal)
                 if (targetIndex >= 0) {
                     const droppedIndex = groupConns.findIndex((c: DatabaseConnection) => c.id === droppedConnection.id);
                     if (droppedIndex >= 0 && droppedIndex < targetIndex) {
                         // targetIndex--;
                     }
                 }
                 
                 this.provider.moveConnection(droppedConnection, targetGroupId, targetIndex >= 0 ? targetIndex : undefined);
             } else if (this.isGroupItem(target)) {
                 // Dropped on a group → append as last child in that group (Nesting)
                 this.provider.moveConnection(droppedConnection, target.id);
             }
         } else if (this.isGroupItem(droppedItem)) {
             // Dropped group
             if (!target) {
                // Dropped on root -> Move to end of groups list
                const allGroups = this.provider.getGroups();
                this.provider.moveGroup(droppedItem.id, allGroups.length);
                return;
             }

             if (this.isGroupItem(target)) {
                 // Dropped on another group → reorder: insert before the target group
                 if (droppedItem.id === target.id) return;
                 
                 const allGroups = this.provider.getGroups();
                 let targetIndex = allGroups.findIndex(g => g.id === target.id);
                 if (targetIndex >= 0) {
                     // Adjust for same-list off-by-one
                     const droppedIndex = allGroups.findIndex(g => g.id === droppedItem.id);
                     if (droppedIndex >= 0 && droppedIndex < targetIndex) {
                         // targetIndex--;
                     }
                     this.provider.moveGroup(droppedItem.id, targetIndex);
                 }
             }
         }
    }
    }
}
