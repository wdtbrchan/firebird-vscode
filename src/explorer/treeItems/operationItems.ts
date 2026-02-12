
import * as vscode from 'vscode';
import { ObjectItem, DatabaseConnection } from './databaseItems';

export class OperationItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly type: 'create' | 'alter' | 'recreate' | 'drop' | 'info',
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
        } else if (type === 'drop') {
            this.iconPath = new vscode.ThemeIcon('trash');
            this.contextValue = 'script-drop';
            this.command = {
                command: 'firebird.generateScript',
                title: 'Drop Script',
                arguments: ['drop', parentObject]
            };
        } else {
            // Info item (e.g. Current Value)
            this.iconPath = new vscode.ThemeIcon('info');
            this.contextValue = 'info-item';
        }
    }
}
