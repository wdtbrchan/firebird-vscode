import * as vscode from 'vscode';
import { Database } from '../database';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { DatabaseConnection } from '../explorer/treeItems/databaseItems';

export function registerConnectionCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.selectDatabase', async (conn: DatabaseConnection) => {
        await Database.rollback();
        databaseTreeDataProvider.connectionManager.setActive(conn);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.addDatabase', async () => {
        await databaseTreeDataProvider.connectionManager.addDatabase();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.removeDatabase', (conn: DatabaseConnection) => {
        databaseTreeDataProvider.connectionManager.removeDatabase(conn);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.disconnectDatabase', (conn: DatabaseConnection) => {
        databaseTreeDataProvider.connectionManager.disconnect(conn);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.editDatabase', async (conn: DatabaseConnection) => {
        await databaseTreeDataProvider.connectionManager.editDatabase(conn, () => databaseTreeDataProvider.refresh());
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.refreshDatabase', (conn: DatabaseConnection) => {
        databaseTreeDataProvider.refreshItem(conn);
    }));

    // Slot commands 1-9
    for (let i = 1; i <= 9; i++) {
        context.subscriptions.push(vscode.commands.registerCommand(`firebird.connectSlot${i}`, async () => {
            const conn = databaseTreeDataProvider.connectionManager.getConnectionBySlot(i);
            if (conn) {
                await Database.rollback();
                databaseTreeDataProvider.connectionManager.setActive(conn);
                vscode.window.showInformationMessage(`Switched to connection: ${conn.name || conn.database}`);
            } else {
                vscode.window.showInformationMessage(`No connection assigned to Slot ${i}. Edit a connection to assign it.`);
            }
        }));
    }
}
