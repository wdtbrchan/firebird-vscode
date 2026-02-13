import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from './explorer/databaseTreeDataProvider';

export interface StatusBarController {
    updateStatusBar: () => void;
    startStatusBarTimer: () => void;
    activeAutoRollbackAt: number | undefined;
}

/**
 * Creates the status bar item and returns a controller for updating it.
 */
export function createStatusBar(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider
): StatusBarController {
    const myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    myStatusBarItem.command = 'firebird.databases.focus';
    context.subscriptions.push(myStatusBarItem);

    const controller: StatusBarController = {
        activeAutoRollbackAt: undefined,

        updateStatusBar: () => {
            const details = databaseTreeDataProvider.getActiveConnectionDetails();
            let text = '';

            if (details) {
                text = `$(database) ${details.group} / ${details.name}`;
            }

            if (controller.activeAutoRollbackAt) {
                const now = Date.now();
                const remaining = Math.ceil((controller.activeAutoRollbackAt - now) / 1000);
                if (remaining > 0) {
                    text += ` $(watch) ${remaining}s`;
                } else {
                    controller.activeAutoRollbackAt = undefined;
                }
            }

            if (text) {
                myStatusBarItem.text = text;
                myStatusBarItem.show();
            } else {
                myStatusBarItem.hide();
            }
        },

        startStatusBarTimer: () => {
            if (statusBarTimer) clearInterval(statusBarTimer);
            statusBarTimer = setInterval(() => {
                if (controller.activeAutoRollbackAt) {
                    controller.updateStatusBar();
                } else {
                    if (statusBarTimer) {
                        clearInterval(statusBarTimer);
                        statusBarTimer = undefined;
                        controller.updateStatusBar();
                    }
                }
            }, 1000);
        }
    };

    let statusBarTimer: NodeJS.Timeout | undefined;

    // Listen for tree changes
    databaseTreeDataProvider.onDidChangeTreeData(() => {
        controller.updateStatusBar();
    });
    controller.updateStatusBar();

    return controller;
}
