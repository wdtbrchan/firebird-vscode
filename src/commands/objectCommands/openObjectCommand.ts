import * as vscode from 'vscode';
import { DatabaseConnection } from '../../database/types';
import { MetadataService } from '../../services/metadataService';
import { DDLProvider } from '../../services/ddlProvider';
import { ObjectItem } from '../../explorer/treeItems/databaseItems';

async function fetchDDL(type: string, name: string, connection: DatabaseConnection): Promise<string> {
    switch (type) {
        case 'view': return MetadataService.getViewSource(connection, name);
        case 'trigger': return MetadataService.getTriggerSource(connection, name);
        case 'procedure': return MetadataService.getProcedureSource(connection, name);
        case 'generator': return MetadataService.getGeneratorDDL(connection, name);
        case 'index': return MetadataService.getIndexDDL(connection, name);
        default: return `-- Unknown object type: ${type}`;
    }
}

const wrapSetTerm = (sql: string) => `SET TERM ^ ;\n${sql} ^\nSET TERM ; ^`;

async function fetchAlterDDL(type: string, name: string, connection: DatabaseConnection): Promise<string> {
    switch (type) {
        case 'view': {
            let src = await MetadataService.getViewSource(connection, name);
            if (src.startsWith('CREATE VIEW')) {
                src = src.replace('CREATE VIEW', 'CREATE OR ALTER VIEW');
            } else {
                src = `CREATE OR ALTER VIEW ${name} AS ${src}`;
            }
            return wrapSetTerm(src);
        }
        case 'trigger': {
            let src = await MetadataService.getTriggerSource(connection, name);
            if (src.startsWith('CREATE TRIGGER')) {
                src = src.replace('CREATE TRIGGER', 'CREATE OR ALTER TRIGGER');
            }
            return wrapSetTerm(src);
        }
        case 'procedure': {
            let src = await MetadataService.getProcedureSource(connection, name);
            if (src.startsWith('CREATE PROCEDURE')) {
                src = src.replace('CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');
            }
            let script = wrapSetTerm(src);
            const perms = await MetadataService.getObjectPermissions(connection, name, 5);
            const permsSql = MetadataService.formatPermissions(perms, name, 'PROCEDURE');
            if (permsSql) { script += `\n\n${permsSql}`; }
            return script;
        }
        default: return fetchDDL(type, name, connection);
    }
}

export function registerOpenObjectCommands(
    context: vscode.ExtensionContext,
    ddlProvider: DDLProvider
): void {
    context.subscriptions.push(vscode.commands.registerCommand('firebird.openObject', async (type: string, name: string, connection: DatabaseConnection) => {
        try {
            if (type === 'table') {
               vscode.commands.executeCommand('firebird.openTableInfo', name, connection);
               return;
            }

            const ddl = await fetchDDL(type, name, connection);
            const uri = vscode.Uri.parse(`${DDLProvider.scheme}:///${name}.sql`);
            ddlProvider.reportContent(uri, ddl);

            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: true });
        } catch (err) {
             vscode.window.showErrorMessage(`Error opening object ${name}: ${(err as Error).message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.copyDDL', async (objectItem: ObjectItem) => {
        if (!objectItem) { return; }
        const { type, objectName: name, connection } = objectItem;
        try {
            const ddl = await fetchAlterDDL(type, name, connection);
            await vscode.env.clipboard.writeText(ddl);
            vscode.window.showInformationMessage(`DDL for ${name} copied to clipboard.`);
        } catch (err) {
            vscode.window.showErrorMessage(`Error copying DDL for ${name}: ${(err as Error).message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.compareWithActiveFile', async (objectItem: ObjectItem) => {
        if (!objectItem) { return; }
        const { type, objectName: name, connection } = objectItem;
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active file open to compare with.');
            return;
        }
        try {
            const ddl = await fetchAlterDDL(type, name, connection);
            const ddlUri = vscode.Uri.parse(`${DDLProvider.scheme}:///diff-${name}.sql`);
            ddlProvider.reportContent(ddlUri, ddl);
            const activeFileName = activeEditor.document.fileName.replace(/.*[\\/]/, '');
            await vscode.commands.executeCommand('vscode.diff', ddlUri, activeEditor.document.uri, `${name} (DB) ↔ ${activeFileName}`);
        } catch (err) {
            vscode.window.showErrorMessage(`Error comparing with ${name}: ${(err as Error).message}`);
        }
    }));
}
