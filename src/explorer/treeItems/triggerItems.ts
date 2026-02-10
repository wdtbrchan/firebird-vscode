
import * as vscode from 'vscode';
import { DatabaseConnection } from './databaseItems';

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
        this.iconPath = new vscode.ThemeIcon('zap');
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
