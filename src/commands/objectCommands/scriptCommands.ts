import * as vscode from 'vscode';
import { ObjectItem } from '../../explorer/treeItems/databaseItems';
import { MetadataService } from '../../services/metadataService';

export function registerScriptCommands(
    context: vscode.ExtensionContext
): void {
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

        } catch (err) {
            vscode.window.showErrorMessage(`Error generating script: ${(err as Error).message}`);
        }
    }));
}
