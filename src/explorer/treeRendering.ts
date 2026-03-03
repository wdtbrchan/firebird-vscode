import * as vscode from 'vscode';
import * as path from 'path';

import { MetadataService } from '../services/metadataService';
import { ScriptService } from '../services/scriptService';

import { ConnectionGroup, FolderItem, ObjectItem, FilterItem } from './treeItems/databaseItems';
import { DatabaseConnection } from '../database/types';
import { FavoriteItem, FavoritesRootItem, FavoriteFolderItem, FavoriteScriptItem, FavoriteIndexItem } from './treeItems/favoritesItems';
import { ScriptItem, ScriptFolderItem } from './treeItems/scriptItems';
import { TriggerGroupItem, TableTriggersItem, TriggerItem, TriggerOperationItem, TriggerFolderItem } from './treeItems/triggerItems';
import { TableIndexesItem, CreateNewIndexItem, IndexItem, IndexOperationItem } from './treeItems/indexItems';
import { OperationItem } from './treeItems/operationItems';
import { PaddingItem } from './treeItems/common';
import { getGroupedTriggers, getTriggerList } from './triggerRendering';

import { getFavoritesChildren } from './renderers/favoriteRendering';
import { getScriptFolderChildren } from './renderers/scriptRendering';
import { getTableIndexesChildren, getIndexOperationChildren, getTriggerOperationChildren, getTriggerGroupChildren } from './renderers/subObjectRendering';
import { getObjectOperationChildren } from './renderers/objectRendering';

/**
 * Context interface â€“ the tree rendering functions need access to these
 * methods from DatabaseTreeDataProvider without a circular dependency.
 */
export interface TreeRenderingContext {
    getActiveConnectionId(): string | undefined;
    getConnections(): DatabaseConnection[];
    getGroups(): ConnectionGroup[];
    connectingConnectionIds: Set<string>;
    failedConnectionIds: Map<string, string>;
    favorites: Map<string, FavoriteItem[]>;
    isScriptFavorite(connectionId: string | undefined, scriptId: string): boolean;
    getFavorite(connectionId: string, objectName: string, objectType: string): FavoriteItem | undefined;
    getFilter(connectionId: string, type: string): string;
    applyFilter(items: string[], filter: string): string[];
    getIconUri(color: string): vscode.Uri;
    getTriggerViewMode(connectionId: string, context: string): 'grouped' | 'list';
    toggleTriggerViewMode(connectionId: string, context: string): void;
    setTriggerViewMode(connectionId: string, context: string, mode: 'grouped' | 'list'): void;
}


/**
 * Builds a vscode.TreeItem from any tree element.
 */
