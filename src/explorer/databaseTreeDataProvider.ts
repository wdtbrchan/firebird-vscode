import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { ConnectionEditor } from '../editors/connectionEditor';
import { Database } from '../db';
import { MetadataService } from '../services/metadataService';
import { ScriptService, ScriptItemData } from '../services/scriptService';

// Re-exporting from separate files to maintain backward compatibility and cleaner organization
export * from './treeItems/databaseItems';
export * from './treeItems/favoritesItems';
export * from './treeItems/scriptItems';
export * from './treeItems/triggerItems';
export * from './treeItems/indexItems';
export * from './treeItems/operationItems';
export * from './treeItems/common';

import { 
    DatabaseConnection, ConnectionGroup, FolderItem, ObjectItem, FilterItem 
} from './treeItems/databaseItems';
import { 
    FavoriteItem, FavoritesRootItem, FavoriteFolderItem, FavoriteScriptItem, FavoriteIndexItem 
} from './treeItems/favoritesItems';
import { 
    ScriptItem, ScriptFolderItem 
} from './treeItems/scriptItems';
import { 
    TriggerGroupItem, TableTriggersItem, TriggerItem, TriggerOperationItem 
} from './treeItems/triggerItems';
import { 
    TableIndexesItem, CreateNewIndexItem, IndexItem, IndexOperationItem 
} from './treeItems/indexItems';
import { 
    OperationItem 
} from './treeItems/operationItems';
import { 
    PaddingItem 
} from './treeItems/common';

