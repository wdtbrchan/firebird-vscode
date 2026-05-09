import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { ConnectionGroup } from '../explorer/treeItems/databaseItems';

export function registerGroupCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createGroup', async () => {
        await databaseTreeDataProvider.groupManager.createGroup();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.renameGroup', async (group: ConnectionGroup) => {
        await databaseTreeDataProvider.groupManager.renameGroup(group);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteGroup', async (group: ConnectionGroup) => {
        await databaseTreeDataProvider.groupManager.deleteGroup(group);
    }));
}
