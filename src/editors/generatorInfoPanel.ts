import * as vscode from 'vscode';
import { DatabaseConnection } from '../database/types';
import { MetadataService } from '../services/metadataService';
import { BaseInfoPanel } from './baseInfoPanel';

export class GeneratorInfoPanel extends BaseInfoPanel {
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
    }

    public static createOrShow(extensionUri: vscode.Uri, connection: DatabaseConnection, generatorName: string) {
        const panel = BaseInfoPanel._createPanel(extensionUri, {
            viewType: 'firebirdGeneratorInfo',
            title: `GENERATOR: ${generatorName}`
        });
        const instance = new GeneratorInfoPanel(panel, extensionUri);
        instance._runUpdate(generatorName, 'GENERATOR', async () => {
            const value = await MetadataService.getGeneratorValue(connection, generatorName);
            return GeneratorInfoPanel._renderHtml(generatorName, value);
        });
    }

    private static _renderHtml(name: string, value: string | number): string {
        const style = `
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            h1 { font-size: 1.5em; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
            .info-box {
                padding: 15px;
                background-color: var(--vscode-textBlockQuote-background);
                border-left: 5px solid var(--vscode-textLink-activeForeground);
                margin-bottom: 20px;
            }
            .label { font-weight: 600; font-size: 1.1em; display: block; margin-bottom: 5px; color: var(--vscode-descriptionForeground); }
            .value { font-size: 2em; font-weight: bold; }
        `;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>${style}</style>
</head>
<body>
    <h1>GENERATOR: ${name}</h1>
    <div class="info-box">
        <span class="label">Current Value</span>
        <span class="value">${value}</span>
    </div>
    <p><small>Note: This value was retrieved at the time of loading. It may have changed.</small></p>
</body>
</html>`;
    }
}
