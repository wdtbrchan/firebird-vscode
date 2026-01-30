import * as vscode from 'vscode';
import * as path from 'path';
import { ConnectionEditor } from '../editors/connectionEditor';


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

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<DatabaseConnection | ConnectionGroup> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseConnection | ConnectionGroup | undefined | void> = new vscode.EventEmitter<DatabaseConnection | ConnectionGroup | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseConnection | ConnectionGroup | undefined | void> = this._onDidChangeTreeData.event;

    private connections: DatabaseConnection[] = [];
    private groups: ConnectionGroup[] = [];
    private activeConnectionId: string | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.loadConnections();
    }

    private loadConnections() {
        const storedConns = this.context.globalState.get<DatabaseConnection[]>('firebird.connections');
        const storedGroups = this.context.globalState.get<ConnectionGroup[]>('firebird.groups');
        this.connections = storedConns || [];
        this.groups = storedGroups || [];
        this.activeConnectionId = this.context.globalState.get<string>('firebird.activeConnectionId');
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

    getTreeItem(element: DatabaseConnection | ConnectionGroup): vscode.TreeItem {
        if ('host' in element) {
            // It's a connection
            const isLocal = element.host === '127.0.0.1' || element.host === 'localhost';
            const label = element.name || path.basename(element.database);
            const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
            
            treeItem.description = `${element.host}:${element.port}`;
            treeItem.tooltip = `${element.user}@${element.host}:${element.port}/${element.database}`;
            treeItem.id = element.id;
            treeItem.id = element.id;
            treeItem.contextValue = 'database'; // Default context

            if (element.id === this.activeConnectionId) {
                treeItem.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'));
                // Make label bold by highlighting it
                treeItem.label = {
                    label: label,
                    highlights: [[0, label.length]]
                };
                treeItem.contextValue = 'database-active';
            } else {
                 treeItem.iconPath = new vscode.ThemeIcon('database');
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

    getChildren(element?: DatabaseConnection | ConnectionGroup): Thenable<(DatabaseConnection | ConnectionGroup)[]> {
        if (element) {
            if ('host' in element) {
                 return Promise.resolve([]); // Connections have no children
            } else {
                // Return connections in this group
                const groupConns = this.connections.filter(c => c.groupId === element.id);
                return Promise.resolve(groupConns);
            }
        }
        
        // Root: Groups + Ungrouped Connections
        const rootGroups = this.groups;
        const ungroupedConns = this.connections.filter(c => !c.groupId || !this.groups.find(g => g.id === c.groupId));
        return Promise.resolve([...rootGroups, ...ungroupedConns]);
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

    setActive(conn: DatabaseConnection) {
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
