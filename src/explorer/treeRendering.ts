import * as vscode from 'vscode';
import * as path from 'path';

import { MetadataService } from '../services/metadataService';
import { ScriptService } from '../services/scriptService';

import { DatabaseConnection, ConnectionGroup, FolderItem, ObjectItem, FilterItem } from './treeItems/databaseItems';
import { FavoriteItem, FavoritesRootItem, FavoriteFolderItem, FavoriteScriptItem, FavoriteIndexItem } from './treeItems/favoritesItems';
import { ScriptItem, ScriptFolderItem } from './treeItems/scriptItems';
import { TriggerGroupItem, TableTriggersItem, TriggerItem, TriggerOperationItem, TriggerFolderItem } from './treeItems/triggerItems';
import { TableIndexesItem, CreateNewIndexItem, IndexItem, IndexOperationItem } from './treeItems/indexItems';
import { OperationItem } from './treeItems/operationItems';
import { PaddingItem } from './treeItems/common';

/**
 * Context interface – the tree rendering functions need access to these
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
        if (element instanceof FavoritesRootItem) {
            const favorites = ctx.favorites.get(element.connection.id) || [];
            return favorites.map(f => {
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
        } else if (element instanceof FavoriteFolderItem) {
            if (element.data.children) {
                return element.data.children.map(f => {
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
            return [];

        } else if (element instanceof TriggerFolderItem) {
            const filter = ctx.getFilter(element.connection.id, 'triggers');
            const resultItems: (ObjectItem | TriggerGroupItem | FilterItem | TriggerItem)[] = [];
            
            // @ts-ignore - Validated type
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
                if (element.type === 'local-scripts') {
                     const service = ScriptService.getInstance();
                     const scripts = service.getScripts(element.connection.id);
                     const items: vscode.TreeItem[] = [];
                     
                     for (const script of scripts) {
                         if (script.type === 'folder') {
                             items.push(new ScriptFolderItem(script, element.connection.id));
                         } else {
                             items.push(new ScriptItem(script, element.connection.id, ctx.isScriptFavorite(element.connection.id, script.id)));
                         }
                     }
                     return items;
                }

                if (element.type === 'global-scripts') {
                     const service = ScriptService.getInstance();
                     const scripts = service.getScripts(undefined);
                     const items: vscode.TreeItem[] = [];
                     
                     for (const script of scripts) {
                         if (script.type === 'folder') {
                             items.push(new ScriptFolderItem(script, undefined));
                         } else {
                             items.push(new ScriptItem(script, undefined, ctx.isScriptFavorite(undefined, script.id)));
                         }
                     }
                     return items;
                }

                const filter = ctx.getFilter(element.connection.id, element.type);
                const resultItems: (ObjectItem | TriggerGroupItem | FilterItem)[] = [];
                
                // @ts-ignore - Validated type above
                resultItems.push(new FilterItem(element.connection, element.type, filter));

                switch (element.type) {
                    case 'tables':
                        return loadObjectList(element.connection, 'table', MetadataService.getTables.bind(MetadataService), filter, ctx);
                    case 'views':
                        return loadObjectList(element.connection, 'view', MetadataService.getViews.bind(MetadataService), filter, ctx);
                    case 'triggers':
                        // This case is for generic FolderItem, which might serve as a fallback or for other contexts.
                        // However, the main "Triggers" folder in the root list should now be a TriggerFolderItem.
                        // If we encounter a generic FolderItem('triggers'), we treat it as grouped by default.
                        const groups = await getGroupedTriggers(element.connection, ctx, 'main', undefined, filter, !!filter);
                        resultItems.push(...groups);
                        break;
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
             const indexes = await MetadataService.getIndexes(element.connection, element.tableName);
             const items: vscode.TreeItem[] = [];
             items.push(new CreateNewIndexItem(element.connection, element.tableName));
             
             indexes.forEach(idx => {
                 items.push(new IndexItem(element.connection, element.tableName, idx.name, idx.unique, idx.inactive));
             });
             return items;
        } else if (element instanceof IndexItem) {
             const ops: IndexOperationItem[] = [];
             ops.push(new IndexOperationItem('Drop index', 'drop', element.connection, element.indexName));
             if (element.inactive) {
                 ops.push(new IndexOperationItem('Make index active', 'activate', element.connection, element.indexName));
             } else {
                 ops.push(new IndexOperationItem('Make index inactive', 'deactivate', element.connection, element.indexName));
             }
             ops.push(new IndexOperationItem('Recompute statistics for index', 'recompute', element.connection, element.indexName));
             return ops;
        } else if (element instanceof TriggerGroupItem) {
            // Check if triggers are actually items (TriggerGroupItem or TriggerItem)
            if (element.triggers.length > 0) {
                const first = element.triggers[0];
                if (first instanceof TriggerGroupItem || first instanceof TriggerItem) {
                    return element.triggers;
                }
            }

            // Fallback for raw trigger objects (should not happen with new structure but good for safety)
            const sorted = element.triggers.sort((a, b) => {
                const pa = a.sequence || 0;
                const pb = b.sequence || 0;
                return pa - pb;
            });
            
            return sorted.map(t => {
                 const isFav = !!ctx.getFavorite(element.connection.id, t.name, 'trigger');
                 return new TriggerItem(element.connection, t.name, t.sequence, t.inactive, isFav);
            });
        } else if (element instanceof TriggerFolderItem) {
             if (element.viewMode === 'list') {
                 // Flat list
                 return getTriggerList(element.connection, ctx);
             } else {
                 // Grouped
                 return getGroupedTriggers(element.connection, ctx, 'main', undefined, undefined, false);
             }
        } else if (element instanceof TriggerItem) {
             const ops: (TriggerOperationItem | OperationItem)[] = [];
             ops.push(new OperationItem('DDL Script', 'alter', new ObjectItem(element.triggerName, 'trigger', element.connection)));

             ops.push(new TriggerOperationItem('Drop trigger', 'drop', element.connection, element.triggerName));
             if (element.inactive) {
                 ops.push(new TriggerOperationItem('Activate trigger', 'activate', element.connection, element.triggerName));
             } else {
                 ops.push(new TriggerOperationItem('Deactivate trigger', 'deactivate', element.connection, element.triggerName));
             }
             return ops;
        } else if (element instanceof ObjectItem) {
            const ops: (OperationItem | TableTriggersItem | TableIndexesItem)[] = [];
            
            if (element.type === 'table') {
                ops.push(new OperationItem('Create Script', 'create', element));
                ops.push(new OperationItem('Alter Script', 'alter', element));
                ops.push(new OperationItem('Drop table', 'drop', element));
                ops.push(new TableIndexesItem(element.connection, element.objectName));
                ops.push(new TableTriggersItem(element.connection, element.objectName, ctx.getTriggerViewMode(element.connection.id, element.objectName)));
            } else if (['view', 'trigger', 'procedure'].includes(element.type)) {
                ops.push(new OperationItem('DDL Script', 'alter', element));
                
                if (element.type === 'view') {
                     ops.push(new OperationItem('Recreate Script', 'recreate', element));
                     ops.push(new OperationItem('Drop view', 'drop', element));
                } else if (element.type === 'procedure') {
                     ops.push(new OperationItem('Drop procedure', 'drop', element));
                }
            } else {
                ops.push(new OperationItem('Create Script', 'create', element));
                ops.push(new OperationItem('Alter Script', 'alter', element));
            }

            if (element.type === 'generator') {
                 ops.push(new OperationItem('Drop generator', 'drop', element));
                 try {
                     const val = await MetadataService.getGeneratorValue(element.connection, element.label);
                     ops.push(new OperationItem(`Value: ${val}`, 'info', element));
                 } catch(e) {
                     ops.push(new OperationItem(`Value: Error`, 'info', element));
                 }
            }

            return ops;
        } else if (element instanceof ScriptFolderItem) {
            const items: vscode.TreeItem[] = [];
            
            if (element.data.children) {
                for (const child of element.data.children) {
                     if (child.type === 'folder') {
                         items.push(new ScriptFolderItem(child, element.connectionId));
                     } else {
                         items.push(new ScriptItem(child, element.connectionId, ctx.isScriptFavorite(element.connectionId, child.id)));
                     }
                }
            }
            return items;
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

/**
 * Groups triggers by Event then Time.
 */
