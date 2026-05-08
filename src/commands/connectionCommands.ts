import * as vscode from 'vscode';
import { Database } from '../database';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { DatabaseConnection } from '../database/types';
import { parseSlotArg } from './slotArg';

export function registerConnectionCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.selectDatabase', async (conn: DatabaseConnection) => {
        const editor = vscode.window.activeTextEditor;
        const id = editor ? editor.document.uri.toString() : 'global';
        await Database.rollback(id);
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

    // Single slot command — keybindings supply { slot: 1..9 } via args.
    context.subscriptions.push(vscode.commands.registerCommand('firebird.connectSlot', async (arg?: unknown) => {
        const slot = parseSlotArg(arg);
        if (slot === null) {
            vscode.window.showWarningMessage('firebird.connectSlot requires a slot argument (1..9).');
            return;
        }
        const conn = databaseTreeDataProvider.connectionManager.getConnectionBySlot(slot);
        if (conn) {
            const editor = vscode.window.activeTextEditor;
            const id = editor ? editor.document.uri.toString() : 'global';
            await Database.rollback(id);
            databaseTreeDataProvider.connectionManager.setActive(conn);
            vscode.window.showInformationMessage(`Switched to connection: ${conn.name || conn.database}`);
        } else {
            vscode.window.showInformationMessage(`No connection assigned to Slot ${slot}. Edit a connection to assign it.`);
        }
    }));
}