export function buildTreeItem(
    element: any,
    ctx: TreeRenderingContext
): vscode.TreeItem {
    if (element instanceof vscode.TreeItem) {
        return element;
    }

    if ('host' in element) {
        // It's a connection
        const isLocal = element.host === '127.0.0.1' || element.host === 'localhost';
        const label = element.name || path.basename(element.database);
        
        const isActive = element.id === ctx.getActiveConnectionId();
        const state = isActive ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;

        const treeItem = new vscode.TreeItem(label, state);
        
        treeItem.description = `${element.host}:${element.port}`;
        
        treeItem.resourceUri = vscode.Uri.parse(`firebird-connection:/${element.id}`);

        treeItem.tooltip = `${element.user}@${element.host}:${element.port}/${element.database}`;
        treeItem.id = element.id;
        treeItem.contextValue = 'database';

        let iconColor: vscode.ThemeColor | undefined;
        if (element.color) {
            switch (element.color) {
                case 'red': iconColor = new vscode.ThemeColor('charts.red'); break;
                case 'orange': iconColor = new vscode.ThemeColor('charts.orange'); break;
                case 'yellow': iconColor = new vscode.ThemeColor('charts.yellow'); break;
                case 'green': iconColor = new vscode.ThemeColor('charts.green'); break;
                case 'blue': iconColor = new vscode.ThemeColor('charts.blue'); break;
                case 'purple': iconColor = new vscode.ThemeColor('charts.purple'); break;
            }
        }

        if (isActive) {
            const colorMap: {[key: string]: string} = {
                'red': '#F14C4C',
                'orange': '#d18616',
                'yellow': '#CCA700',
                'green': '#37946e',
                'blue': '#007acc',
                'purple': '#652d90'
            };
            
            const hexColor = colorMap[element.color || ''] || '#37946e';
            treeItem.iconPath = ctx.getIconUri(hexColor);
            treeItem.label = label;
            treeItem.contextValue = 'database-active';
        } else {
             if (iconColor) {
                 treeItem.iconPath = new vscode.ThemeIcon('database', iconColor);
             } else {
                 treeItem.iconPath = new vscode.ThemeIcon('database');
             }
             
             treeItem.command = {
                 command: 'firebird.selectDatabase',
                 title: 'Select Database',
                 arguments: [element]
             };
        }

        // Check for connecting state
        if (ctx.connectingConnectionIds.has(element.id)) {
            treeItem.iconPath = new vscode.ThemeIcon('loading~spin');
            treeItem.description = (treeItem.description || '') + ' (Connecting...)';
            treeItem.contextValue = 'database-connecting';
        }
        // Check for failure state override (only if not connecting)
        else if (ctx.failedConnectionIds.has(element.id)) {
            treeItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.red'));
            treeItem.description = (treeItem.description || '') + ' (Disconnected)';
            treeItem.tooltip = `Error: ${ctx.failedConnectionIds.get(element.id)}`;
            treeItem.contextValue = 'database-error';
        }

        return treeItem;
    } else {
        // It's a group
        const treeItem = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Expanded);
        treeItem.id = element.id;
        treeItem.contextValue = 'group';
        treeItem.iconPath = new vscode.ThemeIcon('folder');
        return treeItem;
    }
}

/**
 * Returns children for a given tree element (or root if undefined).
 */
