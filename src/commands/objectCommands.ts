import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { DDLProvider } from '../services/ddlProvider';

import { registerOpenObjectCommands } from './objectCommands/openObjectCommand';
import { registerInfoPanelsCommands } from './objectCommands/infoPanelsCommands';
import { registerCreateObjectCommand } from './objectCommands/createObjectCommand';
import { registerScriptCommands } from './objectCommands/scriptCommands';

export function registerObjectCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider,
    ddlProvider: DDLProvider
): void {
    registerOpenObjectCommands(context, ddlProvider);
    registerInfoPanelsCommands(context);
    registerCreateObjectCommand(context);
    registerScriptCommands(context);
}
