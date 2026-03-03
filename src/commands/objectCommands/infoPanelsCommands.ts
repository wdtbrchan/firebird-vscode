import * as vscode from 'vscode';
import { DatabaseConnection } from '../../database/types';
import { TableTriggersItem } from '../../explorer/treeItems/triggerItems';
import { TableIndexesItem } from '../../explorer/treeItems/indexItems';
import { TableInfoPanel } from '../../editors/tableInfoPanel';
import { SourceCodePanel } from '../../editors/sourceCodePanel';
import { IndexInfoPanel } from '../../editors/indexInfoPanel';
import { GeneratorInfoPanel } from '../../editors/generatorInfoPanel';

export function registerInfoPanelsCommands(
    context: vscode.ExtensionContext
): void {
    context.subscriptions.push(vscode.commands.registerCommand('firebird.openTableInfo', async (arg1: any, arg2?: any) => {
        let name: string | undefined;
        let connection: DatabaseConnection | undefined;
        let section: 'triggers' | 'indexes' | undefined;

        if (arg1 && arg1.objectName && arg1.connection) {
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
            name = arg1.objectName;
            connection = arg1.connection;
            const ctx = arg1.contextValue as string;
            if (ctx.includes('trigger')) type = 'trigger';
            else if (ctx.includes('procedure')) type = 'procedure';
            else if (ctx.includes('view')) type = 'view';
            else if (ctx.includes('function')) type = 'function';
            else if (ctx.includes('generator')) type = 'generator';
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
}
