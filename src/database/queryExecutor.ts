import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import { TransactionManager } from './transactionManager';
import { processResultRows, prepareQueryBuffer, getUniqueColumnNames } from './encodingUtils';
import { QueryOptions, QueryResult, DatabaseConnection } from './types';
import { RowCounter } from './rowCounter';
import { ConnectionChecker } from './connectionChecker';
import { toFirebirdOptions } from './connectionOptions';

interface PreparedExecution {
    options: Firebird.Options;
    encodingConf: string;
}

/**
 * Local minimal types for the bits of node-firebird we touch but which the
 * library's published types omit. Intentionally narrow — only what we use.
 */
type FbErr = Error & { message: string };

interface FbStatementOutputColumn {
    alias?: string;
    field?: string;
}

interface FbFetchResult {
    data?: unknown[];
    fetched?: boolean;
}

interface FbStatement {
    output: FbStatementOutputColumn[];
    type: number;
    handle?: number;
    plan?: string;
    execute(tr: Firebird.Transaction, params: unknown[], cb: (err: FbErr | null, result: unknown, output: unknown, isSelect: boolean) => void, opts?: { asObject?: boolean }): void;
    fetch(tr: Firebird.Transaction, limit: number, cb: (err: FbErr | null, ret: FbFetchResult) => void): void;
    close(): void;
    drop(): void;
}

interface FbConnection {
    prepare(tr: Firebird.Transaction, query: string, b: boolean, cb: (err: FbErr | null, statement: FbStatement) => void): void;
}

interface FbTransactionWithExt extends Firebird.Transaction {
    newStatement(query: string, cb: (err: FbErr | null, statement: FbStatement) => void): void;
    connection?: FbConnection;
}

interface FbDatabaseWithEvents extends Firebird.Database {
    on(event: 'error', cb: (err: FbErr) => void): void;
}

/**
 * Handles query execution, affected row counting, and metadata queries.
 */
export class QueryExecutor {

    /**
     * Runs a simple metadata query using a one-shot connection (no transaction reuse).
     */
    public static async runMetaQuery(id: string, connection: DatabaseConnection, query: string): Promise<Record<string, unknown>[]> {
        const config = vscode.workspace.getConfiguration('firebird');
        const encodingConf = connection.charset || config.get<string>('charset', 'UTF8');
        const options = toFirebirdOptions(connection);

        return new Promise((resolve, reject) => {
            Firebird.attach(options, (err, db) => {
                if (err) return reject(err);

                (db as FbDatabaseWithEvents).on('error', (dbErr) => {
                    try { db.detach(); } catch (_e) { /* ignore */ }
                    reject(dbErr);
                });

                const finalQuery = prepareQueryBuffer(query, encodingConf);

                db.query(finalQuery, [], async (err, result) => {
                    if (err) {
                        try { db.detach(); } catch (_e) { /* ignore */ }
                        return reject(err);
                    }

                    try {
                        const rows = await processResultRows(result, encodingConf);
                        try { db.detach(); } catch (_e) { /* ignore */ }
                        resolve(rows);
                    } catch (readErr) {
                        try { db.detach(); } catch (_e) { /* ignore */ }
                        reject(readErr);
                    }
                });
            });
        });
    }

