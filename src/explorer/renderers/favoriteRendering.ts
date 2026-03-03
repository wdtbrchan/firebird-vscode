import * as vscode from 'vscode';
import { TreeRenderingContext } from '../treeRendering';
import { FavoritesRootItem, FavoriteFolderItem, FavoriteScriptItem, FavoriteIndexItem, FavoriteItem } from '../treeItems/favoritesItems';
import { TriggerItem } from '../treeItems/triggerItems';
import { ObjectItem } from '../treeItems/databaseItems';
import { DatabaseConnection } from '../../database/types';

export function getFavoritesChildren(element: FavoritesRootItem | FavoriteFolderItem, ctx: TreeRenderingContext): any[] {
    let sourceList: FavoriteItem[] = [];
    
    if (element instanceof FavoritesRootItem) {
        sourceList = ctx.favorites.get(element.connection.id) || [];
    } else if (element instanceof FavoriteFolderItem && element.data.children) {
        sourceList = element.data.children;
    }

    return sourceList.map(f => {
        if (f.type === 'folder') {
            return new FavoriteFolderItem(f, element.connection);
        } else if (f.type === 'script') {
            return new FavoriteScriptItem(f, element.connection);
        } else if (f.objectType === 'index') {
            return new FavoriteIndexItem(f, element.connection);
        } else if (f.objectType === 'trigger') {
            return new TriggerItem(element.connection, f.label, 0, false, true, f.id);
        } else {
            return new ObjectItem(f.label, f.objectType as 'table' | 'view' | 'trigger' | 'procedure' | 'generator' | 'function', element.connection, undefined, true, f.id);
        }
    });
}