export async function getGroupedTriggers(
    connection: DatabaseConnection, 
    ctx: TreeRenderingContext, 
    context: string,
    tableName?: string, 
    filter?: string, 
    forceGroup?: boolean
): Promise<TriggerGroupItem[]> {
    try {
        // vscode.window.showInformationMessage(`DEBUG: Fetching triggers. Table: ${tableName}, Context: ${context}`);
        const allTriggers = await MetadataService.getTriggers(connection, tableName);
        // vscode.window.showInformationMessage(`DEBUG: Got ${allTriggers.length} triggers`);
        const hierarchy: { [event: string]: { [time: string]: any[] } } = {};
        
        for (const t of allTriggers) {
            if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) {
                continue;
            }

            const typeName = MetadataService.decodeTriggerType(t.type);
            // Expected format: "BEFORE INSERT", "AFTER UPDATE", "BEFORE INSERT OR UPDATE", etc.
            // We want to group by Event (INSERT, UPDATE...) then Time (BEFORE, AFTER).
            
            let time = 'OTHER';
            let event = typeName;

            if (typeName.startsWith('BEFORE ')) {
                time = 'BEFORE';
                event = typeName.substring(7);
            } else if (typeName.startsWith('AFTER ')) {
                time = 'AFTER';
                event = typeName.substring(6);
            } else if (typeName.startsWith('ON ')) {
                time = 'ON';
                event = typeName.substring(3);
            }

            // Capitalize event for consistency
            event = event.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

            if (!hierarchy[event]) hierarchy[event] = {};
            if (!hierarchy[event][time]) hierarchy[event][time] = [];
            
            hierarchy[event][time].push(t);
        }

        // Ordered events
        const eventOrder = ['Insert', 'Update', 'Insert Or Update', 'Delete', 'Insert Or Delete', 'Update Or Delete', 'Insert Or Update Or Delete', 'Transaction Start', 'Transaction Commit', 'Transaction Rollback', 'Connect', 'Disconnect'];
        
        const sortedEvents = Object.keys(hierarchy).sort((a, b) => {
             const ia = eventOrder.indexOf(a);
             const ib = eventOrder.indexOf(b);
             if (ia !== -1 && ib !== -1) return ia - ib;
             if (ia !== -1) return -1;
             if (ib !== -1) return 1;
             return a.localeCompare(b);
        });

        const result: TriggerGroupItem[] = [];

        for (const event of sortedEvents) {
            const timeGroups = hierarchy[event];
            const timeKeys = Object.keys(timeGroups);
            
            // If only one time group or generic, maybe flatten? logic check.
            // Requirement: Event -> Time -> Triggers.
            
            const children: (TriggerGroupItem | TriggerItem)[] = [];
            
            // Order times: BEFORE, AFTER
            const sortedTimes = timeKeys.sort((a, b) => {
                if (a === 'BEFORE') return -1;
                if (b === 'BEFORE') return 1;
                if (a === 'AFTER') return -1;
                if (b === 'AFTER') return 1;
                return a.localeCompare(b);
            });

            for (const time of sortedTimes) {
                 const triggers = timeGroups[time];
                 triggers.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
                 
                 const triggerItems = triggers.map(t => {
                     const isFav = !!ctx.getFavorite(connection.id, t.name, 'trigger');
                     return new TriggerItem(connection, t.name, t.sequence, t.inactive, isFav);
                 });

                 // Create a group for the time (e.g. "Before")
                 const timeGroup = new TriggerGroupItem(
                     time, 
                     triggerItems, 
                     connection,
                     vscode.TreeItemCollapsibleState.Collapsed,
                     `${context}-${event}-${time}` // Unique path for ID
                 );
                 children.push(timeGroup);
            }

            // Now create the Event group
             const eventGroup = new TriggerGroupItem(
                 event,
                 children, 
                 connection,
                 vscode.TreeItemCollapsibleState.Collapsed,
                 `${context}-${event}` // Unique path
             );
             result.push(eventGroup);
        }
        
        return result;
    } catch (err: any) {
        console.error('Error getting grouped triggers:', err);
        vscode.window.showErrorMessage(`Error loading grouped triggers: ${err.message}`);
        return [];
    }
}

/**
 * Gets a flat list of all triggers.
 */
async function getTriggerList(
    connection: DatabaseConnection,
    ctx: TreeRenderingContext,
    tableName?: string
): Promise<TriggerItem[]> {
    try {
        const allTriggers = await MetadataService.getTriggers(connection, tableName);
        
        allTriggers.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        return allTriggers.map(t => {
            const isFav = !!ctx.getFavorite(connection.id, t.name, 'trigger');
            return new TriggerItem(connection, t.name, t.sequence, t.inactive, isFav);
        });
    } catch (err) {
        console.error('Error getting trigger list:', err);
        return [];
    }
}
