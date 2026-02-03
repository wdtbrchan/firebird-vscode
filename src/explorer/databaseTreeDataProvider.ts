import * as vscode from 'vscode';
import * as path from 'path';
import { ConnectionEditor } from '../editors/connectionEditor';
import { Database } from '../db';
import { MetadataService } from '../services/metadataService';


export interface DatabaseConnection {
    id: string; // unique identifier
    host: string;
    port: number;
    database: string; // path
    user: string;
    password?: string; // Optional if we move to Secrets API later
    role?: string;
    charset?: string;
    name?: string; // friendly name
    groupId?: string; // ID of parent group
}

export interface ConnectionGroup {
    id: string;
    name: string;
}

export class FolderItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: 'tables' | 'views' | 'triggers' | 'procedures' | 'generators',
        public readonly connection: DatabaseConnection
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'folder';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

export class TriggerGroupItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly triggers: any[], // Store triggers directly
        public readonly connection: DatabaseConnection,
        state: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(label, state);
        this.contextValue = 'trigger-group';
        this.iconPath = new vscode.ThemeIcon('folder-active');
        this.id = `${connection.id}|triggerGroup|${label}|${state}`;
    }
}

export class TableTriggersItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly tableName: string
    ) {
        super('Triggers', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'table-triggers';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

export class TableIndexesItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly tableName: string
    ) {
        super('Indexes', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'table-indexes';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

export class CreateNewIndexItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly tableName: string
    ) {
        super('Create new index', vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'create-index';
        this.iconPath = new vscode.ThemeIcon('add');
        this.command = {
            command: 'firebird.createIndex',
            title: 'Create Index',
            arguments: [connection, tableName]
        };
    }
}

export class IndexItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly tableName: string,
        public readonly indexName: string,
        public readonly unique: boolean,
        public readonly inactive: boolean
    ) {
        super(indexName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'index-item';
        this.iconPath = new vscode.ThemeIcon('key'); 
        this.description = [
            unique ? 'UNIQUE' : '',
            inactive ? 'INACTIVE' : ''
        ].filter(x => x).join(' ');

        this.command = {
             command: 'firebird.openObject',
             title: 'Show Index Info',
             arguments: ['index', indexName, connection]
        };
    }
}

export class IndexOperationItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly type: 'drop' | 'activate' | 'deactivate' | 'recompute',
        public readonly connection: DatabaseConnection,
        public readonly indexName: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'index-operation';
        
        // Icons
        if (type === 'drop') this.iconPath = new vscode.ThemeIcon('trash');
        else if (type === 'activate') this.iconPath = new vscode.ThemeIcon('check');
        else if (type === 'deactivate') this.iconPath = new vscode.ThemeIcon('circle-slash');
        else if (type === 'recompute') this.iconPath = new vscode.ThemeIcon('refresh');

        this.command = {
             command: 'firebird.indexOperation',
             title: label,
             arguments: [type, connection, indexName]
        };
    }
}

export class TriggerItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly triggerName: string,
        public readonly sequence: number,
        public readonly inactive: boolean
    ) {
        super(triggerName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'trigger-item';
        this.iconPath = new vscode.ThemeIcon('zap');
        this.description = [
            `(${sequence})`,
            inactive ? 'INACTIVE' : ''
        ].filter(x => x).join(' ');

        this.command = {
             command: 'firebird.openObject',
             title: 'Show Trigger Info',
             arguments: ['trigger', triggerName, connection]
        };
    }
}

export class TriggerOperationItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly type: 'drop' | 'activate' | 'deactivate',
        public readonly connection: DatabaseConnection,
        public readonly triggerName: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'trigger-operation';
        
        if (type === 'drop') this.iconPath = new vscode.ThemeIcon('trash');
        else if (type === 'activate') this.iconPath = new vscode.ThemeIcon('check');
        else if (type === 'deactivate') this.iconPath = new vscode.ThemeIcon('circle-slash');

        this.command = {
             command: 'firebird.triggerOperation',
             title: label,
             arguments: [type, connection, triggerName]
        };
    }
}

