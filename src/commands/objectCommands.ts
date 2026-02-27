import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { ObjectItem } from '../explorer/treeItems/databaseItems';
import { DatabaseConnection } from '../database/types';
import { TableTriggersItem } from '../explorer/treeItems/triggerItems';
import { TableIndexesItem } from '../explorer/treeItems/indexItems';
import { MetadataService } from '../services/metadataService';
import { DDLProvider } from '../services/ddlProvider';
import { TableInfoPanel } from '../editors/tableInfoPanel';
import { SourceCodePanel } from '../editors/sourceCodePanel';
import { IndexInfoPanel } from '../editors/indexInfoPanel';
import { GeneratorInfoPanel } from '../editors/generatorInfoPanel';

export function registerObjectCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider,
    ddlProvider: DDLProvider
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openObject', async (type: string, name: string, connection: DatabaseConnection) => {
        try {
            let ddl = '';
            
            // Note: Tables now use firebird.openTableInfo and shouldn't trigger this command via click.
            // keeping this check just in case it's called programmatically.
            if (type === 'table') {
               vscode.commands.executeCommand('firebird.openTableInfo', name, connection);
               return;
            }

            switch (type) {
                // case 'table': ddl = await MetadataService.getTableDDL(connection, name); break; // Replaced by TableInfoPanel
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

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openTableInfo', async (arg1: any, arg2?: any) => {
        // arg1 could be the ObjectItem (when called from context menu) or name (when called programmatically)
        let name: string | undefined;
        let connection: DatabaseConnection | undefined;
        let section: 'triggers' | 'indexes' | undefined;

        if (arg1 && arg1.objectName && arg1.connection) {
            // Called from context menu / tree item (ObjectItem)
            name = arg1.objectName;
            connection = arg1.connection;
        } else if (arg1 instanceof TableTriggersItem || (arg1.contextValue === 'table-triggers')) {
            name = arg1.tableName;
            connection = arg1.connection;
            section = 'triggers';
        } else if (arg1 instanceof TableIndexesItem || (arg1.contextValue === 'table-indexes')) {
            name = arg1.tableName;
            connection = arg1.connection;
            section = 'indexes';
        } else if (typeof arg1 === 'string' && arg2) {
             // Called programmatically with (name, connection)
             name = arg1;
             connection = arg2;
        }

        if (name && connection) {
            TableInfoPanel.createOrShow(context.extensionUri, connection, name, section);
        } else {
            console.error('Invalid arguments for firebird.openTableInfo', arg1, arg2);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openSourceInfo', async (arg1: any, arg2?: any) => {
        let name: string | undefined;
        let connection: DatabaseConnection | undefined;
        let type: 'trigger' | 'procedure' | 'view' | 'function' | 'generator' | undefined;

        if (arg1 && arg1.objectName && arg1.connection && arg1.contextValue) {
            // Called from context menu / tree item (ObjectItem)
            name = arg1.objectName;
            connection = arg1.connection;
            // Map contextValue to type. contextValue might be 'trigger-favorite' etc.
            const ctx = arg1.contextValue as string;
            if (ctx.includes('trigger')) type = 'trigger';
            else if (ctx.includes('procedure')) type = 'procedure';
            else if (ctx.includes('view')) type = 'view';
            else if (ctx.includes('function')) type = 'function';
            else if (ctx.includes('generator')) type = 'generator';
        } else if (typeof arg1 === 'string' && arg2 && typeof arg2 === 'string') {
             // Called programmatically with (name, type, connection) ?? 
             // Logic might need adjustment depending on usage. 
             // But for now, let's assume it's like openTableInfo but with type.
             // If this signature isn't enough, we'll see.
        }

        if (name && connection && type) {
            SourceCodePanel.createOrShow(context.extensionUri, connection, name, type);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openIndexInfo', async (arg1: any) => {
        let name: string | undefined;
        let connection: DatabaseConnection | undefined;

        if (arg1 && arg1.connection) {
             if (arg1.objectName) {
                 name = arg1.objectName;
             } else if (arg1.indexName) {
                 name = arg1.indexName;
             }
             connection = arg1.connection;
        }

        if (name && connection) {
            IndexInfoPanel.createOrShow(context.extensionUri, connection, name);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.openGeneratorInfo', async (arg1: any) => {
        let name: string | undefined;
        let connection: DatabaseConnection | undefined;

        if (arg1 && arg1.objectName && arg1.connection) {
             name = arg1.objectName;
             connection = arg1.connection;
        }

        if (name && connection) {
            GeneratorInfoPanel.createOrShow(context.extensionUri, connection, name);
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

        let script: string;
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
                    case 'table': {
                        script = await MetadataService.getTableDDL(connection, name);
                        const perms = await MetadataService.getObjectPermissions(connection, name, 0);
                        const permsSql = MetadataService.formatPermissions(perms, name, 'TABLE');
                        if (permsSql) script += `\n\n${permsSql}`;
                        break;
                    }
                    case 'view': {
                        let src = await MetadataService.getViewSource(connection, name);
                        if (src.startsWith('CREATE VIEW')) {
                             src = src.replace('CREATE VIEW', 'CREATE OR ALTER VIEW');
                        }
                        script = wrapSetTerm(src);
                        break;
                    }
                    case 'trigger': script = wrapSetTerm(await MetadataService.getTriggerSource(connection, name)); break;
                    case 'procedure': {
                        script = wrapSetTerm(await MetadataService.getProcedureSource(connection, name));
                        const perms = await MetadataService.getObjectPermissions(connection, name, 5);
                        const permsSql = MetadataService.formatPermissions(perms, name, 'PROCEDURE');
                        if (permsSql) script += `\n\n${permsSql}`;
                        break;
                    }
                    case 'generator': script = await MetadataService.getGeneratorDDL(connection, name); break;
                }
            } else {
                // ALTER mode
                switch (type) {
                    case 'table':
                        script = `ALTER TABLE ${name} ADD column_name datatype; -- Template\n-- ALTER TABLE ${name} DROP column_name;\n-- ALTER TABLE ${name} ALTER COLUMN column_name TYPE new_type;`;
                        break;
                    case 'view': {
                        let vSrc = await MetadataService.getViewSource(connection, name);
                        if (vSrc.startsWith('CREATE VIEW')) {
                             vSrc = vSrc.replace('CREATE VIEW', 'CREATE OR ALTER VIEW');
                        } else {
                             vSrc = `CREATE OR ALTER VIEW ${name} AS ${vSrc}`;
                        }
                        script = wrapSetTerm(vSrc);
                        break;
                    }
                    case 'trigger':
                    case 'procedure': {
                        let src = '';
                        if (type === 'trigger') src = await MetadataService.getTriggerSource(connection, name);
                        else src = await MetadataService.getProcedureSource(connection, name);
                        
                        if (src.startsWith(`CREATE ${type.toUpperCase()}`)) {
                           src = src.replace(`CREATE ${type.toUpperCase()}`, `CREATE OR ALTER ${type.toUpperCase()}`);
                        }
                        script = wrapSetTerm(src);
                        
                        if (type === 'procedure') {
                            const perms = await MetadataService.getObjectPermissions(connection, name, 5);
                            const permsSql = MetadataService.formatPermissions(perms, name, 'PROCEDURE');
                            if (permsSql) script += `\n\n${permsSql}`;
                        }
                        break;
                    }
                    case 'generator': {
                        const curVal = await MetadataService.getGeneratorValue(connection, name);
                        const valNum = parseInt(curVal, 10);
                        const nextVal = isNaN(valNum) ? 0 : valNum;
                        script = `ALTER SEQUENCE ${name} RESTART WITH ${nextVal}; -- Set to desired value`;
                        break;
                    }
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
