import * as vscode from 'vscode';
import { TreeRenderingContext } from '../treeRendering';
import { ScriptFolderItem, ScriptItem } from '../treeItems/scriptItems';
import { FolderItem } from '../treeItems/databaseItems';

export function getScriptFolderChildren(element: FolderItem | ScriptFolderItem, ctx: TreeRenderingContext): vscode.TreeItem[] {
    const service = ctx.scriptService;
    const items: vscode.TreeItem[] = [];
    let scriptConnectionId: string | undefined;
    let scriptsToRender: any[] = [];
    
    if (element instanceof FolderItem) {
        if (element.type === 'local-scripts') {
            scriptConnectionId = element.connection.id;
            scriptsToRender = service.getScripts(scriptConnectionId);
        } else if (element.type === 'global-scripts') {
            scriptConnectionId = undefined;
            scriptsToRender = service.getScripts(undefined);
        }
    } else if (element instanceof ScriptFolderItem && element.data.children) {
        scriptConnectionId = element.connectionId;
        scriptsToRender = element.data.children;
    }

    for (const script of scriptsToRender) {
        if (script.type === 'folder') {
            items.push(new ScriptFolderItem(script, scriptConnectionId));
        } else {
            items.push(new ScriptItem(script, scriptConnectionId, ctx.isScriptFavorite(scriptConnectionId, script.id)));
        }
    }
    
    return items;
}
