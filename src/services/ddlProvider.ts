import * as vscode from 'vscode';

export class DDLProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'firebird-ddl';

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    private _documents = new Map<string, string>();

    public provideTextDocumentContent(uri: vscode.Uri): string {
        return this._documents.get(uri.toString()) || '-- No content available';
    }

    public reportContent(uri: vscode.Uri, content: string) {
        this._documents.set(uri.toString(), content);
        this._onDidChange.fire(uri);
    }
}