    /**
     * Executes a query against the Firebird database.
     * Handles SELECT pagination, DML affected rows, transaction reuse, and encoding.
     */
    public static async executeQuery(id: string, query: string, connection?: DatabaseConnection, queryOptions?: QueryOptions): Promise<QueryResult> {
        const cleanQuery = query.trim().replace(/;$/, '');
        const offset = queryOptions?.offset || 0;
        const qPreview = cleanQuery.replace(/\s+/g, ' ').substring(0, 60);
        console.log(`[FB] QueryExecutor.executeQuery START | id=${id} | offset=${offset} | query="${qPreview}"`);

        const { options, encodingConf } = await this._prepareForExecution(id, connection);

        return new Promise<QueryResult>((resolve, reject) => {
            const tm = TransactionManager.getInstance(id);
            const t0 = performance.now();

            const wrapResolve = (res: QueryResult) => {
                tm.currentReject = undefined;
                tm.resetAutoRollback();
                console.log(`[FB] QueryExecutor.executeQuery RESOLVE | rows=${res.rows.length} | affectedRows=${res.affectedRows} | elapsed=${((performance.now() - t0) / 1000).toFixed(3)}s`);
                resolve(res);
            };
            const wrapReject = (err: Error) => {
                tm.currentReject = undefined;
                tm.resetAutoRollback();
                console.log(`[FB] QueryExecutor.executeQuery REJECT | elapsed=${((performance.now() - t0) / 1000).toFixed(3)}s | message=${err.message}`);
                reject(err);
            };
            tm.currentReject = wrapReject;

            const runQuery = (tr: Firebird.Transaction) => {
                const trExt = tr as FbTransactionWithExt;
                const queryString = prepareQueryBuffer(cleanQuery, encodingConf);
                const limit = queryOptions?.limit || 1000;
                const reqOffset = queryOptions?.offset || 0;
                const connectionInfo = `${options.host}:${options.database}`;

                const executeOnStatement = (stmt: FbStatement) => {
                    console.log(`[FB] stmt.execute calling...`);
                    stmt.execute(tr, [], async (err, _result, _output, isSelect) => {
                        if (err) {
                            console.log(`[FB] stmt.execute ERROR | ${err.message}`);
                            return wrapReject(err);
                        }

                        if (isSelect === undefined) {
                            isSelect = (stmt.type === 1);
                        }
                        console.log(`[FB] stmt.execute callback | isSelect=${isSelect}`);

                        if (isSelect) {
                            tm.activeStatement = stmt;
                            tm.activeQuery = cleanQuery;
                            tm.activeConnectionInfo = connectionInfo;

                            const columnNames = getUniqueColumnNames(stmt.output);
                            console.log(`[FB] stmt.fetch calling | limit=${limit} | columns=${columnNames.length}`);
                            stmt.fetch(tr, limit, async (fetchErr, ret) => {
                                if (fetchErr) {
                                    console.log(`[FB] stmt.fetch ERROR | ${fetchErr.message}`);
                                    stmt.close();
                                    tm.activeStatement = undefined;
                                    return wrapReject(fetchErr);
                                }
                                console.log(`[FB] stmt.fetch callback | rows=${ret.data?.length ?? 0} | fetched=${ret.fetched}`);
                                try {
                                    const processed = await processResultRows(ret.data || [], encodingConf, columnNames);
                                    wrapResolve({
                                        rows: processed,
                                        hasMore: !ret.fetched && (ret.data?.length === limit)
                                    });
                                } catch (readErr) {
                                    wrapReject(readErr as Error);
                                }
                            });
                        } else {
                            const dmlType = RowCounter.detectDmlType(cleanQuery);
                            let affectedRows: number | undefined;
                            try {
                                affectedRows = await RowCounter.getAffectedRows(stmt, tr, dmlType);
                            } catch (_e) { /* ignore */ }

                            stmt.close();
                            tm.activeStatement = undefined;
                            wrapResolve({ rows: [], affectedRows });
                        }
                    }, { asObject: false });
                };

                const fetchMore = (stmt: FbStatement) => {
                    const columnNames = getUniqueColumnNames(stmt.output);
                    console.log(`[FB] fetchMore (reuse stmt) calling | limit=${limit} | offset=${reqOffset}`);
                    stmt.fetch(tr, limit, async (err, ret) => {
                        if (err) {
                            console.log(`[FB] fetchMore ERROR | ${err.message}`);
                            stmt.close();
                            tm.activeStatement = undefined;
                            return wrapReject(err);
                        }
                        console.log(`[FB] fetchMore callback | rows=${ret.data?.length ?? 0} | fetched=${ret.fetched}`);
                        try {
                            const processed = await processResultRows(ret.data || [], encodingConf, columnNames);
                            wrapResolve({
                                rows: processed,
                                hasMore: !ret.fetched && (ret.data?.length === limit)
                            });
                        } catch (readErr) {
                            wrapReject(readErr as Error);
                        }
                    });
                };

                if (reqOffset > 0 && tm.activeStatement &&
                    tm.activeQuery === cleanQuery &&
                    tm.activeConnectionInfo === connectionInfo) {
                    fetchMore(tm.activeStatement as FbStatement);
                } else {
                    if (tm.activeStatement) {
                        try { (tm.activeStatement as FbStatement).close(); } catch (_e) { /* ignore */ }
                        tm.activeStatement = undefined;
                    }

                    console.log(`[FB] newStatement calling...`);
                    trExt.newStatement(queryString, (err, statement) => {
                        if (err) {
                            console.log(`[FB] newStatement ERROR | ${err.message}`);
                            return wrapReject(err);
                        }
                        console.log(`[FB] newStatement callback OK`);
                        executeOnStatement(statement);
                    });
                }
            };

            this._attachAndStartTransaction(id, options, runQuery, wrapReject);
        });
    }