export class FilterItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly type: 'tables' | 'views' | 'triggers' | 'procedures' | 'generators',
        public readonly filterValue: string
    ) {
        super(filterValue ? `🔍 Filter: ${filterValue}` : '🔍 Click to filter...', vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'filter-item';
        this.iconPath = new vscode.ThemeIcon('search');
        
        this.command = {
            command: 'firebird.editFilter',
            title: 'Edit Filter',
            arguments: [connection, type]
        };
    }
}

export class ObjectItem extends vscode.TreeItem {
    public readonly objectName: string;
    constructor(
        public readonly label: string,
        public readonly type: 'table' | 'view' | 'trigger' | 'procedure' | 'generator',
        public readonly connection: DatabaseConnection,
        objectName?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'object';
        this.objectName = objectName || label;
        
        let iconId = 'symbol-misc';
        switch (type) {
            case 'table': iconId = 'table'; break;
            case 'view': iconId = 'eye'; break;
            case 'trigger': iconId = 'zap'; break;
            case 'procedure': iconId = 'gear'; break;
            case 'generator': iconId = 'list-ordered'; break;
        }
        this.iconPath = new vscode.ThemeIcon(iconId);

        // Keep command to open viewing panel on click
        this.command = {
            command: 'firebird.openObject',
            title: 'Open Object',
            arguments: [type, this.objectName, connection]
        };
    }
}

