import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';

export function registerSettingsCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.backupConnections', async () => {
        await databaseTreeDataProvider.backupConnections();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.restoreConnections', async () => {
        await databaseTreeDataProvider.restoreConnections();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'firebird.');
    }));
}
