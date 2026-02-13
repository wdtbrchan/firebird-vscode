import * as vscode from 'vscode';

/**
 * Registers context key management for query execution.
 * Sets `firebird:queryExecutionEnabled` based on active editor language.
 */
export function registerContextKeys(context: vscode.ExtensionContext): void {
    // Initialize context
    vscode.commands.executeCommand('setContext', 'firebird.hasActiveTransaction', false);

    const updateExecutionContext = () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.commands.executeCommand('setContext', 'firebird:queryExecutionEnabled', false);
            return;
        }
        const config = vscode.workspace.getConfiguration('firebird');
        const allowedLanguages = config.get<string[]>('allowedLanguages', ['sql']);
        const isAllowed = allowedLanguages.includes(editor.document.languageId);
        vscode.commands.executeCommand('setContext', 'firebird:queryExecutionEnabled', isAllowed);
    };

    // Initial check
    updateExecutionContext();

    // Listeners
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateExecutionContext),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('firebird.allowedLanguages')) {
                updateExecutionContext();
            }
        })
    );
}
