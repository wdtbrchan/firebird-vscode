
import * as vscode from 'vscode';
import { FolderItem } from './databaseItems';
import { DatabaseConnection } from '../../database/types';

export class TriggerFolderItem extends FolderItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly viewMode: 'grouped' | 'list' = 'list'
    ) {
        super('Triggers', 'triggers', connection);
        this.contextValue = `trigger-folder-${viewMode}`;
        this.id = `${connection.id}-triggers`;
    }
}


export class TriggerGroupItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly triggers: any[], // Store triggers directly or TriggerItems
        public readonly connection: DatabaseConnection,
        state: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
        uniquePath?: string
    ) {
        super(label, state);
        this.contextValue = 'trigger-group';
        this.iconPath = new vscode.ThemeIcon('folder-active');
        this.id = `${connection.id}|triggerGroup|${uniquePath || label}|${state}`;
    }
}

export class TableTriggersItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly tableName: string,
        public readonly viewMode: 'grouped' | 'list' = 'list'
    ) {
        super('Triggers', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = `table-triggers-${viewMode}`;
        this.iconPath = new vscode.ThemeIcon('zap');
        this.id = `${connection.id}-${tableName}-triggers`;
    }
}

export class TriggerItem extends vscode.TreeItem {
    public readonly type: 'trigger';
    public readonly objectName: string;
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly triggerName: string,
        public readonly sequence: number,
        public readonly inactive: boolean,
        public readonly isFavorite: boolean = false,
        public readonly favoriteId?: string
    ) {
        super(triggerName, vscode.TreeItemCollapsibleState.Collapsed);
        this.type = 'trigger';
        this.objectName = triggerName;
        this.contextValue = this.isFavorite ? 'trigger-favorite' : 'trigger';
        this.iconPath = new vscode.ThemeIcon('zap');
        this.description = [
            `(${sequence})`,
            inactive ? 'INACTIVE' : ''
        ].filter(x => x).join(' ');

        // Removed default command to open on click. Now it only expands/selects.
        // this.command = {
        //      command: 'firebird.openObject',
        //      title: 'Show Trigger Info',
        //      arguments: ['trigger', triggerName, connection]
        // };
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
