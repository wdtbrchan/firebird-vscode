import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { ScriptItem } from '../explorer/treeItems/scriptItems';
import { IndexItem } from '../explorer/treeItems/indexItems';

export function registerFavoritesCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.addToFavorites', async (node: any) => {
        if (node instanceof ScriptItem) {
            let connectionId = node.connectionId;
            if (!connectionId) {
                const active = databaseTreeDataProvider.getActiveConnection();
                if (active) {
                    connectionId = active.id;
                } else {
                     vscode.window.showWarningMessage('Please activate a database connection to add global scripts to favorities.');
                     return;
                }
            }
            await databaseTreeDataProvider.addFavoriteScript(connectionId!, node.data.id, node.data.name);
        } else if (node instanceof IndexItem) {
            await databaseTreeDataProvider.addFavorite(node.connection, node.indexName, 'index' as any);
        } else if (node && node.connection && node.objectName && node.type) {
             await databaseTreeDataProvider.addFavorite(node.connection, node.objectName, node.type);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.removeFromFavorites', async (node: any) => {
         if (node && node.contextValue === 'favorite-folder') {
             vscode.commands.executeCommand('firebird.deleteFavoriteFolder', node);
             return;
         }

         if (node && node.data && node.contextValue && (node.contextValue.endsWith('-favorite') || node.contextValue === 'script-favorite' || node.contextValue === 'script-file-favorite')) {
             const label = node.label || node.data.label;
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove '${label}' from favorites?`, { modal: true }, 'Remove');
             if (confirm === 'Remove') {
                 await databaseTreeDataProvider.removeFavoriteItem(node.data);
             }
             return;
         }

         if (node && node.connection && node.objectName && node.type) {
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove '${node.objectName}' from favorites?`, { modal: true }, 'Remove');
             if (confirm === 'Remove') {
                 await databaseTreeDataProvider.removeFavoriteObject(node.connection, node.objectName, node.type);
             }
             return;
         }

         if (node instanceof ScriptItem && node.isFavorite) {
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove script '${node.data.name}' from favorites?`, { modal: true }, 'Remove');
             if (confirm === 'Remove') {
                 await databaseTreeDataProvider.removeScriptFavorite(node.data.id);
             }
             return;
         }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createFavoriteFolder', async (node: any) => {
        if (node && node.contextValue === 'favorites-root') {
             await databaseTreeDataProvider.createFavoriteFolder(node.connection);
        } else if (node && node.contextValue === 'favorite-folder') {
             await databaseTreeDataProvider.createFavoriteFolder(node.connection, node.data);
        } else {
             const conn = databaseTreeDataProvider.getActiveConnection();
             if (conn) {
                 await databaseTreeDataProvider.createFavoriteFolder(conn);
             }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteFavoriteFolder', async (node: any) => {
         if (node && node.data) {
             const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete folder '${node.label}'?`, { modal: true }, 'Delete');
             if (confirm === 'Delete') {
                 await databaseTreeDataProvider.deleteFavoriteFolder(node.data);
             }
         }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.renameFavoriteFolder', async (node: any) => {
         if (node && node.data) {
             await databaseTreeDataProvider.renameFavoriteFolder(node.data);
         }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.favorites.clear', async (node: any) => {
        let connectionId: string | undefined;

        if (node && node.connection) {
            connectionId = node.connection.id;
        } else {
            const active = databaseTreeDataProvider.getActiveConnection();
            if (active) {
                connectionId = active.id;
            }
        }

        if (connectionId) {
            const confirm = await vscode.window.showWarningMessage('Are you sure you want to clear all favorites for this connection?', { modal: true }, 'Clear All');
            if (confirm === 'Clear All') {
                await databaseTreeDataProvider.clearFavorites(connectionId);
            }
        } else {
            vscode.window.showWarningMessage('No connection selected to clear favorites.');
        }
    }));
}
