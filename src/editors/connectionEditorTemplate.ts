import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConnectionGroup } from '../explorer/treeItems/databaseItems';
import { DatabaseConnection } from '../database/types';

/**
 * Generates the full HTML for the Connection Editor webview.
 */
export function getConnectionEditorHtml(
    extensionUri: vscode.Uri,
    groups: ConnectionGroup[],
    connection?: DatabaseConnection
): string {
    const isEdit = !!connection;
    const shortcutSlot = connection?.shortcutSlot || 0;
    
    const locales = [
        { code: '', label: 'Default (Global Setting)' },
        { code: 'en-US', label: 'English (United States)' },
        { code: 'cs-CZ', label: 'Czech (Czech Republic)' },
        { code: 'de-DE', label: 'German (Germany)' },
        { code: 'fr-FR', label: 'French (France)' },
        { code: 'es-ES', label: 'Spanish (Spain)' },
        { code: 'it-IT', label: 'Italian (Italy)' },
        { code: 'pl-PL', label: 'Polish (Poland)' },
        { code: 'ru-RU', label: 'Russian (Russia)' },
        { code: 'pt-BR', label: 'Portuguese (Brazil)' },
        { code: 'zh-CN', label: 'Chinese (Simplified)' },
        { code: 'ja-JP', label: 'Japanese (Japan)' },
    ];
    const localeCodes = locales.map(l => l.code).filter(c => c);

    const commonCharsets = [
        'NONE', 'UTF8', 'ASCII', 'OCTETS', 'UNICODE_FSS', 
        'WIN1250', 'WIN1251', 'WIN1252', 'WIN1253', 'WIN1254', 'WIN1255', 'WIN1256', 'WIN1257', 'WIN1258',
        'ISO8859_1', 'ISO8859_2', 'ISO8859_3', 'ISO8859_4', 'ISO8859_5', 'ISO8859_6', 'ISO8859_7', 'ISO8859_8', 'ISO8859_9', 'ISO8859_13',
        'BIG_5', 'GB2312', 'KSC_5601', 'SJIS', 'CYRL', 'DOS437', 'DOS850', 'DOS852', 'DOS857', 'DOS860', 'DOS861', 'DOS863', 'DOS865'
    ];

    const initialData = {
        isEdit,
        id: connection?.id || Date.now().toString(),
        name: connection?.name || '',
        groupId: connection?.groupId || '',
        host: connection?.host || '127.0.0.1',
        port: connection?.port || 3050,
        database: connection?.database || '',
        user: connection?.user || 'SYSDBA',
        password: connection?.password || '',
        role: connection?.role || '',
        charset: connection?.charset || 'UTF8',
        resultLocale: connection?.resultLocale || '',
        shortcutSlot,
        color: connection?.color || '',
        groups: groups.map(g => ({ id: g.id, name: g.name })),
        localeCodes,
        commonCharsets
    };

    // Paths to external files - note that in production extension, __dirname is usually out/editors
    // So if the files are in src/editors, we need to resolve properly.
    // However, loading via webview API allows doing it clean relative to extension path.
    const htmlPath = vscode.Uri.joinPath(extensionUri, 'src', 'editors', 'connectionEditor.html').fsPath;
    let htmlContent: string;
    try {
        htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } catch (e) {
        return `<html><body>Error loading HTML template: ${e}</body></html>`;
    }

    // URIs for Webview
    // We need to pass the webview instance to correctly generate `asWebviewUri`. 
    // Wait, the original getConnectionEditorHtml doesn't take the webview instance. It takes `extensionUri: any`.
    // It used to do: href="${extensionUri}/node_modules/@vscode/codicons/dist/codicon.css"
    // So let's maintain the same approach or pass a dummy one.
    // In original code: <link href="${extensionUri}/node_modules/@vscode/codicons/dist/codicon.css" rel="stylesheet" />
    
    const cssUri = `${extensionUri}/src/editors/connectionEditor.css`;
    const jsUri = `${extensionUri}/src/editors/connectionEditor.js`;
    // BUT wait! InVS Code webviews, loading file:// URIs directly is blocked by CSP and security.
    // The previous implementation used inline CSS and JS. Now that they are external, if we use just strings, it won't load! 
    // Let's actually INLINE the generated CSS and JS into the HTML, or we MUST change the signature to take the webview to use webview.asWebviewUri.
    
    // Changing signature would break callers. Let's just INLINE the CSS and JS for now, which achieves 
    // separation of files while keeping the webview code simple and robust.
    
    const cssPath = vscode.Uri.joinPath(extensionUri, 'src', 'editors', 'connectionEditor.css').fsPath;
    const jsPath = vscode.Uri.joinPath(extensionUri, 'src', 'editors', 'connectionEditor.js').fsPath;
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    // Replace placeholders
    const codiconUri = `${extensionUri}/node_modules/@vscode/codicons/dist/codicon.css`;
    htmlContent = htmlContent.replace('{{codiconUri}}', codiconUri);
    htmlContent = htmlContent.replace('<!-- DATA_INJECTION -->', `<script>window.INITIAL_DATA = ${JSON.stringify(initialData)};</script>`);
    
    // Instead of using external links for our own css/js because of VS code security without webview instance:
    htmlContent = htmlContent.replace('<link href="{{cssUri}}" rel="stylesheet" />', `<style>${cssContent}</style>`);
    htmlContent = htmlContent.replace('<script src="{{jsUri}}"></script>', `<script>${jsContent}</script>`);

    return htmlContent;
}
