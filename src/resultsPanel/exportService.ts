import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { DatabaseConnection } from '../database/types';
import { Database } from '../database';
import { CsvFormat, formatCsvRows } from './csvFormat';

const EXPORT_TX_ID = 'firebird-export';
const EXPORT_BATCH_SIZE = 500;

export class ExportService {
    public static async exportCsv(
        panel: vscode.WebviewPanel | undefined,
        currentQuery: string | undefined,
        currentConnection: DatabaseConnection | undefined,
        message: any
    ) {
        const delimiter: string = message.delimiter || ';';
        const qualifier: string = message.qualifier || '"';
        const encoding: string = message.encoding || 'UTF8';
        const filename: string = message.filename || 'export.csv';
        const decimalSeparator: '.' | ',' = (message.decimalSeparator === ',') ? ',' : '.';

        if (!currentQuery || !currentConnection) {
            vscode.window.showWarningMessage('No query to export.');
            return;
        }

        const connection = currentConnection;
        const config = vscode.workspace.getConfiguration('firebird');
        config.update('csvDecimalSeparator', decimalSeparator, true);

        const reportProgress = (status: string) => {
            if (message.onProgress) {
                message.onProgress(status);
            } else if (panel) {
                panel.webview.postMessage({ command: 'csvExportStatus', status });
            }
        };

        reportProgress('Executing query...');

        try {
            const cleanQuery = currentQuery.trim().replace(/;$/, '');
            const allRows = await this._fetchAllRows(connection, cleanQuery, count => {
                reportProgress(`Fetching rows... ${count}`);
            });

            if (allRows.length === 0) {
                reportProgress('');
                vscode.window.showWarningMessage('No data to export.');
                return;
            }

            const fmt: CsvFormat = { delimiter, qualifier, decimalSeparator };
            const columns = Object.keys(allRows[0]);
            const csvContent = formatCsvRows(columns, allRows, fmt);

            reportProgress('Select file save location...');

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(filename),
                filters: { 'CSV Files': ['csv'], 'All Files': ['*'] },
                saveLabel: 'Export'
            });

            if (!uri) {
                reportProgress('');
                return;
            }

            const fileBuffer = iconv.encodingExists(encoding)
                ? iconv.encode(csvContent, encoding)
                : Buffer.from(csvContent, 'utf8');

            await vscode.workspace.fs.writeFile(uri, fileBuffer);
            vscode.window.showInformationMessage(`CSV exported: ${allRows.length} rows → ${uri.fsPath}`);
            reportProgress('');

        } catch (err: any) {
            reportProgress('');
            vscode.window.showErrorMessage(`Export failed: ${err.message}`);
        } finally {
            // Always release the dedicated export transaction so we never leave it open.
            try {
                await Database.rollback(EXPORT_TX_ID, 'Export finished');
            } catch (e) {
                // ignore – may not exist if attach failed
            }
        }
    }

    /**
     * Fetches all rows for `query` against `connection`, using a dedicated
     * transaction id so we never disturb the user's active editor session.
     * Pages through results via Database.executeQuery's offset/limit reuse.
     */
    private static async _fetchAllRows(
        connection: DatabaseConnection,
        query: string,
        onProgress: (count: number) => void
    ): Promise<any[]> {
        const collected: any[] = [];
        let offset = 0;
        // Loop until executeQuery reports no more rows.
        // executeQuery reuses the active statement when offset > 0 and the
        // query/connection match, so this acts like server-side pagination.
        while (true) {
            const result = await Database.executeQuery(
                EXPORT_TX_ID,
                query,
                connection,
                { limit: EXPORT_BATCH_SIZE, offset }
            );
            if (result.rows.length > 0) {
                collected.push(...result.rows);
                onProgress(collected.length);
            }
            if (!result.hasMore) break;
            offset += result.rows.length;
            if (result.rows.length === 0) break; // safety
        }
        return collected;
    }
}
