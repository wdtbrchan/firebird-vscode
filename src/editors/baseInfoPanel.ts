import * as vscode from 'vscode';
import { renderInfoLoadingHtml, renderInfoErrorHtml } from './infoPanelTemplates';

export interface InfoPanelOptions {
    /** Webview panel viewType (vscode-internal id). */
    viewType: string;
    /** Title shown in the tab. */
    title: string;
    /** Title used in the loading screen heading (defaults to `title`). */
    loadingTitle?: string;
    /** Optional dataType prefix in the loading screen ("TRIGGER", "INDEX", ...). */
    dataType?: string;
}

/**
 * Base class for the read-only info webview panels (TableInfo, SourceCode,
 * IndexInfo, GeneratorInfo). Centralises panel lifecycle, loading screen,
 * error rendering, and disposal. Subclasses only need to implement
 * `_render()` which returns the final HTML.
 */
export abstract class BaseInfoPanel {
    protected readonly _panel: vscode.WebviewPanel;
    protected readonly _extensionUri: vscode.Uri;
    protected _disposables: vscode.Disposable[] = [];

    protected constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    protected static _createPanel(extensionUri: vscode.Uri, options: InfoPanelOptions): vscode.WebviewPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        return vscode.window.createWebviewPanel(
            options.viewType,
            options.title,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );
    }

    /**
     * Subclasses call this from their constructor with the loading title
     * and a fetch+render callback. Loading HTML is shown immediately,
     * then either the rendered HTML or an error page is set.
     */
    protected async _runUpdate(loadingTitle: string, dataType: string | undefined, render: () => Promise<string>): Promise<void> {
        this._panel.webview.html = renderInfoLoadingHtml(loadingTitle, dataType);
        try {
            this._panel.webview.html = await render();
        } catch (err) {
            this._panel.webview.html = renderInfoErrorHtml(loadingTitle, err);
        }
    }

    public dispose(): void {
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }
}
