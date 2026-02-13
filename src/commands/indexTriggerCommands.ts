import * as vscode from 'vscode';
import { DatabaseConnection } from '../explorer/treeItems/databaseItems';

export function registerIndexTriggerCommands(
    context: vscode.ExtensionContext
): void {

    context.subscriptions.push(vscode.commands.registerCommand('firebird.createIndex', async (connection: DatabaseConnection, tableName: string) => {
        try {
            const script = `/*\nCREATE [UNIQUE] [ASC[ENDING] | [DESC[ENDING]] INDEX indexname\n   ON tablename\n   { (<col> [, <col> ...]) | COMPUTED BY (expression) }\n<col>  ::=  a column not of type ARRAY, BLOB or COMPUTED BY\n*/\n\nCREATE INDEX IX_${tableName}_1 ON ${tableName} (column_name);`;

            const doc = await vscode.workspace.openTextDocument({
                content: script,
                language: 'sql'
            });
            await vscode.window.showTextDocument(doc);
        } catch (err: any) {
             vscode.window.showErrorMessage(`Error preparing create index script: ${err.message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('firebird.indexOperation', async (type: 'drop' | 'activate' | 'deactivate' | 'recompute', connection: DatabaseConnection, indexName: string) => {
        try {
            let sql = '';
            
            if (type === 'drop') {
                sql = `DROP INDEX ${indexName};`;
            } else if (type === 'activate') {
                sql = `ALTER INDEX ${indexName} ACTIVE;`;
            } else if (type === 'deactivate') {
                sql = `ALTER INDEX ${indexName} INACTIVE;`;
            } else if (type === 'recompute') {
                sql = `SET STATISTICS INDEX ${indexName};`;
            }

            const doc = await vscode.workspace.openTextDocument({
                content: sql,
                language: 'sql'
            });
            await vscode.window.showTextDocument(doc);
            
        } catch (err: any) {
             vscode.window.showErrorMessage(`Operation failed: ${err.message}`);
        }
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('firebird.triggerOperation', async (type: 'drop' | 'activate' | 'deactivate', connection: DatabaseConnection, triggerName: string) => {
        try {
            let sql = '';
            
            if (type === 'drop') {
                sql = `DROP TRIGGER ${triggerName};`;
            } else if (type === 'activate') {
                sql = `ALTER TRIGGER ${triggerName} ACTIVE;`;
            } else if (type === 'deactivate') {
                sql = `ALTER TRIGGER ${triggerName} INACTIVE;`;
            }

            const doc = await vscode.workspace.openTextDocument({
                content: sql,
                language: 'sql'
            });
            await vscode.window.showTextDocument(doc);
            
        } catch (err: any) {
             vscode.window.showErrorMessage(`Operation failed: ${err.message}`);
        }
    }));
}