    /**
     * Executes a query to fetch the execution plan against the Firebird database without fetching rows.
     */
    public static async getPlan(id: string, query: string, connection?: DatabaseConnection): Promise<string> {
        const cleanQuery = query.trim().replace(/;$/, '');
        const { options, encodingConf } = await this._prepareForExecution(id, connection);

        return new Promise<string>((resolve, reject) => {
            const tm = TransactionManager.getInstance(id);

            const wrapResolve = (plan: string) => {
                tm.currentReject = undefined;
                tm.resetAutoRollback();
                resolve(plan);
            };
            const wrapReject = (err: Error) => {
                tm.currentReject = undefined;
                tm.resetAutoRollback();
                reject(err);
            };
            tm.currentReject = wrapReject;

            const runGetPlan = (tr: Firebird.Transaction) => {
                const trExt = tr as FbTransactionWithExt;
                const queryString = prepareQueryBuffer(cleanQuery, encodingConf);

                if (tm.activeStatement) {
                    try { (tm.activeStatement as FbStatement).close(); } catch (_e) { /* ignore */ }
                    tm.activeStatement = undefined;
                }

                trExt.connection!.prepare(tr, queryString, true, (err, statement) => {
                    if (err) return wrapReject(err);
                    const planResult = statement.plan || 'No plan available';
                    statement.drop();
                    wrapResolve(planResult);
                });
            };

            // Suppress unused-options warning – options is consumed by the helper.
            void options;
            this._attachAndStartTransaction(id, options, runGetPlan, wrapReject);
        });
    }

    /**
     * Tests that a connection can be established.
     */
    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        return ConnectionChecker.checkConnection(connection);
    }

    // --- Private helpers ---

    /**
     * Validates the connection, builds Firebird options, rolls back any transaction
     * pinned to a different host/database, and pauses the auto-rollback timer.
     */
    private static async _prepareForExecution(id: string, connection: DatabaseConnection | undefined): Promise<PreparedExecution> {
        if (!connection || !connection.database) {
            throw new Error('Database path is not configured. Please select a database in the explorer.');
        }

        const config = vscode.workspace.getConfiguration('firebird');
        const encodingConf = connection.charset || config.get<string>('charset', 'UTF8');
        const options = toFirebirdOptions(connection);

        const tm = TransactionManager.getInstance(id);
        if (tm.db && tm.currentOptions) {
            if (tm.currentOptions.host !== options.host || tm.currentOptions.database !== options.database) {
                await tm.rollback();
            }
        }

        tm.currentOptions = options;
        if (tm.autoRollbackTimer) clearTimeout(tm.autoRollbackTimer);
        tm.autoRollbackDeadline = undefined;

        return { options, encodingConf };
    }

    /**
     * Reuses an existing transaction if present, otherwise reuses or creates the db
     * connection and starts a new READ_COMMITTED transaction. Calls `onTransaction`
     * once a transaction is ready; routes any error through `onError`.
     */
    private static _attachAndStartTransaction(
        id: string,
        options: Firebird.Options,
        onTransaction: (tr: Firebird.Transaction) => void,
        onError: (err: Error) => void
    ): void {
        const tm = TransactionManager.getInstance(id);

        const startTransaction = (db: Firebird.Database) => {
            console.log(`[FB] db.transaction calling...`);
            db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => {
                if (err) {
                    console.log(`[FB] db.transaction ERROR | ${err.message}`);
                    return onError(err);
                }
                console.log(`[FB] db.transaction callback OK`);
                tm.transaction = tr;
                tm.notifyStateChange();
                onTransaction(tr);
            });
        };

        if (tm.transaction) {
            console.log(`[FB] reusing existing transaction`);
            onTransaction(tm.transaction);
            return;
        }

        if (tm.db) {
            console.log(`[FB] reusing existing db connection`);
            startTransaction(tm.db);
            return;
        }

        console.log(`[FB] Firebird.attach calling | host=${options.host} | db=${options.database}`);
        Firebird.attach(options, (err, db) => {
            if (err) {
                console.log(`[FB] Firebird.attach ERROR | ${err.message}`);
                return onError(err);
            }
            console.log(`[FB] Firebird.attach callback OK`);

            (db as FbDatabaseWithEvents).on('error', (dbErr) => {
                console.log(`[FB] db socket error | ${dbErr.message}`);
                if (tm.currentReject) {
                    tm.currentReject(dbErr);
                }
            });

            tm.db = db;
            startTransaction(db);
        });
    }
}
