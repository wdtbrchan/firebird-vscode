import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { DatabaseConnection } from '../database/types';

export function registerFilterCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.editFilter', async (connection: DatabaseConnection, type: string) => {
        const currentFilter = (databaseTreeDataProvider as any).getFilter(connection.id, type);
        
        const inputBox = vscode.window.createInputBox();
        inputBox.value = currentFilter;
        inputBox.placeholder = `Filter ${type}...`;
        inputBox.title = `Filter ${type}`;
        
        inputBox.onDidChangeValue(value => {
            (databaseTreeDataProvider as any).setFilter(connection.id, type, value);
            databaseTreeDataProvider.refreshItem(connection);
        });

        inputBox.onDidAccept(() => {
            inputBox.hide();
        });

        inputBox.show();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.clearFilter', async (item: any) => {
        if (item && item.command && item.command.arguments && item.command.arguments.length >= 2) {
             const connection = item.command.arguments[0];
             const type = item.command.arguments[1];
             (databaseTreeDataProvider as any).setFilter(connection.id, type, '');
             databaseTreeDataProvider.refreshItem(connection);
        }
    }));
}
