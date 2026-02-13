import * as vscode from 'vscode';
import { DatabaseConnection, ConnectionGroup } from '../explorer/treeItems/databaseItems';
import { getConnectionEditorHtml } from './connectionEditorTemplate';

export class ConnectionEditor {
    public static currentPanel: ConnectionEditor | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private loadCallback: () => { groups: ConnectionGroup[], connection?: DatabaseConnection }, private saveCallback: (connection: DatabaseConnection) => Promise<void>, private deleteCallback?: (connection: DatabaseConnection) => Promise<void>) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'save':
                    await this.saveCallback(message.connection);
                    this._panel.dispose();
                    break;
                case 'cancel':
                    this._panel.dispose();
                    break;
                case 'delete':
                    const answer = await vscode.window.showWarningMessage(`Are you sure you want to delete database connection '${message.connection.name}'?`, { modal: true }, 'Yes');
                    if (answer === 'Yes') {
                         if (this.deleteCallback) {
                             await this.deleteCallback(message.connection);
                         }
                         this._panel.dispose();
                    }
                    break;
            }
        }, null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, loadCallback: () => { groups: ConnectionGroup[], connection?: DatabaseConnection }, saveCallback: (connection: DatabaseConnection) => Promise<void>, deleteCallback?: (connection: DatabaseConnection) => Promise<void>) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (ConnectionEditor.currentPanel) {
            ConnectionEditor.currentPanel._panel.reveal(column);
            // Update content for new context (add vs edit)
            ConnectionEditor.currentPanel.loadCallback = loadCallback;
            ConnectionEditor.currentPanel.saveCallback = saveCallback;
            ConnectionEditor.currentPanel.deleteCallback = deleteCallback;
            ConnectionEditor.currentPanel._update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'firebirdConnectionEditor',
            'Firebird Connection',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        ConnectionEditor.currentPanel = new ConnectionEditor(panel, extensionUri, loadCallback, saveCallback, deleteCallback);
    }

    public dispose() {
        ConnectionEditor.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const { groups, connection } = this.loadCallback();
        this._panel.webview.html = this._getHtmlForWebview(groups, connection);
    }

    private _getHtmlForWebview(groups: ConnectionGroup[], connection?: DatabaseConnection) {
        return getConnectionEditorHtml(this._extensionUri, groups, connection);
    }
}
