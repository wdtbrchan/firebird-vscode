import * as vscode from 'vscode';
import { DatabaseConnection } from '../database/types';
import { MetadataService } from '../services/metadataService';
import { BaseInfoPanel } from './baseInfoPanel';
import { renderIndexInfoHtml } from './indexInfoTemplate';

export class IndexInfoPanel extends BaseInfoPanel {
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
    }

    public static createOrShow(extensionUri: vscode.Uri, connection: DatabaseConnection, indexName: string) {
        const panel = BaseInfoPanel._createPanel(extensionUri, {
            viewType: 'firebirdIndexInfo',
            title: `INDEX: ${indexName}`
        });
        const instance = new IndexInfoPanel(panel, extensionUri);
        instance._runUpdate(indexName, 'INDEX', async () => {
            const details = await MetadataService.getIndexDetails(connection, indexName);
            return renderIndexInfoHtml(indexName, details);
        });
    }
}
