import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from './explorer/databaseTreeDataProvider';

export class ConnectionDecorationProvider implements vscode.FileDecorationProvider {
    private _disposables: vscode.Disposable[] = [];
    private _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChange: vscode.Event<vscode.Uri | vscode.Uri[] | undefined> = this._onDidChange.event;

    constructor(private dbProvider: DatabaseTreeDataProvider) {
        // Listen for tree changes to update decorations
        this.dbProvider.onDidChangeTreeData((element) => {
             if (element) {
                 if ('host' in element) { // It is a DatabaseConnection
                     const uri = vscode.Uri.parse(`firebird-connection:/${element.id}`);
                     this._onDidChange.fire(uri);
                 }
             } else {
                 // Full refresh
                 this._onDidChange.fire(undefined);
             }
        });
    }

    provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
        if (uri.scheme === 'firebird-connection') {
             // connection id is likely the path or authority
             const connectionId = uri.path.substring(1); // remove leading slash
             const conn = this.dbProvider.getConnectionById(connectionId);
             
             if (conn && conn.color) {
                 let colorId = '';
                 const colorLower = conn.color.toLowerCase();
                 switch (colorLower) {
                    case 'red': colorId = 'charts.red'; break;
                    case 'orange': colorId = 'charts.orange'; break;
                    case 'yellow': colorId = 'charts.yellow'; break;
                    case 'green': colorId = 'charts.green'; break;
                    case 'blue': colorId = 'charts.blue'; break;
                    case 'purple': colorId = 'charts.purple'; break;
                 }
                 
                 if (colorId) {
                     return {
                         color: new vscode.ThemeColor(colorId),
                         tooltip: `Environment: ${conn.color}`,
                         // badge: '●' 
                     };
                 }
             }
        }
        return undefined;
    }

    dispose() {
        this._disposables.forEach(d => d.dispose());
    }
}
