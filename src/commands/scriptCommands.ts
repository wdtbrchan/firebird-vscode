import * as vscode from 'vscode';
import * as path from 'path';
import { ScriptService, ScriptItemData } from '../services/scriptService';

export function registerScriptCommands(
    context: vscode.ExtensionContext
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createScript', async (arg?: any, parentId?: string) => {
        let connectionId: string | undefined = undefined;
        let pId: string | undefined = parentId;

        if (arg) {
            if (arg.contextValue === 'local-scripts') {
                connectionId = arg.connection?.id;
                pId = undefined;
            } else if (arg.contextValue === 'global-scripts') {
                connectionId = undefined;
                pId = undefined;
            } else if (arg.contextValue === 'script-folder') {
                connectionId = arg.connectionId;
                if (arg.data) {
                    pId = arg.data.id;
                }
            } else if (typeof arg === 'string') {
                 connectionId = arg;
            }
        }

        const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: '' });
        await vscode.window.showTextDocument(doc);
        
        const removeListeners = () => {
            saveListener.dispose();
            closeListener.dispose();
        };

        const saveListener = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
             if (savedDoc === doc) {
                 const service = ScriptService.getInstance();
                 service.addScript(path.basename(savedDoc.fileName), savedDoc.fileName, connectionId, pId);
                 removeListeners();
             }
        });
        
        const closeListener = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
            if (closedDoc === doc) {
                removeListeners();
            }
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createScriptFolder', async (arg?: any, parentId?: string) => {
        let connectionId: string | undefined = undefined;
        let pId: string | undefined = parentId;

        if (arg) {
             if (arg.contextValue === 'local-scripts') {
                connectionId = arg.connection?.id;
                pId = undefined;
            } else if (arg.contextValue === 'global-scripts') {
                connectionId = undefined;
                pId = undefined;
            } else if (arg.contextValue === 'script-folder') {
                connectionId = arg.connectionId;
                if (arg.data) {
                    pId = arg.data.id;
                }
            } else if (typeof arg === 'string') {
                 connectionId = arg;
            }
        }

        const name = await vscode.window.showInputBox({ prompt: 'Enter folder name', value: 'New Folder' });
        if (!name) return;
        
        const service = ScriptService.getInstance();
        service.addFolder(name, connectionId, pId);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.addScript', async (arg?: any, parentId?: string) => {
        let connectionId: string | undefined = undefined;
        let pId: string | undefined = parentId;

        if (arg) {
             if (arg.contextValue === 'local-scripts') {
                connectionId = arg.connection?.id;
                pId = undefined;
            } else if (arg.contextValue === 'global-scripts') {
                connectionId = undefined;
                pId = undefined;
            } else if (arg.contextValue === 'script-folder') {
                connectionId = arg.connectionId;
                if (arg.data) {
                    pId = arg.data.id;
                }
            } else if (typeof arg === 'string') {
                 connectionId = arg;
            }
        }

        const uris = await vscode.window.showOpenDialog({ canSelectMany: true, filters: {'SQL': ['sql'], 'All': ['*']} });
        if (uris && uris.length > 0) {
            const service = ScriptService.getInstance();
            for (const uri of uris) {
                service.addScript(path.basename(uri.fsPath), uri.fsPath, connectionId, pId);
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.renameScriptFolder', async (arg?: any) => {
        if (!arg) return;
        
        let itemId: string | undefined;
        let currentName: string = '';
        
        if (arg.contextValue === 'script-folder') {
             itemId = arg.data.id;
             currentName = arg.data.name;
        } else if (arg.data && arg.data.id) {
             itemId = arg.data.id;
             currentName = arg.data.name;
        }

        if (!itemId) return;

        const name = await vscode.window.showInputBox({ 
            prompt: 'Enter new name', 
            value: currentName 
        });
        
        if (name && name !== currentName) {
            const service = ScriptService.getInstance();
            service.renameItem(itemId, name);
        }
    }));

     context.subscriptions.push(vscode.commands.registerCommand('firebird.openScript', async (script: ScriptItemData) => {
        if (script.pending) {
             const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: '' });
             await vscode.window.showTextDocument(doc);
             const service = ScriptService.getInstance();
             
             const removeListeners = () => {
                saveListener.dispose();
                closeListener.dispose();
             };

             const saveListener = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
                 if (savedDoc === doc) {
                     service.resolvePendingScript(script.id, savedDoc.fileName);
                     removeListeners();
                 }
            });

            const closeListener = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
                if (closedDoc === doc) {
                    removeListeners();
                }
            });
        } else if (script.fsPath) {
             const doc = await vscode.workspace.openTextDocument(script.fsPath);
             await vscode.window.showTextDocument(doc);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteScript', async (item: any) => { 
        const service = ScriptService.getInstance();
        if (item && item.data) {
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove '${item.label}' from the list?`, { modal: true }, 'Remove');
             if (confirm === 'Remove') {
                 service.removeItem(item.data.id);
             }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openFavoriteScript', async (data: any) => {
        if (data && data.scriptId) {
             const service = ScriptService.getInstance();
             const scriptItem = service.getScriptById(data.scriptId);
             
             if (scriptItem) {
                 vscode.commands.executeCommand('firebird.openScript', scriptItem);
             } else {
                 vscode.window.showErrorMessage('Referenced script not found.');
             }
        }
    }));
}