import { DatabaseDragAndDropController } from './databaseDragAndDropController';
export { DatabaseDragAndDropController };

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void> = new vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;


    private connections: DatabaseConnection[] = [];
    private groups: ConnectionGroup[] = [];
    private activeConnectionId: string | undefined;
    private failedConnectionIds: Map<string, string> = new Map(); // id -> error message
    private connectingConnectionIds = new Set<string>();
    private _loading: boolean = true;
    private filters: Map<string, string> = new Map(); // key: connId|type -> filterValue
    public favorites: Map<string, FavoriteItem[]> = new Map(); // key: connId -> items
    private treeView: vscode.TreeView<any> | undefined;

    constructor(private context: vscode.ExtensionContext) {
        ScriptService.initialize(context);
        ScriptService.getInstance().onDidChangeScripts(() => this._onDidChangeTreeData.fire(undefined));
        this.loadConnections();
        // Load filters
        const savedFilters = this.context.globalState.get<any[]>('firebird.filters', []);
        savedFilters.forEach(f => this.filters.set(f.key, f.value));

        // Load favorites
        const savedFavorites = this.context.globalState.get<any[]>('firebird.favoritesList', []);
        savedFavorites.forEach(f => this.favorites.set(f.key, f.value));

        // Simulate a short loading delay to ensure the UI renders the loading state
        // and doesn't flash "No data" if dependent on async activation
        setTimeout(() => {
            this._loading = false;
            vscode.commands.executeCommand('setContext', 'firebird.isInitialized', true);
            this._onDidChangeTreeData.fire(undefined);
        }, 500);
    }

    public setTreeView(treeView: vscode.TreeView<any>) {
        this.treeView = treeView;
    }

    private loadConnections() {
        const storedConns = this.context.globalState.get<DatabaseConnection[]>('firebird.connections');
        const storedGroups = this.context.globalState.get<ConnectionGroup[]>('firebird.groups');
        this.connections = storedConns || [];
        this.groups = storedGroups || [];
        this.activeConnectionId = undefined;
    }

    private saveConnections() {
        this.context.globalState.update('firebird.connections', this.connections);
        this.context.globalState.update('firebird.groups', this.groups);
        this.context.globalState.update('firebird.activeConnectionId', this.activeConnectionId);
        this._onDidChangeTreeData.fire(undefined);
    }

    refresh(): void {
        this.loadConnections();
        this._onDidChangeTreeData.fire(undefined);
    }

    public getConnectionById(id: string): DatabaseConnection | undefined {
        return this.connections.find(c => c.id === id);
    }

    getTreeItem(element: DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | PaddingItem | vscode.TreeItem): vscode.TreeItem {
        if (element instanceof vscode.TreeItem) {
            return element;
        }

        if ('host' in element) {
            // It's a connection
            const isLocal = element.host === '127.0.0.1' || element.host === 'localhost';
            const label = element.name || path.basename(element.database);
            
            const isActive = element.id === this.activeConnectionId;
            // Only collapsed (expandable) if active. Otherwise None (leaf).
            // Request: Expand by default if active
            const state = isActive ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;

            const treeItem = new vscode.TreeItem(label, state);
            
            treeItem.description = `${element.host}:${element.port}`;
            
            
            // Assign Resource URI to enable FileDecorationProvider
            // Add timestamp to force cache busting for decorations
            treeItem.resourceUri = vscode.Uri.parse(`firebird-connection:/${element.id}`);

            treeItem.tooltip = `${element.user}@${element.host}:${element.port}/${element.database}`;
            treeItem.id = element.id;
            treeItem.contextValue = 'database'; // Default context

            let iconColor: vscode.ThemeColor | undefined;
            if (element.color) {
                // Map custom color to ThemeColor
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
                // Use a generated SVG icon to ensure color persists even when focused/selected
                const colorMap: {[key: string]: string} = {
                    'red': '#F14C4C',
                    'orange': '#d18616',
                    'yellow': '#CCA700',
                    'green': '#37946e',
                    'blue': '#007acc',
                    'purple': '#652d90'
                };
                
                const hexColor = colorMap[element.color || ''] || '#37946e'; // Default to green
                treeItem.iconPath = this.getIconUri(hexColor);
                treeItem.label = label;
                treeItem.contextValue = 'database-active';
            } else {
                 if (iconColor) {
                     treeItem.iconPath = new vscode.ThemeIcon('database', iconColor);
                 } else {
                     treeItem.iconPath = new vscode.ThemeIcon('database');
                 }
                 
                 // Also add command to select it on click if it's inactive?
                 // Or we rely on context menu "Select Database".
                 // Actually, standard behavior allows clicking to select if we bind a command.
                 treeItem.command = {
                     command: 'firebird.selectDatabase',
                     title: 'Select Database',
                     arguments: [element]
                 };
            }

            // Check for connecting state
            if (this.connectingConnectionIds.has(element.id)) {
                treeItem.iconPath = new vscode.ThemeIcon('loading~spin');
                treeItem.description = (treeItem.description || '') + ' (Connecting...)';
                treeItem.contextValue = 'database-connecting';
            }
            // Check for failure state override (only if not connecting)
            else if (this.failedConnectionIds.has(element.id)) {
                treeItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.red'));
                treeItem.description = (treeItem.description || '') + ' (Disconnected)';
                treeItem.tooltip = `Error: ${this.failedConnectionIds.get(element.id)}`;
                treeItem.contextValue = 'database-error';
            }

            return treeItem;
        } else {
            // It's a group
            // Request: Expand groups by default
            const treeItem = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Expanded);
            treeItem.id = element.id;
            treeItem.contextValue = 'group';
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            return treeItem;
        }
    }

    getParent(element: any): vscode.ProviderResult<any> {
        // Handle DatabaseConnection
        if (element.host && element.database) { 
             const conn = element as DatabaseConnection;
             if (conn.groupId) {
                 return this.groups.find(g => g.id === conn.groupId);
             }
             return undefined;
        }
        
        // Handle FolderItem
        if (element instanceof FolderItem) {
            return element.connection;
        }

        return undefined;
    }


    private getIconUri(color: string): vscode.Uri {
        // Create a 16x16 square icon with the specified color
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" fill="${color}"/></svg>`;
        return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    }
    async getChildren(element?: DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem): Promise<(DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | PaddingItem | vscode.TreeItem)[]> {
        if (this._loading && !element) {
            return [];
        }

        if (element) {
            if (element instanceof FavoritesRootItem) {
                const favorites = this.favorites.get(element.connection.id) || [];
                // Return top-level items
                return favorites.map(f => {
                    if (f.type === 'folder') {
                        return new FavoriteFolderItem(f, element.connection);
                    } else if (f.type === 'script') {
                        return new FavoriteScriptItem(f, element.connection);
                    } else if (f.objectType === 'index') {
                        // For index favorites, create a simplified item
                        return new FavoriteIndexItem(f, element.connection);
                    } else if (f.objectType === 'trigger') {
                        return new TriggerItem(element.connection, f.label, 0, false, true, f.id);
                    } else {
                        // Use ObjectItem for favorite objects so they behave like normal objects (expandable etc.)
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
            } else if (element instanceof FolderItem) {
                // Return objects inside folder
                try {
                    if (element.type === 'local-scripts') {
                         const service = ScriptService.getInstance();
                         const scripts = service.getScripts(element.connection.id);
                         const items: vscode.TreeItem[] = [];
                         
                         // Scripts
                         for (const script of scripts) {
                             if (script.type === 'folder') {
                                 items.push(new ScriptFolderItem(script, element.connection.id));
                             } else {
                                 items.push(new ScriptItem(script, element.connection.id, this.isScriptFavorite(element.connection.id, script.id)));
                             }
                         }
                         return items;
                    }

                    if (element.type === 'global-scripts') {
                         const service = ScriptService.getInstance();
                         const scripts = service.getScripts(undefined); // Shared
                         const items: vscode.TreeItem[] = [];
                         
                         for (const script of scripts) {
                             // Use undefined for connectionId to indicate global scope for children
                             if (script.type === 'folder') {
                                 items.push(new ScriptFolderItem(script, undefined));
                             } else {
                                 items.push(new ScriptItem(script, undefined, this.isScriptFavorite(undefined, script.id)));
                             }
                         }
                         return items;
                    }

                    const filter = this.getFilter(element.connection.id, element.type);
                    const resultItems: (ObjectItem | TriggerGroupItem | FilterItem)[] = [];
                    
                    // Add FilterItem
                    // @ts-ignore - Validated type above
                    resultItems.push(new FilterItem(element.connection, element.type, filter));

                    let items: string[] = [];
                    let filteredItems: string[] = [];
                    
                    switch (element.type) {
                        case 'tables':
                            return this.loadObjectList(element.connection, 'table', MetadataService.getTables.bind(MetadataService), filter);
                        case 'views':
                            return this.loadObjectList(element.connection, 'view', MetadataService.getViews.bind(MetadataService), filter);
                        case 'triggers':
                            // Main triggers folder -> Collapsed groups (default), Expanded if filtering
                            const groups = await this.getGroupedTriggers(element.connection, undefined, filter, !!filter);
                            resultItems.push(...groups);
                            break;
                        case 'procedures':
                            return this.loadObjectList(element.connection, 'procedure', MetadataService.getProcedures.bind(MetadataService), filter);
                        case 'generators':
                            return this.loadObjectList(element.connection, 'generator', MetadataService.getGenerators.bind(MetadataService), filter);
                    }
                    return resultItems;
                } catch (err) {
                    vscode.window.showErrorMessage(`Error loading ${element.label}: ${err}`);
                    return [];
                }
            } else if (element instanceof TableTriggersItem) {
                 // Table triggers -> Expanded groups
                 return this.getGroupedTriggers(element.connection, element.tableName, undefined, true);
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
                // Return triggers in this group, sorted by position
                const sorted = element.triggers.sort((a, b) => {
                    const pa = a.sequence || 0;
                    const pb = b.sequence || 0;
                    return pa - pb;
                });
                
                return sorted.map(t => {
                     const isFav = !!this.getFavorite(element.connection.id, t.name, 'trigger');
                     return new TriggerItem(element.connection, t.name, t.sequence, t.inactive, isFav);
                });
            } else if (element instanceof TriggerItem) {
                 const ops: TriggerOperationItem[] = [];
                 ops.push(new TriggerOperationItem('Drop trigger', 'drop', element.connection, element.triggerName));
                 if (element.inactive) {
                     ops.push(new TriggerOperationItem('Activate trigger', 'activate', element.connection, element.triggerName));
                 } else {
                     ops.push(new TriggerOperationItem('Deactivate trigger', 'deactivate', element.connection, element.triggerName));
                 }
                 // Triggers in FB don't have "recompute statistics" like indexes
                 return ops;
            } else if (element instanceof ObjectItem) {
                // Return operations (Create, Alter, Value)
                const ops: (OperationItem | TableTriggersItem)[] = [];
                
                if (element.type === 'table') {
                    ops.push(new OperationItem('Create Script', 'create', element));
                    ops.push(new OperationItem('Alter Script', 'alter', element));
                    // Let's create a specialized TableTriggersItem.
                    ops.push(new TableIndexesItem(element.connection, element.objectName));
                    ops.push(new TableTriggersItem(element.connection, element.objectName));
                } else if (['view', 'trigger', 'procedure'].includes(element.type)) {
                    // For Views, Triggers, Procedures: Only "DDL Script" (which runs alter logic -> CREATE OR ALTER)
                    ops.push(new OperationItem('DDL Script', 'alter', element));
                    
                    if (element.type === 'view') {
                         ops.push(new OperationItem('Recreate Script', 'recreate', element));
                    }
                } else {
                    // Generators, etc.
                    ops.push(new OperationItem('Create Script', 'create', element));
                    ops.push(new OperationItem('Alter Script', 'alter', element));
                }

                if (element.type === 'generator') {
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
                             items.push(new ScriptItem(child, element.connectionId, this.isScriptFavorite(element.connectionId, child.id)));
                         }
                    }
                }
                return items;
            } else if (element instanceof OperationItem) {
                return [];
            }
            
            if ('host' in element) {
                // It's a connection
                return [
                    new FavoritesRootItem(element),
                    new FolderItem('Tables', 'tables', element),
                    new FolderItem('Views', 'views', element),
                    new FolderItem('Triggers', 'triggers', element),
                    new FolderItem('Procedures', 'procedures', element),
                    new FolderItem('Generators', 'generators', element),
                    new FolderItem('Local Scripts', 'local-scripts', element),
                    new FolderItem('Global Scripts', 'global-scripts', element)
                ];
            } else {
                // It's a group
                const groupConns = this.connections.filter(c => c.groupId === element.id);
                // Workaround: Add a padding item to fix alignment of the last real item
                return [...groupConns, new PaddingItem()];
            }
        }
        
        // Root
        const rootGroups = this.groups;
        const ungroupedConns = this.connections.filter(c => !c.groupId || !this.groups.find(g => g.id === c.groupId));
        
        // Workaround: Add a padding item to fix alignment of the last real item
        return [...rootGroups, ...ungroupedConns, new PaddingItem()];
    }

    private async loadObjectList(
        connection: DatabaseConnection, 
        type: 'table' | 'view' | 'procedure' | 'generator', 
        fetchFn: (conn: DatabaseConnection) => Promise<string[]>, 
        filter: string
    ): Promise<(ObjectItem | FilterItem)[]> {
        const items = await fetchFn(connection);
        const filteredItems = this.applyFilter(items, filter);
        const result: (ObjectItem | FilterItem)[] = [
            new FilterItem(connection, type === 'table' ? 'tables' : type === 'view' ? 'views' : type === 'procedure' ? 'procedures' : 'generators', filter)
        ];
        
        result.push(...filteredItems.map(name => new ObjectItem(
            name, 
            type, 
            connection, 
            undefined, 
            !!this.getFavorite(connection.id, name, type)
        )));
        
        return result;
    }

    async getGroupedTriggers(connection: DatabaseConnection, tableName?: string, filter?: string, expanded: boolean = false): Promise<TriggerGroupItem[]> {
        try {
            const allTriggers = await MetadataService.getTriggers(connection, tableName);
            const groups: { [key: string]: any[] } = {};
            
            for (const t of allTriggers) {
              if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) {
                  continue;
              }

              const typeName = MetadataService.decodeTriggerType(t.type);
              const groupName = typeName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
              
              if (!groups[groupName]) groups[groupName] = [];
              groups[groupName].push(t);
            }
            
            return Object.keys(groups).sort().map(g => {
                return new TriggerGroupItem(
                    g, 
                    groups[g], 
                    connection, 
                    expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
                );
            });
        } catch (err) {
            console.error('Error getting grouped triggers:', err);
            return [];
        }
    }

    private getFilter(connectionId: string, type: string): string {
        return this.filters.get(`${connectionId}|${type}`) || '';
    }

    public setFilter(connectionId: string, type: string, value: string) {
        this.filters.set(`${connectionId}|${type}`, value);
    }

    private applyFilter(items: string[], filter: string): string[] {
        if (!filter) return items;
        return items.filter(i => i.toLowerCase().includes(filter.toLowerCase()));
    }

    async createGroup() {
        const name = await vscode.window.showInputBox({ prompt: 'Group Name' });
        if (!name) return;
        
        const newGroup: ConnectionGroup = {
            id: Date.now().toString(),
            name
        };
        this.groups.push(newGroup);
        this.saveConnections();
    }

    async renameGroup(group?: ConnectionGroup) {
        if (!group) {
            const items = this.groups.map(g => ({ label: g.name, description: g.id }));
            const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select group to rename' });
            if (!selected) return;
            group = this.groups.find(g => g.id === selected.description);
            if (!group) return;
        }

        const name = await vscode.window.showInputBox({ 
            prompt: 'New Group Name',
            value: group.name 
        });
        if (!name || name === group.name) return;
        
        const targetGroup = this.groups.find(g => g.id === group!.id);
        if (targetGroup) {
            targetGroup.name = name;
            this.saveConnections();
        }
    }

    async deleteGroup(group: ConnectionGroup) {
         // Move children to root? Or delete them? 
         // Safest: Move to root (ungroup)
         this.connections.forEach(c => {
             if (c.groupId === group.id) {
                 c.groupId = undefined;
             }
         });
         
         this.groups = this.groups.filter(g => g.id !== group.id);
         this.saveConnections();
    }

    async backupConnections() {
        const result = await vscode.window.showSaveDialog({
            filters: { 'JSON': ['json'] },
            defaultUri: vscode.Uri.file('firebird-connections.json'),
            saveLabel: 'Backup'
        });

        if (!result) return;

        // Convert favorites Map to object
        const favoritesObj: { [key: string]: FavoriteItem[] } = {};
        this.favorites.forEach((value, key) => {
            favoritesObj[key] = value;
        });

        const scriptState = ScriptService.getInstance().getFullState();

        const data = {
            connections: this.connections,
            groups: this.groups,
            favorites: favoritesObj,
            scripts: {
                shared: scriptState.shared,
                connections: scriptState.connections
            }
        };

        try {
            await vscode.workspace.fs.writeFile(result, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
            vscode.window.showInformationMessage('Configuration backed up successfully.');
        } catch (err: any) {
            vscode.window.showErrorMessage(`Backup failed: ${err.message}`);
        }
    }

    async restoreConnections() {
        const result = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON': ['json'] },
            openLabel: 'Restore'
        });

        if (!result || result.length === 0) return;

        try {
            const content = await vscode.workspace.fs.readFile(result[0]);
            const jsonStr = Buffer.from(content).toString('utf8');
            const data = JSON.parse(jsonStr);

            if (!Array.isArray(data.connections) && !Array.isArray(data.groups)) {
                 vscode.window.showErrorMessage('Invalid backup file format: Missing connections or groups array.');
                 return;
            }

            const choice = await vscode.window.showWarningMessage(
                'Do you want to clear existing configuration before restoring?',
                { modal: true },
                'Yes, Clear and Restore',
                'No, Merge'
            );

            if (!choice) return;

            if (choice === 'Yes, Clear and Restore') {
                this.connections = data.connections || [];
                this.groups = data.groups || [];
                
                // Restore Favorites
                this.favorites.clear();
                if (data.favorites) {
                    for (const key in data.favorites) {
                        this.favorites.set(key, data.favorites[key]);
                    }
                }
                
                // Restore Scripts
                if (data.scripts) {
                    const state = {
                        shared: data.scripts.shared || [],
                        connections: data.scripts.connections || data.scripts.local || {}
                    };
                    ScriptService.getInstance().setFullState(state);
                }

                // Clear active connection if it was removed
                if (this.activeConnectionId && !this.connections.find(c => c.id === this.activeConnectionId)) {
                    this.activeConnectionId = undefined;
                }
            } else {
                // Merge logic for Connections & Groups
                const newConns = (data.connections || []) as DatabaseConnection[];
                const newGroups = (data.groups || []) as ConnectionGroup[];

                const existingConnIds = new Set(this.connections.map(c => c.id));
                const existingGroupIds = new Set(this.groups.map(g => g.id));

                let addedC = 0;
                let addedG = 0;

                for (const g of newGroups) {
                    if (!existingGroupIds.has(g.id)) {
                        this.groups.push(g);
                        existingGroupIds.add(g.id);
                        addedG++;
                    }
                }

                for (const c of newConns) {
                     if (!existingConnIds.has(c.id)) {
                         this.connections.push(c);
                         existingConnIds.add(c.id);
                         addedC++;
                     }
                }

                // Merge Favorites
                if (data.favorites) {
                    for (const connId in data.favorites) {
                        const newFavs = data.favorites[connId] as FavoriteItem[];
                        const existingFavs = this.favorites.get(connId) || [];
                        this.mergeTrees(existingFavs, newFavs);
                        this.favorites.set(connId, existingFavs);
                    }
                }

                // Merge Scripts
                if (data.scripts) {
                    const scriptService = ScriptService.getInstance();
                    const currentState = scriptService.getFullState();
                    
                    // Merge Shared
                    if (data.scripts.shared) {
                        this.mergeTrees(currentState.shared, data.scripts.shared);
                    }

                    // Merge Connections (local)
                    const connectionScripts = data.scripts.connections || data.scripts.local;
                    
                    if (connectionScripts) {
                        if (!currentState.connections) currentState.connections = {};
                        for (const connId in connectionScripts) {
                             if (!currentState.connections[connId]) currentState.connections[connId] = [];
                             this.mergeTrees(currentState.connections[connId], connectionScripts[connId]);
                        }
                    }
                    scriptService.setFullState(currentState);
                }

                 vscode.window.showInformationMessage(`Restored: ${addedC} new connections, ${addedG} new groups.`);
            }

            this.saveConnections();
            this.saveFavorites();
            
            // Force full refresh
            this.activeConnectionId = undefined; 
            this.refresh();

        } catch (err: any) {
             vscode.window.showErrorMessage(`Restore failed: ${err.message}`);
        }
    }

    // Helper for merging recursive tree structures (Favorites, Scripts) based on ID
    private mergeTrees(existing: any[], incoming: any[]) {
        for (const newItem of incoming) {
            const existingItem = existing.find(e => e.id === newItem.id);
            if (existingItem) {
                // Item exists, merge children if they exist
                 if (newItem.children && newItem.children.length > 0) {
                     if (!existingItem.children) existingItem.children = [];
                     this.mergeTrees(existingItem.children, newItem.children);
                 }
            } else {
                // Item does not exist, add it
                existing.push(newItem);
            }
        }
    }

    async addDatabase() {
        ConnectionEditor.createOrShow(
            this.context.extensionUri,
            () => ({ groups: this.groups, connection: undefined }),
            async (conn) => {
                this.connections.push(conn);
                if (this.connections.length === 1) {
                    this.activeConnectionId = conn.id;
                }
                this.saveConnections();
            }
        );
    }

    async editDatabase(conn: DatabaseConnection) {
        ConnectionEditor.createOrShow(
            this.context.extensionUri,
            () => ({ groups: this.groups, connection: conn }),
            async (updatedConn) => {
                // Find index using the ORIGINAL connection ID, in case ID changed or object ref implies identity
                const index = this.connections.findIndex(c => c.id === conn.id);
                if (index !== -1) {
                    // Update connection and normalize data
                    if (updatedConn.color) updatedConn.color = updatedConn.color.toLowerCase();
                    
                    this.connections[index] = updatedConn;
                    this.saveConnections();
                    
                    // Force full refresh to properly reload tree and decorations
                    this.refresh();
                }
            },
            async (connToDelete) => {
                this.removeDatabase(connToDelete);
            }
        );
    }

    moveConnection(conn: DatabaseConnection, targetGroupId: string | undefined) {
        const index = this.connections.findIndex(c => c.id === conn.id);
        if (index !== -1) {
            this.connections[index].groupId = targetGroupId;
            this.saveConnections();
        }
    }

    refreshDatabase(conn: DatabaseConnection) {
        // Find the tree item corresponding to this connection to pass as element?
        // Actually, onDidChangeTreeData accepts the element to refresh.
        // We can reconstruct the element or pass the connection object if getTreeItem handles it.
        // getTreeItem handles DatabaseConnection.
        
        // If we want to refresh children (tables etc), we fire with the connection.
        this._onDidChangeTreeData.fire(conn);
    }

    removeDatabase(conn: DatabaseConnection) {
        this.connections = this.connections.filter(c => c.id !== conn.id);
        if (this.activeConnectionId === conn.id) {
            this.activeConnectionId = undefined;
        }
        this.saveConnections();
    }

    disconnect(conn: DatabaseConnection) {
        if (this.activeConnectionId === conn.id) {
            this.activeConnectionId = undefined;
            this.saveConnections();
        }
    }

    async setActive(conn: DatabaseConnection) {
        // Try to connect first
        this.connectingConnectionIds.add(conn.id);
        this.saveConnections(); // Fire update to show spinner

        try {
            await Database.checkConnection(conn);
            this.failedConnectionIds.delete(conn.id);
        } catch (err: any) {
            this.failedConnectionIds.set(conn.id, err.message);
            vscode.window.showErrorMessage(`Failed to connect to ${conn.name || conn.database}: ${err.message}`);
            // Remove from connecting list
            this.connectingConnectionIds.delete(conn.id);
            this.saveConnections(); 
            return; 
        }

        // Connection success
        this.connectingConnectionIds.delete(conn.id);
        this.activeConnectionId = conn.id;
        this.saveConnections();
        
        // Force expand the active connection
        if (this.treeView) {
            // We need to reveal the connection item.
            // Since getTreeItem maps Connection -> TreeItem, and getChildren returns Connections,
            // we should be able to reveal the Connection object itself as it is the element of the tree.
            try {
                // expand: true, select: true, focus: true
                await this.treeView.reveal(conn, { expand: true, select: true, focus: true });
            } catch (err) {
                console.error('Failed to reveal connection:', err);
            }
        }
    }

    public getConnectionBySlot(slot: number): DatabaseConnection | undefined {
        return this.connections.find(c => c.shortcutSlot === slot);
    }

    getActiveConnectionDetails(): { name: string, group: string } | undefined {
        const conn = this.getActiveConnection();
        if (!conn) return undefined;
        
        const group = conn.groupId ? this.groups.find(g => g.id === conn.groupId)?.name : undefined;
        return {
            name: conn.name || path.basename(conn.database),
            group: group || 'Root'
        };
    }

    getActiveConnection(): DatabaseConnection | undefined {
        return this.connections.find(c => c.id === this.activeConnectionId);
    }

    // --- Script Favorites Helpers ---

    public isScriptFavorite(connectionId: string | undefined, scriptId: string): boolean {
        // Search all connections for favorites with this scriptId
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
        // Search all connections for favorites with this scriptId and remove them
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
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    // --- Favorites Management ---

    public async addFavoriteScript(connectionId: string, scriptId: string, scriptName: string) {
        const items = this.favorites.get(connectionId) || [];
        
        // Check for duplicates?
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
        
        // Check if already exists at root level (or we could just add it)
        // For simplicity, we add to root by default. 
        // We might want to check if it's already in root to avoid duplicates?
        // Let's allow duplicates in different folders, but maybe warn if in root?
        
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
            // Find parent and add to its children
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
             // Add to root
             const items = this.favorites.get(connection.id) || [];
             items.push(newFolder);
             this.favorites.set(connection.id, items);
        }
        this.saveFavorites();
    }
    
    public async deleteFavoriteFolder(item: FavoriteItem) {
         // Same as removeFavorite
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
                if (item.type === 'script' && item.scriptId === objectName) { // reuse objectName param for scriptId or add new param?
                    // overloading objectName as identifier for now if type is script
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

    private saveFavorites() {
        // Map to array of { key, value } for storage
        const exportData: any[] = [];
        this.favorites.forEach((value, key) => {
            exportData.push({ key, value });
        });
        this.context.globalState.update('firebird.favoritesList', exportData);
        this._onDidChangeTreeData.fire(undefined);
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
