import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import { TransactionManager } from './transactionManager';
import { processResultRows, getUniqueColumnNames } from './encodingUtils';
import { QueryOptions, QueryResult, DatabaseConnection } from './types';
import { RowCounter } from './rowCounter';
import { ConnectionChecker } from './connectionChecker';
import { DRIVER_TEXT_ENCODING, toFirebirdOptions } from './connectionOptions';
import { FirebirdLog } from '../logger';

interface PreparedExecution {
    options: Firebird.Options;
    encodingConf: string;
}

interface OperationTimeouts {
    connection: number;
    driver: number;
    query: number;
    blob: number;
}

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
    newStatement?(query: string, cb: (err: FbErr | null, statement: FbStatement) => void): void;
    connection?: FbConnection;
}

interface FbDatabaseWithEvents extends Firebird.Database {
    on(event: 'error', cb: (err: FbErr) => void): void;
}

/**
 * Idempotent bridge between node-firebird callbacks and a Promise. It owns a
 * per-editor operation id, a stage timeout, and ignores every late callback.
 */
class DriverOperation<T> {
    public readonly id: number;
    private settled = false;
    private stage = 'initializing';
    private stageTimer: NodeJS.Timeout | undefined;
    private readonly pendingLogTimer: NodeJS.Timeout;
    private readonly startedAt = performance.now();

    constructor(
        private readonly manager: TransactionManager,
        private readonly resolvePromise: (value: T) => void,
        private readonly rejectPromise: (reason?: unknown) => void,
        private readonly label: string
    ) {
        this.id = manager.beginOperation(err => this.reject(err));
        this.pendingLogTimer = setInterval(() => {
            FirebirdLog.info(`[FB] ${this.label} PENDING | operation=${this.id} | stage=${this.stage} | elapsed=${this.elapsed()}s`);
        }, 15_000);
    }

    public isActive(): boolean {
        return !this.settled && this.manager.isOperationActive(this.id);
    }

    public setStage(stage: string, timeoutMs: number): void {
        if (!this.isActive()) return;
        this.stage = stage;
        if (this.stageTimer) clearTimeout(this.stageTimer);
        this.stageTimer = undefined;

        if (timeoutMs > 0) {
            this.stageTimer = setTimeout(() => {
                const seconds = Math.max(1, Math.round(timeoutMs / 1000));
                const error = new Error(`Firebird request timed out during ${stage} after ${seconds} seconds.`);
                this.manager.abortOperation(this.id, error, 'Timed out', true);
                FirebirdLog.error(`[FB] ${this.label} TIMEOUT | operation=${this.id} | stage=${stage}`);
            }, timeoutMs);
        }
    }

    public invoke(callback: () => void, onStale?: () => void): void {
        if (!this.isActive()) {
            onStale?.();
            return;
        }
        try {
            callback();
        } catch (err) {
            this.reject(QueryExecutor.asError(err));
        }
    }

    public resolve(value: T): void {
        if (this.settled) return;
        this.settled = true;
        this.clearTimers();
        this.manager.completeOperation(this.id);
        this.resolvePromise(value);
        try {
            this.manager.resetAutoRollback();
        } catch (err) {
            FirebirdLog.error('[FB] Failed to reset auto-rollback after query completion', err);
        }
        FirebirdLog.info(`[FB] ${this.label} RESOLVE | operation=${this.id} | elapsed=${this.elapsed()}s`);
    }

    public reject(err: Error): void {
        if (this.settled) return;
        this.settled = true;
        this.clearTimers();
        this.manager.completeOperation(this.id);
        this.rejectPromise(err);
        try {
            this.manager.resetAutoRollback();
        } catch (resetErr) {
            FirebirdLog.error('[FB] Failed to reset auto-rollback after query failure', resetErr);
        }
        FirebirdLog.error(`[FB] ${this.label} REJECT | operation=${this.id} | elapsed=${this.elapsed()}s | message=${err.message}`);
    }

    private clearTimers(): void {
        clearInterval(this.pendingLogTimer);
        if (this.stageTimer) clearTimeout(this.stageTimer);
        this.stageTimer = undefined;
    }

    private elapsed(): string {
        return ((performance.now() - this.startedAt) / 1000).toFixed(3);
    }
}