export class OperationItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly type: 'create' | 'alter' | 'recreate' | 'info',
        public readonly parentObject: ObjectItem
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        
        if (type === 'create') {
            this.iconPath = new vscode.ThemeIcon('new-file');
            this.contextValue = 'script-create';
            this.command = {
                command: 'firebird.generateScript',
                title: 'Create Script',
                arguments: ['create', parentObject]
            };
        } else if (type === 'alter') {
            this.iconPath = new vscode.ThemeIcon('edit');
            this.contextValue = 'script-alter';
            this.command = {
                command: 'firebird.generateScript',
                title: 'Alter Script',
                arguments: ['alter', parentObject]
            };
        } else if (type === 'recreate') {
            this.iconPath = new vscode.ThemeIcon('refresh');
            this.contextValue = 'script-recreate';
            this.command = {
                command: 'firebird.generateScript',
                title: 'Recreate Script',
                arguments: ['recreate', parentObject]
            };
        } else {
            // Info item (e.g. Current Value)
            this.iconPath = new vscode.ThemeIcon('info');
            this.contextValue = 'info-item';
        }
    }
}

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | vscode.TreeItem | undefined | void> = new vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private connections: DatabaseConnection[] = [];
    private groups: ConnectionGroup[] = [];
    private activeConnectionId: string | undefined;
    private failedConnectionIds: Map<string, string> = new Map(); // id -> error message
    private connectingConnectionIds = new Set<string>();
    private _loading: boolean = true;
    private filters: Map<string, string> = new Map(); // key: connId|type -> filterValue

    constructor(private context: vscode.ExtensionContext) {
        this.loadConnections();
        // Simulate a short loading delay to ensure the UI renders the loading state
        // and doesn't flash "No data" if dependent on async activation
        setTimeout(() => {
            this._loading = false;
            this._onDidChangeTreeData.fire();
        }, 500);
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
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this.loadConnections();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | vscode.TreeItem): vscode.TreeItem {
        if (element instanceof vscode.TreeItem) {
            return element;
        }

        if ('host' in element) {
            // It's a connection
            const isLocal = element.host === '127.0.0.1' || element.host === 'localhost';
            const label = element.name || path.basename(element.database);
            
            const isActive = element.id === this.activeConnectionId;
            // Only collapsed (expandable) if active. Otherwise None (leaf).
            const state = isActive ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;

            const treeItem = new vscode.TreeItem(label, state);
            
            treeItem.description = `${element.host}:${element.port}`;
            treeItem.tooltip = `${element.user}@${element.host}:${element.port}/${element.database}`;
            treeItem.id = element.id;
            treeItem.contextValue = 'database'; // Default context

            if (isActive) {
                treeItem.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'));
                // Make label bold by highlighting it
                treeItem.label = {
                    label: label,
                    highlights: [[0, label.length]]
                };
                treeItem.contextValue = 'database-active';
            } else {
                 treeItem.iconPath = new vscode.ThemeIcon('database');
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
            const treeItem = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Expanded);
            treeItem.id = element.id;
            treeItem.contextValue = 'group';
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            return treeItem;
        }
    }

    async getChildren(element?: DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem): Promise<(DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | vscode.TreeItem)[]> {
        if (this._loading && !element) {
            const loadingItem = new vscode.TreeItem('Loading...');
            loadingItem.iconPath = new vscode.ThemeIcon('loading~spin');
            return [loadingItem];
        }

        if (element) {
            if (element instanceof FolderItem) {
                // Return objects inside folder
                try {
                    const filter = this.getFilter(element.connection.id, element.type);
                    const resultItems: (ObjectItem | TriggerGroupItem | FilterItem)[] = [];
                    
                    // Add FilterItem
                    resultItems.push(new FilterItem(element.connection, element.type, filter));

                    let items: string[] = [];
                    let filteredItems: string[] = [];
                    
                    switch (element.type) {
                        case 'tables':
                            items = await MetadataService.getTables(element.connection);
                            filteredItems = this.applyFilter(items, filter);
                            resultItems.push(...filteredItems.map(name => new ObjectItem(name, 'table', element.connection)));
                            break;
                        case 'views':
                            items = await MetadataService.getViews(element.connection);
                            filteredItems = this.applyFilter(items, filter);
                            resultItems.push(...filteredItems.map(name => new ObjectItem(name, 'view', element.connection)));
                            break;
                        case 'triggers':
                            // Main triggers folder -> Collapsed groups (default), Expanded if filtering
                            const groups = await this.getGroupedTriggers(element.connection, undefined, filter, !!filter);
                            resultItems.push(...groups);
                            break;
                        case 'procedures':
                            items = await MetadataService.getProcedures(element.connection);
                            filteredItems = this.applyFilter(items, filter);
                            resultItems.push(...filteredItems.map(name => new ObjectItem(name, 'procedure', element.connection)));
                            break;
                        case 'generators':
                            items = await MetadataService.getGenerators(element.connection);
                            filteredItems = this.applyFilter(items, filter);
                            resultItems.push(...filteredItems.map(name => new ObjectItem(name, 'generator', element.connection)));
                            break;
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
                     return new TriggerItem(element.connection, t.name, t.sequence, t.inactive);
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
            } else if (element instanceof OperationItem) {
                return [];
            }
            
            if ('host' in element) {
                // It's a connection
                return [
                    new FolderItem('Tables', 'tables', element),
                    new FolderItem('Views', 'views', element),
                    new FolderItem('Triggers', 'triggers', element),
                    new FolderItem('Procedures', 'procedures', element),
                    new FolderItem('Generators', 'generators', element)
                ];
            } else {
                // It's a group
                const groupConns = this.connections.filter(c => c.groupId === element.id);
                return groupConns;
            }
        }
        
        // Root
        const rootGroups = this.groups;
        const ungroupedConns = this.connections.filter(c => !c.groupId || !this.groups.find(g => g.id === c.groupId));
        return [...rootGroups, ...ungroupedConns];
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
                const index = this.connections.findIndex(c => c.id === updatedConn.id);
                if (index !== -1) {
                    this.connections[index] = updatedConn;
                    this.saveConnections();
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
}

export class DatabaseDragAndDropController implements vscode.TreeDragAndDropController<DatabaseConnection | ConnectionGroup> {
    public dropMimeTypes = ['application/vnd.code.tree.firebird-databases'];
    public dragMimeTypes = ['application/vnd.code.tree.firebird-databases'];

    constructor(private provider: DatabaseTreeDataProvider) {}

    handleDrag(source: (DatabaseConnection | ConnectionGroup)[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        const item = source[0];
        // Only allow dragging connections
        if ('host' in item) {
             dataTransfer.set('application/vnd.code.tree.firebird-databases', new vscode.DataTransferItem(item));
        }
    }

    handleDrop(target: DatabaseConnection | ConnectionGroup | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
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
