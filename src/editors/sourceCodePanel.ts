import * as vscode from 'vscode';
import { DatabaseConnection } from '../database/types';
import { MetadataService } from '../services/metadataService';
import { BaseInfoPanel } from './baseInfoPanel';

type SourceObjectType = 'trigger' | 'procedure' | 'view' | 'function' | 'generator';

export class SourceCodePanel extends BaseInfoPanel {
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
    }

    public static createOrShow(extensionUri: vscode.Uri, connection: DatabaseConnection, name: string, type: SourceObjectType) {
        const typeLabel = type.toUpperCase();
        const panel = BaseInfoPanel._createPanel(extensionUri, {
            viewType: 'firebirdSourceInfo',
            title: `${typeLabel}: ${name}`
        });
        const instance = new SourceCodePanel(panel, extensionUri);
        instance._runUpdate(name, typeLabel, async () => {
            const source = await SourceCodePanel._fetchSource(connection, name, type);
            return SourceCodePanel._renderHtml(name, typeLabel, source);
        });
    }

    private static async _fetchSource(connection: DatabaseConnection, name: string, type: SourceObjectType): Promise<string> {
        switch (type) {
            case 'trigger': return MetadataService.getTriggerSource(connection, name);
            case 'procedure': return MetadataService.getProcedureSource(connection, name);
            case 'view': return MetadataService.getViewSource(connection, name);
            case 'generator': return MetadataService.getGeneratorDDL(connection, name);
            case 'function': return `-- Function source retrieval not implemented yet`;
            default: return `-- Unknown object type: ${type as string}`;
        }
    }

    private static _renderHtml(name: string, typeLabel: string, source: string): string {
        const style = `
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            h1 { font-size: 1.5em; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
            pre {
                background-color: var(--vscode-textCodeBlock-background);
                border: 1px solid var(--vscode-panel-border);
                padding: 15px;
                overflow-x: auto;
                border-radius: 5px;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
                display: block;
                box-sizing: border-box;
            }
            code {
                white-space: pre-wrap;
                background-color: transparent;
            }
        `;

        const escapedSource = source.replace(/&/g, '&amp;')
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;')
                                    .replace(/"/g, '&quot;')
                                    .replace(/'/g, '&#039;');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>${style}</style>
</head>
<body>
    <h1>${typeLabel}: ${name}</h1>
    <pre><code>${escapedSource}</code></pre>
</body>
</html>`;
    }
}
