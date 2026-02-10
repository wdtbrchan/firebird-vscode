
import * as vscode from 'vscode';

export class PaddingItem extends vscode.TreeItem {
    constructor() {
        super('', vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'padding-item';
        this.iconPath = undefined;
        this.description = '';
        this.tooltip = '';
    }
}