/** Handles query execution, affected row counting, and metadata queries. */
export class QueryExecutor {
    public static async runMetaQuery(id: string, connection: DatabaseConnection, query: string): Promise<Record<string, unknown>[]> {
        const encodingConf = DRIVER_TEXT_ENCODING;
        const options = toFirebirdOptions(connection);
        const timeouts = this.getTimeouts();

        return new Promise((resolve, reject) => {
            let settled = false;
            let db: Firebird.Database | undefined;
            let timer: NodeJS.Timeout | undefined;

            const armTimeout = (stage: string, timeoutMs: number) => {
                if (timer) clearTimeout(timer);
                timer = undefined;
                if (timeoutMs <= 0) return;
                timer = setTimeout(() => {
                    finishReject(new Error(`Firebird metadata request timed out during ${stage} after ${Math.round(timeoutMs / 1000)} seconds.`), true);
                }, timeoutMs);
            };

            const cleanup = (force: boolean) => {
                if (!db) return;
                const current = db;
                db = undefined;
                this.closeDatabase(current, force);
            };

            const finishResolve = (rows: Record<string, unknown>[]) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                cleanup(false);
                resolve(rows);
            };

            const finishReject = (err: Error, force: boolean = false) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                cleanup(force);
                FirebirdLog.error(`[FB] Metadata query failed | id=${id} | message=${err.message}`);
                reject(err);
            };

            armTimeout('connecting', timeouts.connection);
            try {
                Firebird.attach(options, (err, attachedDb) => {
                    if (settled) {
                        if (attachedDb) this.closeDatabase(attachedDb, false);
                        return;
                    }
                    if (err) return finishReject(err);

                    db = attachedDb;
                    (attachedDb as FbDatabaseWithEvents).on('error', dbErr => {
                        if (!settled && db === attachedDb) finishReject(dbErr, true);
                    });

                    armTimeout('executing metadata query', timeouts.driver);
                    try {
                        attachedDb.query(query, [], (queryErr, result) => {
                            if (settled) return;
                            if (queryErr) return finishReject(queryErr);

                            void processResultRows(result, encodingConf, undefined, timeouts.blob)
                                .then(finishResolve)
                                .catch(readErr => finishReject(this.asError(readErr), true));
                        });
                    } catch (queryErr) {
                        finishReject(this.asError(queryErr), true);
                    }
                });
            } catch (attachErr) {
                finishReject(this.asError(attachErr), true);
            }
        });
    }

    public static async executeQuery(id: string, query: string, connection?: DatabaseConnection, queryOptions?: QueryOptions): Promise<QueryResult> {
        const cleanQuery = query.trim().replace(/;$/, '');
        const offset = queryOptions?.offset || 0;
        const qPreview = cleanQuery.replace(/\s+/g, ' ').substring(0, 60);
        FirebirdLog.info(`[FB] QueryExecutor.executeQuery START | id=${id} | offset=${offset} | query="${qPreview}"`);

        return new Promise<QueryResult>((resolve, reject) => {
            const manager = TransactionManager.getInstance(id);
            let operation: DriverOperation<QueryResult>;
            try {
                operation = new DriverOperation(manager, resolve, reject, 'QueryExecutor.executeQuery');
            } catch (err) {
                reject(this.asError(err));
                return;
            }

            const timeouts = this.getTimeouts();
            operation.setStage('preparing execution', timeouts.driver);

            void this._prepareForExecution(id, connection)
                .then(({ options, encodingConf }) => {
                    operation.invoke(() => {
                        this._attachAndStartTransaction(id, options, operation, timeouts, tr => {
                            this.executeOnTransaction(
                                manager,
                                operation,
                                tr,
                                cleanQuery,
                                options,
                                encodingConf,
                                queryOptions,
                                timeouts
                            );
                        });
                    });
                })
                .catch(err => operation.reject(this.asError(err)));
        });
    }

    public static async getPlan(id: string, query: string, connection?: DatabaseConnection): Promise<string> {
        const cleanQuery = query.trim().replace(/;$/, '');

        return new Promise<string>((resolve, reject) => {
            const manager = TransactionManager.getInstance(id);
            let operation: DriverOperation<string>;
            try {
                operation = new DriverOperation(manager, resolve, reject, 'QueryExecutor.getPlan');
            } catch (err) {
                reject(this.asError(err));
                return;
            }

            const timeouts = this.getTimeouts();
            operation.setStage('preparing execution plan', timeouts.driver);
            void this._prepareForExecution(id, connection)
                .then(({ options }) => {
                    operation.invoke(() => {
                        this._attachAndStartTransaction(id, options, operation, timeouts, tr => {
                            operation.invoke(() => {
                                const trExt = tr as FbTransactionWithExt;
                                const fbConnection = trExt.connection;
                                if (!fbConnection) {
                                    operation.reject(new Error('Firebird transaction does not expose a connection for preparing the execution plan.'));
                                    return;
                                }

                                if (manager.activeStatement) {
                                    this.closeStatement(manager.activeStatement as FbStatement);
                                    manager.activeStatement = undefined;
                                }

                                operation.setStage('preparing execution plan', timeouts.driver);
                                fbConnection.prepare(tr, cleanQuery, true, (err, statement) => {
                                    operation.invoke(() => {
                                        if (err) {
                                            operation.reject(err);
                                            return;
                                        }
                                        const planResult = statement.plan || 'No plan available';
                                        this.dropStatement(statement);
                                        operation.resolve(planResult);
                                    }, () => {
                                        if (statement) this.dropStatement(statement);
                                    });
                                });
                            });
                        });
                    });
                })
                .catch(err => operation.reject(this.asError(err)));
        });
    }

    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        return ConnectionChecker.checkConnection(connection);
    }

    private static executeOnTransaction(
        manager: TransactionManager,
        operation: DriverOperation<QueryResult>,
        tr: Firebird.Transaction,
        cleanQuery: string,
        options: Firebird.Options,
        encodingConf: string,
        queryOptions: QueryOptions | undefined,
        timeouts: OperationTimeouts
    ): void {
        operation.invoke(() => {
            const trExt = tr as FbTransactionWithExt;
            const limit = queryOptions?.limit || 1000;
            const reqOffset = queryOptions?.offset || 0;
            const connectionInfo = `${options.host}:${options.database}`;

            const finishRows = (stmt: FbStatement, ret: FbFetchResult) => {
                const columnNames = getUniqueColumnNames(stmt.output);
                const hasMore = !ret.fetched && (ret.data?.length === limit);
                operation.setStage('processing result rows', Math.max(timeouts.driver, timeouts.blob));
                void processResultRows(ret.data || [], encodingConf, columnNames, timeouts.blob)
                    .then(processed => {
                        operation.invoke(() => {
                            if (!hasMore) {
                                this.closeStatement(stmt);
                                if (manager.activeStatement === stmt) manager.activeStatement = undefined;
                                manager.activeQuery = undefined;
                                manager.activeConnectionInfo = undefined;
                            }
                            operation.resolve({ rows: processed, hasMore });
                        }, () => this.closeStatement(stmt));
                    })
                    .catch(readErr => {
                        const error = this.asError(readErr);
                        manager.abortOperation(operation.id, error, 'Failed reading results', true);
                    });
            };

            const fetchRows = (stmt: FbStatement, stage: string) => {
                operation.setStage(stage, timeouts.driver);
                stmt.fetch(tr, limit, (fetchErr, ret) => {
                    operation.invoke(() => {
                        if (fetchErr) {
                            this.closeStatement(stmt);
                            if (manager.activeStatement === stmt) manager.activeStatement = undefined;
                            operation.reject(fetchErr);
                            return;
                        }
                        finishRows(stmt, ret);
                    }, () => this.closeStatement(stmt));
                });
            };

            const executeStatement = (stmt: FbStatement) => {
                operation.setStage('executing SQL statement', timeouts.query);
                stmt.execute(tr, [], (err, _result, _output, rawIsSelect) => {
                    operation.invoke(() => {
                        if (err) {
                            this.closeStatement(stmt);
                            operation.reject(err);
                            return;
                        }

                        const isSelect = rawIsSelect === undefined ? stmt.type === 1 : rawIsSelect;
                        if (isSelect) {
                            manager.activeStatement = stmt;
                            manager.activeQuery = cleanQuery;
                            manager.activeConnectionInfo = connectionInfo;
                            fetchRows(stmt, 'fetching result rows');
                            return;
                        }

                        void (async () => {
                            try {
                                const dmlType = RowCounter.detectDmlType(cleanQuery);
                                let affectedRows: number | undefined;
                                try {
                                    affectedRows = await RowCounter.getAffectedRows(stmt, tr, dmlType);
                                } catch (rowCountErr) {
                                    FirebirdLog.error('[FB] Unable to read affected row count', rowCountErr);
                                }

                                operation.invoke(() => {
                                    this.closeStatement(stmt);
                                    manager.activeStatement = undefined;
                                    operation.resolve({ rows: [], affectedRows });
                                }, () => this.closeStatement(stmt));
                            } catch (asyncErr) {
                                operation.reject(this.asError(asyncErr));
                            }
                        })();
                    }, () => this.closeStatement(stmt));
                }, { asObject: false });
            };

            if (reqOffset > 0) {
                if (manager.activeStatement && manager.activeQuery === cleanQuery && manager.activeConnectionInfo === connectionInfo) {
                    fetchRows(manager.activeStatement as FbStatement, 'fetching more result rows');
                } else {
                    operation.reject(new Error('The result cursor is no longer available. Run the query again.'));
                }
                return;
            }

            if (manager.activeStatement) {
                this.closeStatement(manager.activeStatement as FbStatement);
                manager.activeStatement = undefined;
            }

            if (!trExt.newStatement) {
                operation.reject(new Error('Firebird transaction does not support statement creation.'));
                return;
            }

            operation.setStage('creating SQL statement', timeouts.driver);
            trExt.newStatement(cleanQuery, (err, statement) => {
                operation.invoke(() => {
                    if (err) {
                        operation.reject(err);
                        return;
                    }
                    executeStatement(statement);
                }, () => {
                    if (statement) this.closeStatement(statement);
                });
            });
        });
    }

    private static async _prepareForExecution(id: string, connection: DatabaseConnection | undefined): Promise<PreparedExecution> {
        if (!connection || !connection.database) {
            throw new Error('Database path is not configured. Please select a database in the explorer.');
        }

        const encodingConf = DRIVER_TEXT_ENCODING;
        const options = toFirebirdOptions(connection);

        const manager = TransactionManager.getInstance(id);
        manager.pauseAutoRollback();
        if (manager.db && manager.currentOptions) {
            if (manager.currentOptions.host !== options.host || manager.currentOptions.database !== options.database) {
                // The operation slot is held, so roll back through a dedicated
                // cleanup path instead of starting a competing transaction action.
                manager.cleanupConnection(true);
                manager.notifyStateChange('Connection changed');
            }
        }

        manager.currentOptions = options;
        return { options, encodingConf };
    }

    private static _attachAndStartTransaction<T>(
        id: string,
        options: Firebird.Options,
        operation: DriverOperation<T>,
        timeouts: OperationTimeouts,
        onTransaction: (tr: Firebird.Transaction) => void
    ): void {
        const manager = TransactionManager.getInstance(id);

        const startTransaction = (db: Firebird.Database) => {
            operation.setStage('starting transaction', timeouts.driver);
            operation.invoke(() => {
                db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => {
                    operation.invoke(() => {
                        if (err) {
                            manager.abortOperation(operation.id, err, 'Transaction failed', true);
                            return;
                        }
                        manager.transaction = tr;
                        manager.notifyStateChange();
                        onTransaction(tr);
                    }, () => {
                        if (tr) this.rollbackStaleTransaction(tr);
                    });
                });
            });
        };

        if (manager.transaction) {
            operation.invoke(() => onTransaction(manager.transaction!));
            return;
        }

        if (manager.db) {
            startTransaction(manager.db);
            return;
        }

        operation.setStage('connecting to Firebird', timeouts.connection);
        operation.invoke(() => {
            Firebird.attach(options, (err, db) => {
                operation.invoke(() => {
                    if (err) {
                        operation.reject(err);
                        return;
                    }

                    (db as FbDatabaseWithEvents).on('error', dbErr => {
                        manager.handleConnectionError(db, dbErr);
                    });
                    manager.db = db;
                    startTransaction(db);
                }, () => {
                    if (db) this.closeDatabase(db, false);
                });
            });
        });
    }

    private static getTimeouts(): OperationTimeouts {
        return {
            connection: this.getTimeoutMs('connectionTimeout', 15_000),
            driver: this.getTimeoutMs('driverOperationTimeout', 30_000),
            query: this.getTimeoutMs('queryTimeout', 7_200_000),
            blob: this.getTimeoutMs('blobReadTimeout', 30_000)
        };
    }

    private static getTimeoutMs(key: string, fallbackMs: number): number {
        try {
            const seconds = vscode.workspace.getConfiguration('firebird').get<number>(key, fallbackMs / 1000);
            return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
                ? seconds * 1000
                : 0;
        } catch (err) {
            FirebirdLog.error(`[FB] Unable to read timeout setting ${key}; using default`, err);
            return fallbackMs;
        }
    }

    private static closeStatement(statement: FbStatement): void {
        try {
            statement.close();
        } catch (err) {
            FirebirdLog.error('[FB] Statement close failed', err);
        }
    }

    private static dropStatement(statement: FbStatement): void {
        try {
            statement.drop();
        } catch (err) {
            FirebirdLog.error('[FB] Statement drop failed', err);
        }
    }

    private static rollbackStaleTransaction(transaction: Firebird.Transaction): void {
        try {
            transaction.rollback(err => {
                if (err) FirebirdLog.error('[FB] Failed to roll back stale transaction', err);
            });
        } catch (err) {
            FirebirdLog.error('[FB] Failed to roll back stale transaction', err);
        }
    }

    private static closeDatabase(db: Firebird.Database, force: boolean): void {
        try {
            if (force) {
                interface InternalSocket { destroy?(): void }
                interface InternalDbConnection { _socket?: InternalSocket; destroy?(): void }
                interface InternalDb { connection?: InternalDbConnection; destroy?(): void }
                const internal = db as unknown as InternalDb;
                const connection = internal.connection;
                if (connection?._socket?.destroy) connection._socket.destroy();
                else if (connection?.destroy) connection.destroy();
                else if (internal.destroy) internal.destroy();
                else db.detach();
            } else {
                db.detach();
            }
        } catch (err) {
            FirebirdLog.error('[FB] Database close failed', err);
        }
    }

    public static asError(err: unknown): Error {
        return err instanceof Error ? err : new Error(String(err));
    }
}
