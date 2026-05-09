import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { DatabaseConnection } from '../database/types';

export function registerFilterCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.editFilter', async (connection: DatabaseConnection, type: string) => {
        const currentFilter = databaseTreeDataProvider.filterManager.getFilter(connection.id, type);
        
        const inputBox = vscode.window.createInputBox();
        inputBox.value = currentFilter;
        inputBox.placeholder = `Filter ${type}...`;
        inputBox.title = `Filter ${type}`;
        
        inputBox.onDidChangeValue(value => {
            databaseTreeDataProvider.filterManager.setFilter(connection.id, type, value);
            databaseTreeDataProvider.refreshItem(connection);
        });

        inputBox.onDidAccept(() => {
            inputBox.hide();
        });

        inputBox.show();
    }));

    interface ClearFilterItem {
        command?: { arguments?: [DatabaseConnection, string] };
    }
    context.subscriptions.push(vscode.commands.registerCommand('firebird.clearFilter', async (item: ClearFilterItem) => {
        if (item?.command?.arguments && item.command.arguments.length >= 2) {
             const [connection, type] = item.command.arguments;
             databaseTreeDataProvider.filterManager.setFilter(connection.id, type, '');
             databaseTreeDataProvider.refreshItem(connection);
        }
    }));
}
