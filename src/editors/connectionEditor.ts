import * as vscode from 'vscode';
import { DatabaseConnection, ConnectionGroup } from '../explorer/databaseTreeDataProvider';

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
        // Pre-fill values
        const id = connection?.id || Date.now().toString();
        const name = connection?.name || '';
        const groupId = connection?.groupId || '';
        const host = connection?.host || '127.0.0.1';
        const port = connection?.port || 3050;
        const database = connection?.database || '';
        const user = connection?.user || 'SYSDBA';
        const password = connection?.password || ''; // Don't pre-fill password for security? Or do? User expects it.
        const role = connection?.role || '';
        const charset = connection?.charset || 'UTF8';
        const resultLocale = connection?.resultLocale || '';
        const shortcutSlot = connection?.shortcutSlot || 0;

        const slotOptions = [
            { value: 0, label: 'None' },
            { value: 1, label: 'Slot 1 (Ctrl+Alt+1)' },
            { value: 2, label: 'Slot 2 (Ctrl+Alt+2)' },
            { value: 3, label: 'Slot 3 (Ctrl+Alt+3)' },
            { value: 4, label: 'Slot 4 (Ctrl+Alt+4)' },
            { value: 5, label: 'Slot 5 (Ctrl+Alt+5)' },
            { value: 6, label: 'Slot 6 (Ctrl+Alt+6)' },
            { value: 7, label: 'Slot 7 (Ctrl+Alt+7)' },
            { value: 8, label: 'Slot 8 (Ctrl+Alt+8)' },
            { value: 9, label: 'Slot 9 (Ctrl+Alt+9)' }
        ].map(s => `<option value="${s.value}" ${s.value === shortcutSlot ? 'selected' : ''}>${s.label}</option>`).join('');
        const locales = [
            { code: '', label: 'Default (Global Setting)' },
            { code: 'en-US', label: 'English (United States)' },
            { code: 'cs-CZ', label: 'Czech (Czech Republic)' },
            { code: 'de-DE', label: 'German (Germany)' },
            { code: 'fr-FR', label: 'French (France)' },
            { code: 'es-ES', label: 'Spanish (Spain)' },
            { code: 'it-IT', label: 'Italian (Italy)' },
            { code: 'pl-PL', label: 'Polish (Poland)' },
            { code: 'ru-RU', label: 'Russian (Russia)' },
            { code: 'pt-BR', label: 'Portuguese (Brazil)' },
            { code: 'zh-CN', label: 'Chinese (Simplified)' },
            { code: 'ja-JP', label: 'Japanese (Japan)' },
        ];

        const localeOptions = locales.map(l => `<option value="${l.code}" ${l.code === resultLocale ? 'selected' : ''}>${l.label}</option>`).join('');
        const isEdit = !!connection;

        const groupOptions = groups.map(g => `<option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${g.name}</option>`).join('');
        const defaultGroupOption = `<option value="" ${!groupId ? 'selected' : ''}>None (Root)</option>`;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Firebird Connection</title>
            <link href="${this._extensionUri}/node_modules/@vscode/codicons/dist/codicon.css" rel="stylesheet" />
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet" >
            <!-- Fallback for icons if not using codicons directly from node_modules correctly -->
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; font-weight: bold; }
                input, select { width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
                .actions { margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; align-items: center; }
                button { padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
                button:hover { background: var(--vscode-button-hoverBackground); }
                button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                button.save { background: var(--vscode-charts-green); color: white; }
                button.save:hover { opacity: 0.9; }
                button.danger { background: var(--vscode-charts-red); color: white; display: flex; align-items: center; gap: 5px; margin-right: auto; }
                button.danger:hover { opacity: 0.9; }
                .spacer { flex-grow: 1; }
            </style>
        </head>
        <body>
            <h2>${isEdit ? 'Edit Connection' : 'New Connection'}</h2>
            <div class="form-group">
                <label>Name (Alias)</label>
                <input type="text" id="name" value="${name}" placeholder="My Database">
            </div>
            <div class="form-group">
                <label>Folder / Group</label>
                <select id="groupId">
                    ${defaultGroupOption}
                    ${groupOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Host</label>
                <input type="text" id="host" value="${host}">
            </div>
            <div class="form-group">
                <label>Port</label>
                <input type="number" id="port" value="${port}">
            </div>
            <div class="form-group">
                <label>Database Path (.fdb)</label>
                <input type="text" id="database" value="${database.replace(/\\/g, '\\\\')}"> 
            </div>
            <div class="form-group">
                <label>User</label>
                <input type="text" id="user" value="${user}">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="password" value="${password}">
            </div>
            <div class="form-group">
                <label>Role</label>
                <input type="text" id="role" value="${role}">
            </div>
            <div class="form-group">
                <label>Charset</label>
                <input type="text" id="charset" value="${charset}">
            </div>
            <div class="form-group">
                <label>Result Locale (Format)</label>
                <select id="resultLocale">
                    ${localeOptions}
                </select>
                </select>
            </div>
            <div class="form-group">
                <label>Connection Color / Environment</label>
                <select id="color">
                    <option value="" ${!connection?.color ? 'selected' : ''}>None</option>
                    <option value="blue" ${connection?.color === 'blue' ? 'selected' : ''}>🟦 Blue</option>
                    <option value="green" ${connection?.color === 'green' ? 'selected' : ''}>🟩 Green (Development)</option>
                    <option value="orange" ${connection?.color === 'orange' ? 'selected' : ''}>🟧 Orange</option>
                    <option value="purple" ${connection?.color === 'purple' ? 'selected' : ''}>🟪 Purple</option>
                    <option value="red" ${connection?.color === 'red' ? 'selected' : ''}>🟥 Red (Production)</option>
                    <option value="yellow" ${connection?.color === 'yellow' ? 'selected' : ''}>🟨 Yellow</option>
                </select>
            </div>
            <div class="form-group">
                <label>Shortcut Slot</label>
                <select id="shortcutSlot">
                    ${slotOptions}
                </select>
                <small style="display:block; margin-top:4px; opacity:0.8;">Allows quick connection via keyboard shortcuts (Default: Ctrl+Alt+1...9)</small>
            </div>

            <div class="actions">
                ${isEdit ? `
                <button class="danger" onclick="deleteConnection()">
                    <span class="codicon codicon-trash"></span> Delete
                </button>` : ''}
                ${!isEdit ? '<div class="spacer"></div>' : ''} 
                <button class="secondary" onclick="cancel()">Cancel</button>
                <button class="save" onclick="save()">Save</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function save() {
                    const conn = {
                        id: '${id}',
                        name: document.getElementById('name').value,
                        groupId: document.getElementById('groupId').value,
                        host: document.getElementById('host').value,
                        port: parseInt(document.getElementById('port').value),
                        database: document.getElementById('database').value,
                        user: document.getElementById('user').value,
                        password: document.getElementById('password').value,
                        role: document.getElementById('role').value,
                        charset: document.getElementById('charset').value,

                        resultLocale: document.getElementById('resultLocale').value,
                        shortcutSlot: parseInt(document.getElementById('shortcutSlot').value),
                        color: document.getElementById('color').value
                    };
                    vscode.postMessage({ command: 'save', connection: conn });
                }

                function cancel() {
                    vscode.postMessage({ command: 'cancel' });
                }

                function deleteConnection() {
                    const conn = {
                         id: '${id}',
                         name: document.getElementById('name').value
                    };
                    vscode.postMessage({ command: 'delete', connection: conn });
                }
            </script>
        </body>
        </html>`;
    }
}
