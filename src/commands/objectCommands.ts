import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { DatabaseConnection, ObjectItem } from '../explorer/treeItems/databaseItems';
import { MetadataService } from '../services/metadataService';
import { DDLProvider } from '../services/ddlProvider';

export function registerObjectCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider,
    ddlProvider: DDLProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openObject', async (type: string, name: string, connection: DatabaseConnection) => {
        try {
            let ddl = '';
            switch (type) {
                case 'table': ddl = await MetadataService.getTableDDL(connection, name); break;
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

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createObject', async (arg?: any, connection?: DatabaseConnection) => {
        let objectType: string | undefined;
        let conn: DatabaseConnection | undefined;

        if (arg) {
            if (arg.connection && arg.type) {
                conn = arg.connection;
                switch (arg.type) {
                    case 'tables': objectType = 'table'; break;
                    case 'views': objectType = 'view'; break;
                    case 'triggers': objectType = 'trigger'; break;
                    case 'procedures': objectType = 'procedure'; break;
                    case 'generators': objectType = 'generator'; break;
                    default: objectType = arg.type;
                }
            } else if (typeof arg === 'string') {
                objectType = arg;
                conn = connection;
            }
        }

        if (!objectType || !conn) {
             vscode.window.showErrorMessage('Create Object: Missing type or connection.');
             return;
        }

        let script = '';
        switch (objectType) {
            case 'table':
                script = `CREATE TABLE NEW_TABLE (\n    ID INTEGER NOT NULL,\n    NAME VARCHAR(50),\n    CONSTRAINT PK_NEW_TABLE PRIMARY KEY (ID)\n);`;
                break;
            case 'view':
                script = `CREATE VIEW NEW_VIEW AS\nSELECT * FROM SOME_TABLE;`;
                break;
            case 'trigger':
                script = `SET TERM ^ ;\nCREATE TRIGGER NEW_TRIGGER FOR SOME_TABLE\nACTIVE BEFORE INSERT POSITION 0\nAS\nBEGIN\n    /* Trigger body */\nEND^\nSET TERM ; ^`;
                break;
            case 'procedure':
                script = `SET TERM ^ ;\nCREATE PROCEDURE NEW_PROCEDURE (\n    INPUT_PARAM INTEGER\n)\nRETURNS (\n    OUTPUT_PARAM INTEGER\n)\nAS\nBEGIN\n    OUTPUT_PARAM = INPUT_PARAM * 2;\n    SUSPEND;\nEND^\nSET TERM ; ^`;
                break;
            case 'generator':
                script = `CREATE SEQUENCE NEW_SEQUENCE;`;
                break;
            default:
                script = `-- Create script for ${objectType}`;
        }

        try {
            const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: script });
            await vscode.window.showTextDocument(doc);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error creating object script: ${err.message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.deleteObject', async (objectItem: ObjectItem) => {
        if (objectItem) {
             vscode.commands.executeCommand('firebird.generateScript', 'drop', objectItem);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.generateScript', async (mode: 'create' | 'alter' | 'drop' | 'recreate', objectItem: ObjectItem) => {
        try {
            const { type, objectName: name, connection } = objectItem;
            let script = '';

            const wrapSetTerm = (sql: string) => `SET TERM ^ ;\n${sql} ^\nSET TERM ; ^`;

            if (mode === 'drop') {
                switch (type) {
                    case 'table': script = `DROP TABLE ${name};`; break;
                    case 'view': script = `DROP VIEW ${name};`; break;
                    case 'trigger': script = `DROP TRIGGER ${name};`; break;
                    case 'procedure': script = `DROP PROCEDURE ${name};`; break;
                    case 'generator': script = `DROP SEQUENCE ${name};`; break; 
                }
            } else if (mode === 'recreate') {
                if (type === 'view') {
                    const src = await MetadataService.getViewSource(connection, name);
                    if (src.startsWith('CREATE VIEW')) {
                        const inner = src.replace('CREATE VIEW', 'RECREATE VIEW');
                        script = wrapSetTerm(inner);
                    } else {
                        script = wrapSetTerm(`RECREATE VIEW ${name} AS\n` + src); 
                    }
                } else {
                     script = `-- Recreate is only implemented for Views currently.`;
                }
            } else if (mode === 'create') {
                switch (type) {
                    case 'table': script = await MetadataService.getTableDDL(connection, name); break;
                    case 'view': {
                        let src = await MetadataService.getViewSource(connection, name);
                        if (src.startsWith('CREATE VIEW')) {
                             src = src.replace('CREATE VIEW', 'CREATE OR ALTER VIEW');
                        }
                        script = wrapSetTerm(src);
                        break;
                    }
                    case 'trigger': script = wrapSetTerm(await MetadataService.getTriggerSource(connection, name)); break;
                    case 'procedure': script = wrapSetTerm(await MetadataService.getProcedureSource(connection, name)); break;
                    case 'generator': script = await MetadataService.getGeneratorDDL(connection, name); break;
                }
            } else {
                // ALTER mode
                switch (type) {
                    case 'table':
                        script = `ALTER TABLE ${name} ADD column_name datatype; -- Template\n-- ALTER TABLE ${name} DROP column_name;\n-- ALTER TABLE ${name} ALTER COLUMN column_name TYPE new_type;`;
                        break;
                    case 'view':
                        let vSrc = await MetadataService.getViewSource(connection, name);
                        if (vSrc.startsWith('CREATE VIEW')) {
                             vSrc = vSrc.replace('CREATE VIEW', 'CREATE OR ALTER VIEW');
                        } else {
                             vSrc = `CREATE OR ALTER VIEW ${name} AS ${vSrc}`;
                        }
                        script = wrapSetTerm(vSrc);
                        break;
                    case 'trigger':
                    case 'procedure':
                        let src = '';
                        if (type === 'trigger') src = await MetadataService.getTriggerSource(connection, name);
                        else src = await MetadataService.getProcedureSource(connection, name);
                        
                        if (src.startsWith(`CREATE ${type.toUpperCase()}`)) {
                           src = src.replace(`CREATE ${type.toUpperCase()}`, `CREATE OR ALTER ${type.toUpperCase()}`);
                        }
                        script = wrapSetTerm(src);
                        break;
                    case 'generator':
                        const curVal = await MetadataService.getGeneratorValue(connection, name);
                        const valNum = parseInt(curVal, 10);
                        const nextVal = isNaN(valNum) ? 0 : valNum;
                        script = `ALTER SEQUENCE ${name} RESTART WITH ${nextVal}; -- Set to desired value`;
                        break;
                }
            }

            const doc = await vscode.workspace.openTextDocument({
                content: script,
                language: 'sql'
            });
            await vscode.window.showTextDocument(doc);

        } catch (err: any) {
            vscode.window.showErrorMessage(`Error generating script: ${err.message}`);
        }
    }));
}
