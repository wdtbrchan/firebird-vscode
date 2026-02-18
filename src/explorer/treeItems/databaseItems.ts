
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
    resultLocale?: string;
    name?: string; // friendly name
    groupId?: string; // ID of parent group
    shortcutSlot?: number; // 1-9 for quick access
    color?: string; // Color identifier for the connection
}

export interface ConnectionGroup {
    id: string;
    name: string;
}

export class FolderItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: 'tables' | 'views' | 'triggers' | 'procedures' | 'generators' | 'local-scripts' | 'global-scripts',
        public readonly connection: DatabaseConnection
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = type; // Use the type as context value (tables, local-scripts, etc.)
        
        // Icon selection based on type
        switch (type) {
            case 'tables': this.iconPath = new vscode.ThemeIcon('table'); break;
            case 'views': this.iconPath = new vscode.ThemeIcon('eye'); break;
            case 'triggers': this.iconPath = new vscode.ThemeIcon('zap'); break;
            case 'procedures': this.iconPath = new vscode.ThemeIcon('gear'); break;
            case 'generators': this.iconPath = new vscode.ThemeIcon('list-ordered'); break;
            case 'local-scripts': 
                this.iconPath = new vscode.ThemeIcon('file-code'); 
                break;
            case 'global-scripts': 
                this.iconPath = new vscode.ThemeIcon('globe'); 
                break;
            default: this.iconPath = new vscode.ThemeIcon('folder'); break;
        }
        this.id = `${connection.id}-${type}`;
    }
}

export class ObjectItem extends vscode.TreeItem {
    public readonly objectName: string;
    constructor(
        public readonly label: string,
        public readonly type: 'table' | 'view' | 'trigger' | 'procedure' | 'generator' | 'function',
        public readonly connection: DatabaseConnection,
        objectName?: string,
        public readonly isFavorite: boolean = false,
        public readonly favoriteId?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = this.isFavorite ? `${type}-favorite` : type;
        this.objectName = objectName || label;
        
        let iconId = 'symbol-misc';
        switch (type) {
            case 'table': iconId = 'table'; break;
            case 'view': iconId = 'eye'; break;
            case 'trigger': iconId = 'zap'; break;
            case 'procedure': iconId = 'gear'; break;
            case 'generator': iconId = 'list-ordered'; break;
            case 'function': iconId = 'symbol-function'; break;
        }
        this.iconPath = new vscode.ThemeIcon(iconId);

        // Keep command to open viewing panel on click, EXCEPT for tables, triggers, procedures, generators, and views which use the info/source button
        // (or rather, tables expand on click, and others will too)
        if (type !== 'table' && type !== 'trigger' && type !== 'procedure' && type !== 'generator' && type !== 'view') {
            this.command = {
                command: 'firebird.openObject',
                title: 'Open Object',
                arguments: [type, this.objectName, connection]
            };
        }
    }
}

export class FilterItem extends vscode.TreeItem {
    constructor(
        public readonly connection: DatabaseConnection,
        public readonly type: 'tables' | 'views' | 'triggers' | 'procedures' | 'generators',
        public readonly filterValue: string
    ) {
        super(filterValue ? `🔍 Filter: ${filterValue}` : '🔍 Click to filter...', vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'filter-item';
        this.iconPath = new vscode.ThemeIcon('search');
        
        this.command = {
            command: 'firebird.editFilter',
            title: 'Edit Filter',
            arguments: [connection, type]
        };
    }
}
