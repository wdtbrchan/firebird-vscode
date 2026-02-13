import * as vscode from 'vscode';
import { DatabaseTreeDataProvider } from '../explorer/databaseTreeDataProvider';
import { DDLProvider } from '../services/ddlProvider';
import { registerQueryCommands } from './queryCommands';
import { registerTransactionCommands } from './transactionCommands';
import { registerConnectionCommands } from './connectionCommands';
import { registerGroupCommands } from './groupCommands';
import { registerObjectCommands } from './objectCommands';
import { registerIndexTriggerCommands } from './indexTriggerCommands';
import { registerScriptCommands } from './scriptCommands';
import { registerFavoritesCommands } from './favoritesCommands';
import { registerFilterCommands } from './filterCommands';
import { registerSettingsCommands } from './settingsCommands';

/**
 * Registers all extension commands.
 */
export function registerAllCommands(
    context: vscode.ExtensionContext,
    databaseTreeDataProvider: DatabaseTreeDataProvider,
    ddlProvider: DDLProvider
): void {
    registerQueryCommands(context, databaseTreeDataProvider);
    registerTransactionCommands(context, databaseTreeDataProvider);
    registerConnectionCommands(context, databaseTreeDataProvider);
    registerGroupCommands(context, databaseTreeDataProvider);
    registerObjectCommands(context, databaseTreeDataProvider, ddlProvider);
    registerIndexTriggerCommands(context);
    registerScriptCommands(context);
    registerFavoritesCommands(context, databaseTreeDataProvider);
    registerFilterCommands(context, databaseTreeDataProvider);
    registerSettingsCommands(context, databaseTreeDataProvider);
}
