import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { DatabaseConnection } from '../database/types';
import * as Firebird from 'node-firebird';
import { prepareQueryBuffer, processResultRows, getUniqueColumnNames } from '../database/encodingUtils';

export class ExportService {
    public static async exportCsv(
        panel: vscode.WebviewPanel,
        currentQuery: string | undefined,
        currentConnection: DatabaseConnection | undefined,
        message: any
    ) {
        const delimiter: string = message.delimiter || ';';
        const qualifier: string = message.qualifier || '"';
        const encoding: string = message.encoding || 'UTF8';
        const filename: string = message.filename || 'export.csv';

        if (!currentQuery || !currentConnection) {
            vscode.window.showWarningMessage('No query to export.');
            return;
        }

        const connection = currentConnection;
        const config = vscode.workspace.getConfiguration('firebird');
        const encodingConf = connection.charset || config.get<string>('charset', 'UTF8');

        // Notify webview: Executing query
        panel.webview.postMessage({ command: 'csvExportStatus', status: 'Executing query...' });

        try {
            const options: Firebird.Options = {
                host: connection.host,
                port: connection.port,
                database: connection.database,
                user: connection.user,
                password: connection.password,
                role: connection.role,
                encoding: 'NONE' as any,
                lowercase_keys: false
            };

            const allRows: any[] = await new Promise((resolve, reject) => {
                Firebird.attach(options, (err: any, db: any) => {
                    if (err) return reject(err);

                    const cleanQuery = currentQuery!.trim().replace(/;$/, '');
                    const queryString = prepareQueryBuffer(cleanQuery, encodingConf);
                    const batchSize = 500;

                    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err: any, tr: any) => {
                        if (err) {
                            try { db.detach(); } catch (e) { /* ignore */ }
                            return reject(err);
                        }

                        const trAny = tr as any;
                        trAny.newStatement(queryString, (err: any, stmt: any) => {
                            if (err) {
                                try { tr.rollback(() => db.detach()); } catch (e) { /* ignore */ }
                                return reject(err);
                            }

                            stmt.execute(tr, [], (err: any, _result: any, _output: any, isSelect: boolean) => {
                                if (err) {
                                    try { stmt.close(); tr.rollback(() => db.detach()); } catch (e) { /* ignore */ }
                                    return reject(err);
                                }

                                if (isSelect === undefined) {
                                    isSelect = (stmt.type === 1);
                                }
                                if (!isSelect) {
                                    try { stmt.close(); tr.rollback(() => db.detach()); } catch (e) { /* ignore */ }
                                    return reject(new Error('Query does not return rows.'));
                                }

                                const collected: any[] = [];
                                const columnNames = getUniqueColumnNames(stmt.output);
                                const fetchBatch = () => {
                                    stmt.fetch(tr, batchSize, async (err: any, ret: any) => {
                                        if (err) {
                                            try { stmt.close(); tr.rollback(() => db.detach()); } catch (e) { /* ignore */ }
                                            return reject(err);
                                        }

                                        try {
                                            const processed = await processResultRows(ret.data || [], encodingConf, columnNames);
                                            collected.push(...processed);

                                            // Report progress
                                            panel.webview.postMessage({ 
                                                command: 'csvExportStatus', 
                                                status: `Fetching rows... ${collected.length}` 
                                            });

                                            const hasMore = !ret.fetched && (ret.data?.length === batchSize);
                                            if (hasMore) {
                                                fetchBatch();
                                            } else {
                                                // Done fetching
                                                try { stmt.close(); tr.rollback(() => db.detach()); } catch (e) { /* ignore */ }
                                                resolve(collected);
                                            }
                                        } catch (readErr) {
                                            try { stmt.close(); tr.rollback(() => db.detach()); } catch (e) { /* ignore */ }
                                            reject(readErr);
                                        }
                                    });
                                };
                                fetchBatch();
                            }, { asObject: false });
                        });
                    });
                });
            });

            if (allRows.length === 0) {
                panel.webview.postMessage({ command: 'csvExportStatus', status: '' });
                vscode.window.showWarningMessage('No data to export.');
                return;
            }

            // Generate CSV
            const columns = Object.keys(allRows[0]);
            const escapeValue = (val: any): string => {
                if (val === null || val === undefined) return '';
                if (val instanceof Uint8Array) return '[Blob]';
                const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                const escaped = str.replace(new RegExp(qualifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), qualifier + qualifier);
                return `${qualifier}${escaped}${qualifier}`;
            };

            const headerLine = columns.map(col => escapeValue(col)).join(delimiter);
            const dataLines = allRows.map(row => {
                return columns.map(col => escapeValue(row[col])).join(delimiter);
            });
            const csvContent = [headerLine, ...dataLines].join('\n');

            // Clear status
            panel.webview.postMessage({ command: 'csvExportStatus', status: '' });

            // Show save dialog
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(filename),
                filters: { 'CSV Files': ['csv'], 'All Files': ['*'] },
                saveLabel: 'Export'
            });

            if (!uri) return;

            // Encode with iconv-lite
            let fileBuffer: Buffer;
            if (iconv.encodingExists(encoding)) {
                fileBuffer = iconv.encode(csvContent, encoding);
            } else {
                fileBuffer = Buffer.from(csvContent, 'utf8');
            }

            await vscode.workspace.fs.writeFile(uri, fileBuffer);
            vscode.window.showInformationMessage(`CSV exported: ${allRows.length} rows → ${uri.fsPath}`);

        } catch (err: any) {
            panel.webview.postMessage({ command: 'csvExportStatus', status: `Error: ${err.message}` });
            vscode.window.showErrorMessage(`Export failed: ${err.message}`);
        }
    }
}
