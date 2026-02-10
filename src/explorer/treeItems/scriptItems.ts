
import * as vscode from 'vscode';
import { ScriptItemData } from '../../services/scriptService';

export class ScriptItem extends vscode.TreeItem {
    constructor(
        public readonly data: ScriptItemData,
        public readonly connectionId?: string,
        public readonly isFavorite: boolean = false
    ) {
        super(data.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = isFavorite ? 'script-file-favorite' : 'script-file';
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.id = data.id;
        
        if (data.pending) {
             this.label = data.name; 
             this.description = "(unsaved)";
             this.iconPath = new vscode.ThemeIcon('edit'); 
        }
        
        this.command = {
            command: 'firebird.openScript',
            title: 'Open Script',
            arguments: [data]
        };
    }
}

export class ScriptFolderItem extends vscode.TreeItem {
    constructor(
        public readonly data: ScriptItemData,
        public readonly connectionId?: string
    ) {
        super(data.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'script-folder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.id = data.id;
    }
}
