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

import { ConnectionGroup, FolderItem, ObjectItem, FilterItem } from './treeItems/databaseItems';
import { DatabaseConnection } from '../database/types';
import { 
    FavoriteItem, FavoritesRootItem, FavoriteFolderItem, FavoriteScriptItem, FavoriteIndexItem 
} from './treeItems/favoritesItems';
import { 
    ScriptItem, ScriptFolderItem 
} from './treeItems/scriptItems';
import { 
    TriggerGroupItem, TableTriggersItem, TriggerItem, TriggerOperationItem, TriggerFolderItem 
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

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<DatabaseConnection | ConnectionGroup | FolderItem | TriggerFolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerFolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void> = new vscode.EventEmitter<DatabaseConnection | ConnectionGroup | FolderItem | TriggerFolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseConnection | ConnectionGroup | FolderItem | TriggerFolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | FavoritesRootItem | FavoriteFolderItem | PaddingItem | vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    // Sub-managers
    public readonly favoritesManager: FavoritesManager;
    public readonly connectionManager: ConnectionManager;
    public readonly groupManager: GroupManager;
    public readonly filterManager: FilterManager;

    private _loading: boolean = true;
    private treeView: vscode.TreeView<any> | undefined;

    // View state for triggers (not persisted to disk)
    private triggerViewModes: Map<string, 'grouped' | 'list'> = new Map();


    // Public access to favorites for DragAndDropController
    public get favorites(): Map<string, FavoriteItem[]> {
        return this.favoritesManager.favorites;
    }

    constructor(private context: vscode.ExtensionContext) {
        // Initialize sub-managers
        this.favoritesManager = new FavoritesManager(context, () => this._onDidChangeTreeData.fire(undefined));
        this.connectionManager = new ConnectionManager(context, () => this.groupManager.getGroups(), () => this._onDidChangeTreeData.fire(undefined));
        this.groupManager = new GroupManager(context, () => this.connectionManager.getConnections(), () => this.saveConnections());
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
        this.connectionManager.saveConnections();
    }

    refresh(): void {
        this.loadConnections();
        this._onDidChangeTreeData.fire(undefined);
    }

    refreshItem(item?: any): void {
        this._onDidChangeTreeData.fire(item);
    }

    // --- Connection delegations ---

    public getConnectionById(id: string): DatabaseConnection | undefined {
        return this.connectionManager.getConnectionById(id);
    }

    public getConnectionsInGroup(groupId: string | undefined): DatabaseConnection[] {
        return this.connectionManager.getConnectionsInGroup(groupId);
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
            isScriptFavorite: (connId, scriptId) => this.favoritesManager.isScriptFavorite(connId, scriptId),
            getFavorite: (connId, name, type) => this.favoritesManager.getFavorite(connId, name, type),
            getFilter: (connId, type) => this.filterManager.getFilter(connId, type),
            applyFilter: (items, filter) => this.filterManager.applyFilter(items, filter),
            getIconUri: (color) => this.getIconUri(color),
            getTriggerViewMode: (connId, context) => this.triggerViewModes.get(`${connId}:${context || 'main'}`) || 'list',
            toggleTriggerViewMode: (connId, context) => this.toggleTriggerViewMode(connId, context),
            setTriggerViewMode: (connId, context, mode) => this.setTriggerViewMode(connId, context, mode)
        };
    }

    public toggleTriggerViewMode(connectionId: string, context: string) {
        const key = `${connectionId}:${context || 'main'}`;
        const currentMode = this.triggerViewModes.get(key) || 'list';
        const newMode = currentMode === 'grouped' ? 'list' : 'grouped';
        this.setTriggerViewMode(connectionId, context, newMode);
    }

    public setTriggerViewMode(connectionId: string, context: string, mode: 'grouped' | 'list') {
        const key = `${connectionId}:${context || 'main'}`;
        this.triggerViewModes.set(key, mode);
        
        // Refresh the specific connection
        const conn = this.getConnectionById(connectionId);
        if (conn) {
            this._onDidChangeTreeData.fire(conn);
        }
    }

    getTreeItem(element: DatabaseConnection | ConnectionGroup | FolderItem | TriggerFolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | PaddingItem | vscode.TreeItem): vscode.TreeItem {
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

    async getChildren(element?: DatabaseConnection | ConnectionGroup | FolderItem | TriggerFolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem): Promise<(DatabaseConnection | ConnectionGroup | FolderItem | TriggerFolderItem | TriggerGroupItem | TableTriggersItem | TableIndexesItem | ObjectItem | OperationItem | CreateNewIndexItem | IndexItem | IndexOperationItem | TriggerItem | TriggerOperationItem | FilterItem | ScriptItem | ScriptFolderItem | PaddingItem | vscode.TreeItem)[]> {
        return getTreeChildren(element, this.renderingContext, this._loading);
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
}
