import * as vscode from 'vscode';

import { ConnectionEditor } from '../editors/connectionEditor';
import { Database } from '../database';
import { ScriptService } from '../services/scriptService';

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
import { FilterManager } from './filterManager';
import { backupConnections, restoreConnections } from './backupRestoreManager';
import { buildTreeItem, getTreeChildren, TreeRenderingContext } from './treeRendering';

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void> = new vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    // Sub-managers
    private favoritesManager: FavoritesManager;
    private connectionManager: ConnectionManager;
    private groupManager: GroupManager;
    private filterManager: FilterManager;

    private _loading: boolean = true;
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
        this.filterManager = new FilterManager(context);

        ScriptService.initialize(context);
        ScriptService.getInstance().onDidChangeScripts(() => this._onDidChangeTreeData.fire(undefined));
        
        this.loadConnections();

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

    // --- TreeDataProvider implementation (delegated to treeRendering.ts) ---

    private get renderingContext(): TreeRenderingContext {
        return {
            getActiveConnectionId: () => this.connectionManager.getActiveConnectionId(),
            getConnections: () => this.connectionManager.getConnections(),
            getGroups: () => this.groupManager.getGroups(),
            connectingConnectionIds: this.connectionManager.connectingConnectionIds,
            failedConnectionIds: this.connectionManager.failedConnectionIds,
            favorites: this.favoritesManager.favorites,
            isScriptFavorite: (connId, scriptId) => this.isScriptFavorite(connId, scriptId),
            getFavorite: (connId, name, type) => this.getFavorite(connId, name, type),
            getFilter: (connId, type) => this.filterManager.getFilter(connId, type),
            applyFilter: (items, filter) => this.filterManager.applyFilter(items, filter),
            getIconUri: (color) => this.getIconUri(color),
        };
    }

    getTreeItem(element: DatabaseConnection | ConnectionGroup | FolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | PaddingItem | vscode.TreeItem): vscode.TreeItem {
        return buildTreeItem(element, this.renderingContext);
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
        return getTreeChildren(element, this.renderingContext, this._loading);
    }

    // --- Filter delegations ---

    public setFilter(connectionId: string, type: string, value: string) {
        this.filterManager.setFilter(connectionId, type, value);
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
