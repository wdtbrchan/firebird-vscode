import * as vscode from 'vscode';
import { Database } from '../database';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { FirebirdLog } from '../logger';

export function registerTransactionCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.commit', async (id?: string) => {
        try {
            const editor = vscode.window.activeTextEditor;
            const resolvedId = id || (editor ? editor.document.uri.toString() : 'global');
            FirebirdLog.info(`[FB] Commit requested | id=${resolvedId}`, true);
            await Database.commit(resolvedId);
            FirebirdLog.info(`[FB] Commit completed | id=${resolvedId}`);
            
            const activeConn = databaseTreeDataProvider.connectionManager.getActiveConnection();
            if (activeConn) {
                databaseTreeDataProvider.refreshItem(activeConn);
            }

            vscode.window.setStatusBarMessage('Firebird: Transaction Committed', 3000);
        } catch (err) {
            FirebirdLog.error(`[FB] Commit failed | message=${(err as Error).message}`, err, true);
            vscode.window.showErrorMessage('Commit failed: ' + (err as Error).message);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.rollback', async (id?: string) => {
        try {
            const editor = vscode.window.activeTextEditor;
            const resolvedId = id || (editor ? editor.document.uri.toString() : 'global');
            FirebirdLog.info(`[FB] Rollback requested | id=${resolvedId}`, true);
            await Database.rollback(resolvedId);
            FirebirdLog.info(`[FB] Rollback completed | id=${resolvedId}`);
            vscode.window.setStatusBarMessage('Firebird: Transaction Rolled Back', 3000);
        } catch (err) {
             FirebirdLog.error(`[FB] Rollback failed | message=${(err as Error).message}`, err, true);
             vscode.window.showErrorMessage('Rollback failed: ' + (err as Error).message);
        }
    }));
}
