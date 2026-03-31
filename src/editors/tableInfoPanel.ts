import * as vscode from 'vscode';
import { DatabaseConnection } from '../database/types';
import { MetadataService, TableColumn, TableIndex, TableDependency, TablePermission } from '../services/metadataService';

export class TableInfoPanel {
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, connection: DatabaseConnection, tableName: string, section?: 'triggers' | 'indexes') {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        // TODO: Allow multiple panels for different tables? For now, singleton per table might be tricky.
        // Let's create a new panel every time for simplicity or matching the implementation plan to replace "Open Object".
        // Actually, if we want to replace "Open Object", we probably want to support multiple tables open.
        // But for a first implementation, let's just create a new one.
        
        const title = section ? `${tableName} (${section})` : `Table: ${tableName}`;

        const panel = vscode.window.createWebviewPanel(
            'firebirdTableInfo',
            title,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        const instance = new TableInfoPanel(panel, extensionUri);
        instance._update(connection, tableName, section);
    }

    public dispose() {
        // TableInfoPanel.currentPanel = undefined; // If singleton
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update(connection: DatabaseConnection, tableName: string, section?: 'triggers' | 'indexes') {
        this._panel.webview.html = this._getLoadingHtml(tableName);
        
        try {
            const columns = await MetadataService.getTableColumns(connection, tableName);
            const triggers = await MetadataService.getTriggers(connection, tableName);
            const indexes = await MetadataService.getIndexes(connection, tableName);
            const dependencies = await MetadataService.getTableDependencies(connection, tableName);
            const permissions = await MetadataService.getTablePermissions(connection, tableName);
            const pks = await MetadataService.getPrimaryKeyColumns(connection, tableName);

            const fks = await MetadataService.getForeignKeyColumns(connection, tableName);

            // Mark PKs and FKs in columns
            columns.forEach(c => {
                if (pks.includes(c.name)) c.pk = true;
                if (fks.has(c.name)) c.fk = fks.get(c.name);
            });

            this._panel.webview.html = this._getHtmlForWebview(tableName, columns, triggers, indexes, dependencies, permissions, section);
        } catch (err) {
            this._panel.webview.html = this._getErrorHtml(tableName, err);
        }
    }

    private _getLoadingHtml(tableName: string): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${tableName}</title>
            <style>
                body { 
                    font-family: var(--vscode-font-family); 
                    padding: 20px; 
                    color: var(--vscode-editor-foreground); 
                    background-color: var(--vscode-editor-background);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    flex-direction: column;
                }
                .spinner {
                    border: 4px solid var(--vscode-editor-background);
                    border-top: 4px solid var(--vscode-progressBar-background);
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="spinner"></div>
            <h2>Loading ${tableName}...</h2>
        </body>
        </html>`;
    }

    private _getErrorHtml(tableName: string, error: any): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${tableName}</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); }
                .error { color: var(--vscode-errorForeground); }
            </style>
        </head>
        <body>
            <h2>Error loading info for ${tableName}</h2>
            <p class="error">${error}</p>
        </body>
        </html>`;
    }

    private _getHtmlForWebview(
        tableName: string, 
        columns: TableColumn[], 
        triggers: any[], 
        indexes: TableIndex[], 
        dependencies: TableDependency[], 
        permissions: TablePermission[],
        section?: 'triggers' | 'indexes'
    ): string {


        const renderColumnTable = (cols: TableColumn[], withPkSeparator: boolean): string => {
            let html = `<table>
                <thead><tr><th>Name</th><th>Type</th><th>Nullable</th><th>Default</th><th>Computed</th><th>Indexes</th></tr></thead>
                <tbody>`;

            let lastPkIndex = -1;
            if (withPkSeparator) {
                for (let i = cols.length - 1; i >= 0; i--) {
                    if (cols[i].pk) { lastPkIndex = i; break; }
                }
            }

            cols.forEach((col, index) => {
                const colIndexes = indexes.filter(idx => idx.columns.includes(col.name));

                let indexInfo = '';
                if (colIndexes.length > 0) {
                    indexInfo = '<table class="index-grid">';
                    for (let i = 0; i < colIndexes.length; i += 2) {
                        indexInfo += '<tr>';
                        const idx1 = colIndexes[i];
                        const type1 = idx1.unique ? 'Unique' : 'Index';
                        indexInfo += `<td><div class="tag-index" title="${type1} (${idx1.columns.join(', ')})">${idx1.name}</div></td>`;
                        if (i + 1 < colIndexes.length) {
                            const idx2 = colIndexes[i + 1];
                            const type2 = idx2.unique ? 'Unique' : 'Index';
                            indexInfo += `<td><div class="tag-index" title="${type2} (${idx2.columns.join(', ')})">${idx2.name}</div></td>`;
                        } else {
                            indexInfo += '<td></td>';
                        }
                        indexInfo += '</tr>';
                    }
                    indexInfo += '</table>';
                }

                const pkClass = (withPkSeparator && col.pk && index === lastPkIndex) ? 'pk-separator' : '';
                let formatName = `<strong>${col.name}</strong>`;
                if (col.pk) { formatName += ` <span class="tag tag-pk">PK</span>`; }
                if (col.fk) { formatName += ` <span class="tag tag-fk" title="-> ${col.fk}">FK</span>`; }

                html += `<tr class="${pkClass}">
                    <td>${formatName}</td>
                    <td class="type-cell">${col.type}</td>
                    <td class="null-cell">${col.notNull ? 'NO' : 'YES'}</td>
                    <td>${col.defaultValue || ''}</td>
                    <td>${col.computedSource || ''}</td>
                    <td>${indexInfo}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            return html;
        };

        const renderColumns = () => {
            if (columns.length === 0) return '<p>No columns found.</p>';

            const dbOrderColumns = [...columns];
            const alphaOrderColumns = [...columns].sort((a, b) => a.name.localeCompare(b.name));
            const typeOrderColumns = [...columns].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

            return `
                <div id="cols-db">${renderColumnTable(dbOrderColumns, false)}</div>
                <div id="cols-alpha" style="display:none">${renderColumnTable(alphaOrderColumns, false)}</div>
                <div id="cols-type" style="display:none">${renderColumnTable(typeOrderColumns, false)}</div>
            `;
        };

        const renderTriggers = () => {
            if (triggers.length === 0) return '<p>No triggers.</p>';
            let html = `<table>
                <thead><tr><th>Name</th><th>Type</th><th>Sequence</th><th>Status</th></tr></thead>
                <tbody>`;
            triggers.forEach(trig => {
                const statusTag = trig.inactive ? '<span class="tag tag-inactive">Inactive</span>' : '<span class="tag tag-active">Active</span>';
                html += `<tr>
                    <td>${trig.name}</td>
                    <td>${MetadataService.decodeTriggerType(trig.type)}</td>
                    <td>${trig.sequence}</td>
                    <td>${statusTag}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            return html;
        };

        const renderIndexes = () => {
             if (indexes.length === 0) return '<p>No indexes.</p>';
             let html = `<table>
                <thead><tr><th>Name</th><th>Columns</th><th>Unique</th><th>Status</th></tr></thead>
                <tbody>`;
             indexes.forEach(idx => {
                const statusTag = idx.inactive ? '<span class="tag tag-inactive">Inactive</span>' : '<span class="tag tag-active">Active</span>';
                const uniqueTag = idx.unique ? '<span class="tag tag-pk">Unique</span>' : '';
                html += `<tr>
                    <td>${idx.name}</td>
                    <td>${idx.columns.join(', ')}</td>
                    <td>${uniqueTag}</td>
                    <td>${statusTag}</td>
                </tr>`;
             });
             html += '</tbody></table>';
             return html;
        };

        const renderDependencies = () => {
            if (dependencies.length === 0) return '<p>No dependent views.</p>';
             let html = `<table>
                <thead><tr><th>Name</th><th>Type</th></tr></thead>
                <tbody>`;
             dependencies.forEach(dep => {
                html += `<tr>
                    <td>${dep.name}</td>
                    <td>${dep.type}</td>
                </tr>`;
             });
             html += '</tbody></table>';
             return html;
        };

        const renderPermissions = () => {
            if (permissions.length === 0) return '<p>No permissions found.</p>';
             let html = `<table>
                <thead><tr><th>User</th><th>Privilege</th><th>Grantor</th><th>Grant Option</th></tr></thead>
                <tbody>`;
             permissions.forEach(perm => {
                html += `<tr>
                    <td>${perm.user}</td>
                    <td>${perm.privilege}</td>
                    <td>${perm.grantor}</td>
                    <td>${perm.grantOption ? 'YES' : 'NO'}</td>
                </tr>`;
             });
             html += '</tbody></table>';
             return html;
        };

        const fs = require('fs');
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'editors', 'tableInfo.html').fsPath;
        const cssPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'editors', 'tableInfo.css').fsPath;
        
        let htmlContent = '';
        let cssContent = '';
        try {
            htmlContent = fs.readFileSync(htmlPath, 'utf8');
            cssContent = fs.readFileSync(cssPath, 'utf8');
        } catch (e) {
            console.error('Failed to load tableInfo templates', e);
        }

        htmlContent = htmlContent.replace(/{{tableName}}/g, tableName);
        htmlContent = htmlContent.replace('{{cssContent}}', cssContent);

        const columnSortToggle = section ? '' : `<button class="sort-toggle-btn" id="btn-col-sort" title="DB order" onclick="toggleColumnSort()">DB</button>
        <script>
            var _colSortMode = 'db';
            function toggleColumnSort() {
                const dbDiv = document.getElementById('cols-db');
                const alphaDiv = document.getElementById('cols-alpha');
                const typeDiv = document.getElementById('cols-type');
                const btn = document.getElementById('btn-col-sort');
                if (_colSortMode === 'db') {
                    _colSortMode = 'alpha';
                    dbDiv.style.display = 'none';
                    alphaDiv.style.display = '';
                    typeDiv.style.display = 'none';
                    btn.textContent = 'A-Z';
                    btn.title = 'Sorted A-Z';
                    btn.classList.add('active-alpha');
                } else if (_colSortMode === 'alpha') {
                    _colSortMode = 'type';
                    dbDiv.style.display = 'none';
                    alphaDiv.style.display = 'none';
                    typeDiv.style.display = '';
                    btn.textContent = 'Type';
                    btn.title = 'Sorted by type';
                    btn.classList.add('active-alpha');
                } else {
                    _colSortMode = 'db';
                    dbDiv.style.display = '';
                    alphaDiv.style.display = 'none';
                    typeDiv.style.display = 'none';
                    btn.textContent = 'DB';
                    btn.title = 'DB order';
                    btn.classList.remove('active-alpha');
                }
            }
        </script>`;

        htmlContent = htmlContent.replace('{{sectionStyleColumns}}', section ? 'style="display:none"' : '');
        htmlContent = htmlContent.replace('{{columnSortToggle}}', columnSortToggle);
        htmlContent = htmlContent.replace('{{columnsTable}}', renderColumns());

        htmlContent = htmlContent.replace('{{sectionStyleIndexes}}', (section && section !== 'indexes') ? 'style="display:none"' : '');
        htmlContent = htmlContent.replace('{{indexesTable}}', renderIndexes());

        htmlContent = htmlContent.replace('{{sectionStyleTriggers}}', (section && section !== 'triggers') ? 'style="display:none"' : '');
        htmlContent = htmlContent.replace('{{triggersTable}}', renderTriggers());

        htmlContent = htmlContent.replace('{{sectionStyleDependencies}}', section ? 'style="display:none"' : '');
        htmlContent = htmlContent.replace('{{dependenciesTable}}', renderDependencies());

        htmlContent = htmlContent.replace('{{sectionStylePermissions}}', section ? 'style="display:none"' : '');
        htmlContent = htmlContent.replace('{{permissionsTable}}', renderPermissions());

        return htmlContent;
    }
}
