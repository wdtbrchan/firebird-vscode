import * as vscode from 'vscode';
import { DatabaseConnection } from '../../database/types';

export function registerCreateObjectCommand(
    context: vscode.ExtensionContext
): void {
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
}
