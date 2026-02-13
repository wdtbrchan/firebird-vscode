import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';

export function registerGroupCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createGroup', async () => {
        await databaseTreeDataProvider.createGroup();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.renameGroup', async (group: any) => {
        await databaseTreeDataProvider.renameGroup(group);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteGroup', async (group: any) => {
        await databaseTreeDataProvider.deleteGroup(group);
    }));
}
