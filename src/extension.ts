import * as vscode from 'vscode';
import { Database } from './database';
import { ResultsPanel } from './resultsPanel';
import { DatabaseTreeDataProvider } from './explorer/databaseTreeDataProvider';
import { DatabaseDragAndDropController } from './explorer/databaseDragAndDropController';
import { DDLProvider } from './services/ddlProvider';
import { ConnectionDecorationProvider } from './connectionDecorationProvider';
import { ActiveConnectionCodeLensProvider } from './providers/activeConnectionCodeLensProvider';
import { registerContextKeys } from './contextKeys';
import { createStatusBar } from './statusBar';
import { registerAllCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {

    // --- Context Key Management ---
    registerContextKeys(context);

    try {
        // --- Tree Data Provider ---
        const databaseTreeDataProvider = new DatabaseTreeDataProvider(context);
        vscode.window.registerTreeDataProvider('firebird.databases', databaseTreeDataProvider);
        
        // --- Decoration Provider ---
        const decorationProvider = new ConnectionDecorationProvider(databaseTreeDataProvider);
        context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));

        // --- Drag & Drop ---
        const dragAndDropController = new DatabaseDragAndDropController(databaseTreeDataProvider);
        const treeView = vscode.window.createTreeView('firebird.databases', {
            treeDataProvider: databaseTreeDataProvider,
            dragAndDropController: dragAndDropController
        });
        databaseTreeDataProvider.setTreeView(treeView);

        // --- CodeLens Provider ---
        const activeConnectionCodeLensProvider = new ActiveConnectionCodeLensProvider(databaseTreeDataProvider);
        context.subscriptions.push(activeConnectionCodeLensProvider);
        
        const config = vscode.workspace.getConfiguration('firebird');
        const allowedLanguages = config.get<string[]>('allowedLanguages', ['sql']);
        const selector: vscode.DocumentFilter[] = allowedLanguages.map(lang => ({ language: lang }));
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, activeConnectionCodeLensProvider));

        // --- Transaction State Listener ---
        const statusBarController = createStatusBar(context, databaseTreeDataProvider);

        Database.onTransactionChange((hasTransaction, autoRollbackAt, lastAction) => {
            vscode.commands.executeCommand('setContext', 'firebird.hasActiveTransaction', hasTransaction);
            ResultsPanel.currentPanel?.setTransactionStatus(hasTransaction, autoRollbackAt, lastAction);
            
            if (hasTransaction && autoRollbackAt) {
                statusBarController.activeAutoRollbackAt = autoRollbackAt;
                statusBarController.startStatusBarTimer();
            } else {
                statusBarController.activeAutoRollbackAt = undefined;
                statusBarController.updateStatusBar();
            }
        });

        // --- DDL Provider ---
        const ddlProvider = new DDLProvider();
        context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DDLProvider.scheme, ddlProvider));

        // --- Register All Commands ---
        registerAllCommands(context, databaseTreeDataProvider, ddlProvider);

    } catch (e: any) {
        console.error('Firebird extension activation failed:', e);
        vscode.window.showErrorMessage('Firebird extension activation failed: ' + e.message);
    }
}

export function deactivate() {
    Database.detach();
}
