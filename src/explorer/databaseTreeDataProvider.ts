import * as vscode from 'vscode';
import * as path from 'path';

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

// Sub-modules
import { FavoritesManager } from './favoritesManager';
import { ConnectionManager } from './connectionManager';
import { GroupManager } from './groupManager';
import { backupConnections, restoreConnections } from './backupRestoreManager';

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void> = new vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    // Sub-managers
    private favoritesManager: FavoritesManager;
    private connectionManager: ConnectionManager;
    private groupManager: GroupManager;

    private _loading: boolean = true;
    private filters: Map<string, string> = new Map(); // key: connId|type -> filterValue
    private treeView: vscode.TreeView<any> | undefined;

    // Public access to favorites for DragAndDropController
    public get favorites(): Map<string, FavoriteItem[]> {
        return this.favoritesManager.favorites;
    }

    constructor(private context: vscode.ExtensionContext) {
        // Initialize sub-managers
        this.favoritesManager = new FavoritesManager(context, () => this._onDidChangeTreeData.fire(undefined));
        this.connectionManager = new ConnectionManager(context, () => this._onDidChangeTreeData.fire(undefined));
        this.groupManager = new GroupManager(context, () => this.saveConnections());

        ScriptService.initialize(context);
        ScriptService.getInstance().onDidChangeScripts(() => this._onDidChangeTreeData.fire(undefined));
        
        this.loadConnections();
        
        // Load filters
        const savedFilters = this.context.globalState.get<any[]>('firebird.filters', []);
        savedFilters.forEach(f => this.filters.set(f.key, f.value));

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
        this.connectionManager.loadConnections();
        const storedGroups = this.context.globalState.get<ConnectionGroup[]>('firebird.groups');
        this.groupManager.load(storedGroups || []);
    }

    private saveConnections() {
        this.connectionManager.saveConnections(this.groupManager.getGroups());
    }

    refresh(): void {
        this.loadConnections();
        this._onDidChangeTreeData.fire(undefined);
    }

    // --- Connection delegations ---

    public getConnectionById(id: string): DatabaseConnection | undefined {
        return this.connectionManager.getConnectionById(id);
    }

    public getConnectionsInGroup(groupId: string | undefined): DatabaseConnection[] {
        return this.connectionManager.getConnectionsInGroup(groupId, this.groupManager.getGroups());
    }

    public getGroups(): ConnectionGroup[] {
        return this.groupManager.getGroups();
    }

    // --- TreeDataProvider implementation ---

    getTreeItem(element: DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | PaddingItem | vscode.TreeItem): vscode.TreeItem {
        if (element instanceof vscode.TreeItem) {
            return element;
        }

        if ('host' in element) {
            // It's a connection
            const isLocal = element.host === '127.0.0.1' || element.host === 'localhost';
            const label = element.name || path.basename(element.database);
            
            const isActive = element.id === this.connectionManager.getActiveConnectionId();
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
                treeItem.iconPath = this.getIconUri(hexColor);
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
            if (this.connectionManager.connectingConnectionIds.has(element.id)) {
                treeItem.iconPath = new vscode.ThemeIcon('loading~spin');
                treeItem.description = (treeItem.description || '') + ' (Connecting...)';
                treeItem.contextValue = 'database-connecting';
            }
            // Check for failure state override (only if not connecting)
            else if (this.connectionManager.failedConnectionIds.has(element.id)) {
                treeItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.red'));
                treeItem.description = (treeItem.description || '') + ' (Disconnected)';
                treeItem.tooltip = `Error: ${this.connectionManager.failedConnectionIds.get(element.id)}`;
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

    getParent(element: any): vscode.ProviderResult<any> {
        if (element.host && element.database) { 
             const conn = element as DatabaseConnection;
             if (conn.groupId) {
                 return this.groupManager.getGroups().find(g => g.id === conn.groupId);
             }
             return undefined;
        }
        
        if (element instanceof FolderItem) {
            return element.connection;
        }

        return undefined;
    }


    private getIconUri(color: string): vscode.Uri {
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
                                 items.push(new ScriptItem(script, element.connection.id, this.isScriptFavorite(element.connection.id, script.id)));
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
                                 items.push(new ScriptItem(script, undefined, this.isScriptFavorite(undefined, script.id)));
                             }
                         }
                         return items;
                    }

                    const filter = this.getFilter(element.connection.id, element.type);
                    const resultItems: (ObjectItem | TriggerGroupItem | FilterItem)[] = [];
                    
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
                const ops: (OperationItem | TableTriggersItem)[] = [];
                
                if (element.type === 'table') {
                    ops.push(new OperationItem('Create Script', 'create', element));
                    ops.push(new OperationItem('Alter Script', 'alter', element));
                    ops.push(new OperationItem('Drop table', 'drop', element));
                    ops.push(new TableIndexesItem(element.connection, element.objectName));
                    ops.push(new TableTriggersItem(element.connection, element.objectName));
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
                             items.push(new ScriptItem(child, element.connectionId, this.isScriptFavorite(element.connectionId, child.id)));
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
                    new FolderItem('Triggers', 'triggers', element),
                    new FolderItem('Procedures', 'procedures', element),
                    new FolderItem('Generators', 'generators', element),
                    new FolderItem('Local Scripts', 'local-scripts', element),
                    new FolderItem('Global Scripts', 'global-scripts', element)
                ];
            } else {
                const groupConns = this.connectionManager.getConnections().filter(c => c.groupId === element.id);
                return [...groupConns, new PaddingItem()];
            }
        }
        
        // Root
        const rootGroups = this.groupManager.getGroups();
        const connections = this.connectionManager.getConnections();
        const ungroupedConns = connections.filter(c => !c.groupId || !rootGroups.find(g => g.id === c.groupId));
        
        return [...rootGroups, ...ungroupedConns, new PaddingItem()];
    }

    // --- Tree helper methods ---

    private async loadObjectList(
        connection: DatabaseConnection, 
        type: 'table' | 'view' | 'procedure' | 'generator', 
        fetchFn: (conn: DatabaseConnection) => Promise<string[]>, 
        filter: string
    ): Promise<(ObjectItem | FilterItem)[]> {
        const items = await fetchFn(connection);
        const sortedItems = [...items].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const filteredItems = this.applyFilter(sortedItems, filter);
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
            for (const key in groups) {
                groups[key].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
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

    // --- Filter methods ---

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

    // --- Delegations to GroupManager ---

    async createGroup() {
        return this.groupManager.createGroup();
    }

    async renameGroup(group?: ConnectionGroup) {
        return this.groupManager.renameGroup(group);
    }

    async deleteGroup(group: ConnectionGroup) {
        return this.groupManager.deleteGroup(group, this.connectionManager.getConnections());
    }

    moveGroup(groupId: string, targetIndex: number) {
        return this.groupManager.moveGroup(groupId, targetIndex);
    }

    // --- Delegations to ConnectionManager ---

    async addDatabase() {
        return this.connectionManager.addDatabase(this.context.extensionUri, this.groupManager.getGroups(), () => this.saveConnections());
    }

    async editDatabase(conn: DatabaseConnection) {
        return this.connectionManager.editDatabase(conn, this.context.extensionUri, this.groupManager.getGroups(), () => this.saveConnections(), () => this.refresh());
    }

    moveConnection(conn: DatabaseConnection, targetGroupId: string | undefined, targetIndex?: number) {
        this.connectionManager.moveConnection(conn, targetGroupId, this.groupManager.getGroups(), targetIndex);
        this.saveConnections();
    }

    refreshDatabase(conn: DatabaseConnection) {
        this._onDidChangeTreeData.fire(conn);
    }

    removeDatabase(conn: DatabaseConnection) {
        this.connectionManager.removeDatabase(conn, () => this.saveConnections());
    }

    disconnect(conn: DatabaseConnection) {
        this.connectionManager.disconnect(conn, () => this.saveConnections());
    }

    async setActive(conn: DatabaseConnection) {
        return this.connectionManager.setActive(conn, () => this.saveConnections(), this.treeView);
    }

    public getConnectionBySlot(slot: number): DatabaseConnection | undefined {
        return this.connectionManager.getConnectionBySlot(slot);
    }

    getActiveConnectionDetails(): { name: string, group: string } | undefined {
        return this.connectionManager.getActiveConnectionDetails(this.groupManager.getGroups());
    }

    getActiveConnection(): DatabaseConnection | undefined {
        return this.connectionManager.getActiveConnection();
    }

    // --- Delegations to BackupRestoreManager ---

    async backupConnections() {
        return backupConnections(
            this.connectionManager.getConnections(),
            this.groupManager.getGroups(),
            this.favoritesManager.favorites
        );
    }

    async restoreConnections() {
        const result = await restoreConnections(
            this.connectionManager.getConnections(),
            this.groupManager.getGroups(),
            this.favoritesManager.favorites
        );

        if (result) {
            this.connectionManager.setConnections(result.connections);
            this.groupManager.setGroups(result.groups);
            
            // Clear active connection if it was removed
            if (this.connectionManager.getActiveConnectionId() && !result.connections.find(c => c.id === this.connectionManager.getActiveConnectionId())) {
                this.connectionManager.setActiveConnectionId(undefined);
            }

            this.saveConnections();
            this.favoritesManager.saveFavorites();
            
            // Force full refresh
            this.connectionManager.setActiveConnectionId(undefined);
            this.refresh();
        }
    }

    // --- Delegations to FavoritesManager ---

    public isScriptFavorite(connectionId: string | undefined, scriptId: string): boolean {
        return this.favoritesManager.isScriptFavorite(connectionId, scriptId);
    }

    public async removeScriptFavorite(scriptId: string) {
        return this.favoritesManager.removeScriptFavorite(scriptId);
    }

    public async addFavoriteScript(connectionId: string, scriptId: string, scriptName: string) {
        return this.favoritesManager.addFavoriteScript(connectionId, scriptId, scriptName);
    }

    public async addFavorite(connection: DatabaseConnection, objectName: string, objectType: 'table' | 'view' | 'trigger' | 'procedure' | 'generator' | 'function' | 'index') {
        return this.favoritesManager.addFavorite(connection, objectName, objectType);
    }

    public async removeFavorite(item: FavoriteItem) {
        return this.favoritesManager.removeFavorite(item);
    }

    public async clearFavorites(connectionId: string) {
        return this.favoritesManager.clearFavorites(connectionId);
    }

    public async createFavoriteFolder(connection: DatabaseConnection, parent?: FavoriteItem) {
        return this.favoritesManager.createFavoriteFolder(connection, parent);
    }

    public async deleteFavoriteFolder(item: FavoriteItem) {
        return this.favoritesManager.deleteFavoriteFolder(item);
    }

    public async renameFavoriteFolder(item: FavoriteItem) {
        return this.favoritesManager.renameFavoriteFolder(item);
    }

    public async moveFavorite(movedItem: FavoriteItem, targetParent: FavoriteItem | undefined, targetIndex?: number) {
        return this.favoritesManager.moveFavorite(movedItem, targetParent, targetIndex);
    }

    public getFavorite(connectionId: string, objectName: string, objectType: string): FavoriteItem | undefined {
        return this.favoritesManager.getFavorite(connectionId, objectName, objectType);
    }

    public async removeFavoriteObject(connection: DatabaseConnection, objectName: string, objectType: string) {
        return this.favoritesManager.removeFavoriteObject(connection, objectName, objectType);
    }

    public async removeFavoriteItem(item: FavoriteItem) {
        return this.favoritesManager.removeFavoriteItem(item);
    }

    private saveFavorites() {
        this.favoritesManager.saveFavorites();
    }
}
