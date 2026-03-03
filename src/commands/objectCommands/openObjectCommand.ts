import * as vscode from 'vscode';
import { DatabaseConnection } from '../../database/types';
import { MetadataService } from '../../services/metadataService';
import { DDLProvider } from '../../services/ddlProvider';

export function registerOpenObjectCommands(
    context: vscode.ExtensionContext,
    ddlProvider: DDLProvider
): void {
    context.subscriptions.push(vscode.commands.registerCommand('firebird.openObject', async (type: string, name: string, connection: DatabaseConnection) => {
        try {
            let ddl = '';
            
            if (type === 'table') {
               vscode.commands.executeCommand('firebird.openTableInfo', name, connection);
               return;
            }

            switch (type) {
                case 'view': ddl = await MetadataService.getViewSource(connection, name); break;
                case 'trigger': ddl = await MetadataService.getTriggerSource(connection, name); break;
                case 'procedure': ddl = await MetadataService.getProcedureSource(connection, name); break;
                case 'generator': ddl = await MetadataService.getGeneratorDDL(connection, name); break;
                case 'index': ddl = await MetadataService.getIndexDDL(connection, name); break;
                default: ddl = `-- Unknown object type: ${type}`;
            }

            const uri = vscode.Uri.parse(`${DDLProvider.scheme}:///${name}.sql`);
            ddlProvider.reportContent(uri, ddl);
            
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: true });
        } catch (err: any) {
             vscode.window.showErrorMessage(`Error opening object ${name}: ${err.message}`);
        }
    }));
}
