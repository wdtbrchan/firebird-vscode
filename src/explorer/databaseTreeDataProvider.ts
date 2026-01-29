import * as vscode from 'vscode';
import * as path from 'path';

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
}

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<DatabaseConnection> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseConnection | undefined | void> = new vscode.EventEmitter<DatabaseConnection | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseConnection | undefined | void> = this._onDidChangeTreeData.event;

    private connections: DatabaseConnection[] = [];
    private activeConnectionId: string | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.loadConnections();
    }

    private loadConnections() {
        const stored = this.context.globalState.get<DatabaseConnection[]>('firebird.connections');
        this.connections = stored || [];
        this.activeConnectionId = this.context.globalState.get<string>('firebird.activeConnectionId');
    }

    private saveConnections() {
        this.context.globalState.update('firebird.connections', this.connections);
        this.context.globalState.update('firebird.activeConnectionId', this.activeConnectionId);
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this.loadConnections();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatabaseConnection): vscode.TreeItem {
        const isLocal = element.host === '127.0.0.1' || element.host === 'localhost';
        const label = element.name || path.basename(element.database); // Default to filename
        const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        
        treeItem.description = `${element.host}:${element.port}`;
        treeItem.tooltip = `${element.user}@${element.host}:${element.port}/${element.database}`;
        treeItem.id = element.id;

        if (element.id === this.activeConnectionId) {
            treeItem.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'));
            treeItem.description = `(Active) ${treeItem.description}`;
            treeItem.contextValue = 'database-active'; // Different context for active items
        } else {
             treeItem.iconPath = new vscode.ThemeIcon('database');
             treeItem.contextValue = 'database';
        }

        return treeItem;
    }

    getChildren(element?: DatabaseConnection): Thenable<DatabaseConnection[]> {
        if (element) {
            return Promise.resolve([]); // No children for now (tables later)
        }
        return Promise.resolve(this.connections);
    }

    async addDatabase() {
        const host = await vscode.window.showInputBox({ prompt: 'Host', value: '127.0.0.1' });
        if (!host) return;

        const portStr = await vscode.window.showInputBox({ prompt: 'Port', value: '3050' });
        if (!portStr) return;
        const port = parseInt(portStr);

        const dbPath = await vscode.window.showInputBox({ prompt: 'Database Path (Absolute path to .fdb)', value: '' });
        if (!dbPath) return;

        const user = await vscode.window.showInputBox({ prompt: 'User', value: 'SYSDBA' });
        if (!user) return;

        const password = await vscode.window.showInputBox({ prompt: 'Password', value: 'masterkey', password: true });
        if (!password) return;

        const charset = await vscode.window.showInputBox({ prompt: 'Charset', value: 'UTF8' });

        const newConn: DatabaseConnection = {
            id: Date.now().toString(),
            host,
            port,
            database: dbPath,
            user,
            password,
            charset: charset || 'UTF8'
        };

        this.connections.push(newConn);
        
        // If first connection, make it active
        if (this.connections.length === 1) {
            this.activeConnectionId = newConn.id;
        }

        this.saveConnections();
    }

    async editDatabase(conn: DatabaseConnection) {
        const host = await vscode.window.showInputBox({ prompt: 'Host', value: conn.host });
        if (!host) return;

        const portStr = await vscode.window.showInputBox({ prompt: 'Port', value: conn.port.toString() });
        if (!portStr) return;
        const port = parseInt(portStr);

        const dbPath = await vscode.window.showInputBox({ prompt: 'Database Path (Absolute path to .fdb)', value: conn.database });
        if (!dbPath) return;

        const user = await vscode.window.showInputBox({ prompt: 'User', value: conn.user });
        if (!user) return;

        // Keep existing password if empty, or allow changing it
        const password = await vscode.window.showInputBox({ prompt: 'Password (leave empty to keep unchanged)', value: '', password: true });
        
        const charset = await vscode.window.showInputBox({ prompt: 'Charset', value: conn.charset || 'UTF8' });

        // Update connection
        const index = this.connections.findIndex(c => c.id === conn.id);
        if (index !== -1) {
            this.connections[index] = {
                ...conn,
                host,
                port,
                database: dbPath,
                user,
                charset: charset || 'UTF8',
                password: password ? password : conn.password
            };
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

    getActiveConnection(): DatabaseConnection | undefined {
        return this.connections.find(c => c.id === this.activeConnectionId);
    }
}