export async function getTreeChildren(
    element: any | undefined,
    ctx: TreeRenderingContext,
    isLoading: boolean
): Promise<any[]> {
    if (isLoading && !element) {
        return [];
    }

    if (element) {
        if (element instanceof FavoritesRootItem || element instanceof FavoriteFolderItem) {
            return getFavoritesChildren(element, ctx);
        } else if (element instanceof TriggerFolderItem) {
            const filter = ctx.getFilter(element.connection.id, 'triggers');
            const resultItems: (ObjectItem | TriggerGroupItem | FilterItem | TriggerItem)[] = [];
            
            resultItems.push(new FilterItem(element.connection, 'triggers', filter));

            if (element.viewMode === 'list') {
                 // Flat list
                 const list = await getTriggerList(element.connection, ctx, undefined);
                 if (filter) {
                     const filtered = list.filter(i => i.label && i.label.toString().toLowerCase().includes(filter.toLowerCase()));
                     resultItems.push(...filtered);
                 } else {
                     resultItems.push(...list);
                 }
            } else {
                // Grouped
                const groups = await getGroupedTriggers(element.connection, ctx, 'main', undefined, filter, !!filter);
                resultItems.push(...groups);
            }
            return resultItems;
        } else if (element instanceof FolderItem) {
            try {
                if (element.type === 'local-scripts' || element.type === 'global-scripts') {
                    return getScriptFolderChildren(element, ctx);
                }

                const filter = ctx.getFilter(element.connection.id, element.type);
                const resultItems: (ObjectItem | TriggerGroupItem | FilterItem)[] = [];
                
                resultItems.push(new FilterItem(element.connection, element.type, filter));

                switch (element.type) {
                    case 'tables':
                        return loadObjectList(element.connection, 'table', MetadataService.getTables.bind(MetadataService), filter, ctx);
                    case 'views':
                        return loadObjectList(element.connection, 'view', MetadataService.getViews.bind(MetadataService), filter, ctx);
                    case 'triggers': {
                        // This case is for generic FolderItem, which might serve as a fallback or for other contexts.
                        // However, the main "Triggers" folder in the root list should now be a TriggerFolderItem.
                        // If we encounter a generic FolderItem('triggers'), we treat it as grouped by default.
                        const groups = await getGroupedTriggers(element.connection, ctx, 'main', undefined, filter, !!filter);
                        resultItems.push(...groups);
                        break;
                    }
                    case 'procedures':
                        return loadObjectList(element.connection, 'procedure', MetadataService.getProcedures.bind(MetadataService), filter, ctx);
                    case 'generators':
                        return loadObjectList(element.connection, 'generator', MetadataService.getGenerators.bind(MetadataService), filter, ctx);
                }
                return resultItems;
            } catch (err) {
                vscode.window.showErrorMessage(`Error loading ${element.label}: ${err}`);
                return [];
            }
        } else if (element instanceof TableTriggersItem) {
             if (element.viewMode === 'list') {
                 // Flat list for table triggers
                 return getTriggerList(element.connection, ctx, element.tableName);
             } else {
                 // Grouped for table triggers
                 return getGroupedTriggers(element.connection, ctx, element.tableName, element.tableName, undefined, true);
             }
        } else if (element instanceof TableIndexesItem) {
             return getTableIndexesChildren(element, ctx);
        } else if (element instanceof IndexItem) {
             return getIndexOperationChildren(element, ctx);
        } else if (element instanceof TriggerGroupItem) {
             return getTriggerGroupChildren(element, ctx);
        } else if (element instanceof TriggerItem) {
             return getTriggerOperationChildren(element, ctx);
        } else if (element instanceof ObjectItem) {
             return getObjectOperationChildren(element, ctx);
        } else if (element instanceof ScriptFolderItem) {
             return getScriptFolderChildren(element, ctx);
        } else if (element instanceof OperationItem) {
            return [];
        }
        
        if ('host' in element) {
            return [
                new FavoritesRootItem(element),
                new FolderItem('Tables', 'tables', element),
                new FolderItem('Views', 'views', element),
                new TriggerFolderItem(element, ctx.getTriggerViewMode(element.id, 'main')),
                new FolderItem('Procedures', 'procedures', element),
                new FolderItem('Generators', 'generators', element),
                new FolderItem('Local Scripts', 'local-scripts', element),
                new FolderItem('Global Scripts', 'global-scripts', element)
            ];
        } else {
            const groupConns = ctx.getConnections().filter(c => c.groupId === element.id);
            return [...groupConns, new PaddingItem()];
        }
    }
    
    // Root
    const rootGroups = ctx.getGroups();
    const connections = ctx.getConnections();
    const ungroupedConns = connections.filter(c => !c.groupId || !rootGroups.find(g => g.id === c.groupId));
    
    return [...rootGroups, ...ungroupedConns, new PaddingItem()];
}

/**
 * Loads a list of database objects with filter support.
 */
async function loadObjectList(
    connection: DatabaseConnection, 
    type: 'table' | 'view' | 'procedure' | 'generator', 
    fetchFn: (conn: DatabaseConnection) => Promise<string[]>, 
    filter: string,
    ctx: TreeRenderingContext
): Promise<(ObjectItem | FilterItem)[]> {
    const items = await fetchFn(connection);
    const sortedItems = [...items].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const filteredItems = ctx.applyFilter(sortedItems, filter);
    const result: (ObjectItem | FilterItem)[] = [
        new FilterItem(connection, type === 'table' ? 'tables' : type === 'view' ? 'views' : type === 'procedure' ? 'procedures' : 'generators', filter)
    ];
    
    result.push(...filteredItems.map(name => new ObjectItem(
        name, 
        type, 
        connection, 
        undefined, 
        !!ctx.getFavorite(connection.id, name, type)
    )));
    
    return result;
}

