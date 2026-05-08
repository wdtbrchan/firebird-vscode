import * as vscode from 'vscode';
import * as fs from 'fs';
import { DatabaseConnection } from '../database/types';
import { MetadataService, TableColumn, TableIndex, TableDependency, TablePermission, Trigger } from '../services/metadataService';
import { BaseInfoPanel } from './baseInfoPanel';

let cachedHtmlTemplate: string | undefined;
let cachedCssTemplate: string | undefined;

function loadTemplates(extensionUri: vscode.Uri): { html: string, css: string } {
    if (cachedHtmlTemplate === undefined || cachedCssTemplate === undefined) {
        const htmlPath = vscode.Uri.joinPath(extensionUri, 'src', 'editors', 'tableInfo.html').fsPath;
        const cssPath = vscode.Uri.joinPath(extensionUri, 'src', 'editors', 'tableInfo.css').fsPath;
        try {
            cachedHtmlTemplate = fs.readFileSync(htmlPath, 'utf8');
            cachedCssTemplate = fs.readFileSync(cssPath, 'utf8');
        } catch (e) {
            console.error('Failed to load tableInfo templates', e);
            cachedHtmlTemplate = '';
            cachedCssTemplate = '';
        }
    }
    return { html: cachedHtmlTemplate!, css: cachedCssTemplate! };
}

export class TableInfoPanel extends BaseInfoPanel {
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
    }

    public static createOrShow(extensionUri: vscode.Uri, connection: DatabaseConnection, tableName: string, section?: 'triggers' | 'indexes') {
        const title = section ? `${tableName} (${section})` : `Table: ${tableName}`;
        const panel = BaseInfoPanel._createPanel(extensionUri, {
            viewType: 'firebirdTableInfo',
            title
        });
        const instance = new TableInfoPanel(panel, extensionUri);
        instance._runUpdate(tableName, 'TABLE', () => instance._buildHtml(connection, tableName, section));
    }

    private async _buildHtml(connection: DatabaseConnection, tableName: string, section?: 'triggers' | 'indexes'): Promise<string> {
        // Run all metadata queries in parallel; total wall time = the slowest one.
        const [columns, triggers, indexes, dependencies, permissions, pks, fks] = await Promise.all([
            MetadataService.getTableColumns(connection, tableName),
            MetadataService.getTriggers(connection, tableName),
            MetadataService.getIndexes(connection, tableName),
            MetadataService.getTableDependencies(connection, tableName),
            MetadataService.getTablePermissions(connection, tableName),
            MetadataService.getPrimaryKeyColumns(connection, tableName),
            MetadataService.getForeignKeyColumns(connection, tableName)
        ]);

        columns.forEach(c => {
            if (pks.includes(c.name)) c.pk = true;
            if (fks.has(c.name)) c.fk = fks.get(c.name);
        });

        return this._getHtmlForWebview(tableName, columns, triggers, indexes, dependencies, permissions, section);
    }

    private _getHtmlForWebview(
        tableName: string,
        columns: TableColumn[],
        triggers: Trigger[],
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

        const { html: rawHtml, css: cssContent } = loadTemplates(this._extensionUri);
        let htmlContent = rawHtml.replace(/{{tableName}}/g, tableName);
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
