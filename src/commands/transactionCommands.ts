import * as vscode from 'vscode';
import { Database } from '../database';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';

export function registerTransactionCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.commit', async () => {
        try {
            await Database.commit();
            
            const activeConn = databaseTreeDataProvider.connectionManager.getActiveConnection();
            if (activeConn) {
                databaseTreeDataProvider.refreshItem(activeConn);
            }

            vscode.window.setStatusBarMessage('Firebird: Transaction Committed', 3000);
        } catch (err: any) {
            vscode.window.showErrorMessage('Commit failed: ' + err.message);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.rollback', async () => {
        try {
            await Database.rollback();
            vscode.window.setStatusBarMessage('Firebird: Transaction Rolled Back', 3000);
        } catch (err: any) {
             vscode.window.showErrorMessage('Rollback failed: ' + err.message);
        }
    }));
}
