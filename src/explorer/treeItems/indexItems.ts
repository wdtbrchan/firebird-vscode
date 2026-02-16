
import * as vscode from 'vscode';
import { DatabaseConnection } from './databaseItems';

export class TableIndexesItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly tableName: string
    ) {
        super('Indexes', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'table-indexes';
        this.iconPath = new vscode.ThemeIcon('key');
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

        // Removed default command. Now uses info button.
        // this.command = {
        //      command: 'firebird.openObject',
        //      title: 'Show Index Info',
        //      arguments: ['index', indexName, connection]
        // };
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
