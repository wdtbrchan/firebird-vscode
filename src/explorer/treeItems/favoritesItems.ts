
import * as vscode from 'vscode';
import { DatabaseConnection } from '../../database/types';

export interface FavoriteItem {
    id: string; // UUID
    type: 'folder' | 'object' | 'script';
    label: string; // Folder name or Object name
    objectType?: 'table' | 'view' | 'trigger' | 'procedure' | 'generator' | 'function' | 'index';
    children?: FavoriteItem[]; // For folders
    connectionId?: string; // To link back to connection
    isExpanded?: boolean; // For folders
    scriptId?: string; // For scripts
}

export class FavoritesRootItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection
    ) {
        super('Favorites', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'favorites-root';
        this.iconPath = new vscode.ThemeIcon('star-full');
    }
}

export class FavoriteFolderItem extends vscode.TreeItem {
    constructor(
        public readonly data: FavoriteItem,
        public readonly connection: DatabaseConnection
    ) {
        super(data.label, data.isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'favorite-folder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.id = data.id;
    }
}

export class FavoriteScriptItem extends vscode.TreeItem {
    constructor(
        public readonly data: FavoriteItem,
        public readonly connection: DatabaseConnection
    ) {
        super(data.label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'script-favorite';
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.id = data.id;
        
        this.command = {
             command: 'firebird.openFavoriteScript',
             title: 'Open Script',
             arguments: [data]
        };
    }
}

export class FavoriteIndexItem extends vscode.TreeItem {
    constructor(
        public readonly data: FavoriteItem,
        public readonly connection: DatabaseConnection
    ) {
        super(data.label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'index-favorite';
        this.iconPath = new vscode.ThemeIcon('key');
        this.id = data.id;

        this.command = {
             command: 'firebird.openObject',
             title: 'Show Index Info',
             arguments: ['index', data.label, connection]
        };
    }
}
