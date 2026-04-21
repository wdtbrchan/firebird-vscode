import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import { TransactionManager } from './transactionManager';
import { processResultRows, prepareQueryBuffer, getUniqueColumnNames } from './encodingUtils';
import { QueryOptions, QueryResult, DatabaseConnection } from './types';
import { RowCounter } from './rowCounter';
import { ConnectionChecker } from './connectionChecker';

/**
 * Handles query execution, affected row counting, and metadata queries.
 */
export class QueryExecutor {

    /**
     * Runs a simple metadata query using a one-shot connection (no transaction reuse).
     */
    public static async runMetaQuery(id: string, connection: DatabaseConnection, query: string): Promise<any[]> {
        const config = vscode.workspace.getConfiguration('firebird');
        const encodingConf = connection.charset || config.get<string>('charset', 'UTF8');

        const options: Firebird.Options = {
            host: connection.host,
            port: connection.port,
            database: connection.database,
            user: connection.user,
            password: connection.password,
            role: connection.role,
            encoding: 'NONE',
            lowercase_keys: false
        } as any;

        return new Promise((resolve, reject) => {
            Firebird.attach(options, (err, db) => {
                if (err) return reject(err);

                (db as any).on('error', (dbErr: any) => {
                    try { db.detach(); } catch (e) { /* ignore */ }
                    reject(dbErr);
                });

                const finalQuery = prepareQueryBuffer(query, encodingConf);

                db.query(finalQuery, [], async (err, result) => {
                    if (err) {
                        try { db.detach(); } catch (e) { /* ignore */ }
                        return reject(err);
                    }
                    
                    try {
                        const rows = await processResultRows(result, encodingConf);
                        try { db.detach(); } catch (e) { /* ignore */ }
                        resolve(rows);
                    } catch(readErr) {
                         try { db.detach(); } catch (e) { /* ignore */ }
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
        const config = vscode.workspace.getConfiguration('firebird');
        
        const cleanQuery = query.trim().replace(/;$/, '');
        
        // Final query is just the clean query (pagination is handled via cursors)
        const finalQuery = cleanQuery;
        
        const encodingConf = connection?.charset || config.get<string>('charset', 'UTF8');
        const options: Firebird.Options = {
            host: connection?.host || config.get<string>('host', '127.0.0.1'),
            port: connection?.port || config.get<number>('port', 3050),
            database: connection?.database || config.get<string>('database', ''),
            user: connection?.user || config.get<string>('user', 'SYSDBA'),
            password: connection?.password || config.get<string>('password', 'masterkey'),
            role: connection?.role || config.get<string>('role', ''),
            encoding: 'NONE', 
            lowercase_keys: false
        } as any;

        if (!options.database) {
            throw new Error('Database path is not configured. Please select a database in the explorer or set "firebird.database" in settings.');
        }

        if (TransactionManager.getInstance(id).db && TransactionManager.getInstance(id).currentOptions) {
            if (TransactionManager.getInstance(id).currentOptions!.host !== options.host ||
                TransactionManager.getInstance(id).currentOptions!.database !== options.database) {
                 await TransactionManager.getInstance(id).rollback(); 
            }
        }

        TransactionManager.getInstance(id).currentOptions = options;
        
        // Stop auto-rollback while executing
        if (TransactionManager.getInstance(id).autoRollbackTimer) clearTimeout(TransactionManager.getInstance(id).autoRollbackTimer);
        TransactionManager.getInstance(id).autoRollbackDeadline = undefined;

        return new Promise((resolve, reject) => {
            const wrapResolve = (res: QueryResult) => {
                TransactionManager.getInstance(id).currentReject = undefined;
                TransactionManager.getInstance(id).resetAutoRollback();
                resolve(res);
            };
            const wrapReject = (err: any) => {
                TransactionManager.getInstance(id).currentReject = undefined;
                TransactionManager.getInstance(id).resetAutoRollback();
                reject(err);
            };

            TransactionManager.getInstance(id).currentReject = wrapReject;

            const runQuery = (tr: Firebird.Transaction) => {
                const trAny = tr as any; // Access internal methods
                const queryString = prepareQueryBuffer(finalQuery, encodingConf);
                const limit = queryOptions?.limit || 1000;
                const offset = queryOptions?.offset || 0;
                const connectionInfo = `${options.host}:${options.database}`;

                const executeOnStatement = (stmt: any) => {
                    stmt.execute(tr, [], async (err: any, result: any, output: any, isSelect: boolean) => {
                        if (err) return wrapReject(err);
                        
                        if (isSelect === undefined) {
                             isSelect = (stmt.type === 1); 
                        }

                        if (isSelect) {
                            TransactionManager.getInstance(id).activeStatement = stmt;
                            TransactionManager.getInstance(id).activeQuery = finalQuery;
                            TransactionManager.getInstance(id).activeConnectionInfo = connectionInfo;

                            const columnNames = getUniqueColumnNames(stmt.output);
                            stmt.fetch(tr, limit, async (err: any, ret: any) => {
                                if (err) {
                                    stmt.close();
                                    TransactionManager.getInstance(id).activeStatement = undefined;
                                    return wrapReject(err);
                                }
                                
                                try {
                                    const processed = await processResultRows(ret.data || [], encodingConf, columnNames);
                                    wrapResolve({ 
                                        rows: processed, 
                                        hasMore: !ret.fetched && (ret.data?.length === limit)
                                    });
                                } catch (readErr) {
                                    wrapReject(readErr);
                                }
                            });
                        } else {
                            const dmlType = RowCounter.detectDmlType(cleanQuery);
                            let affectedRows: number | undefined;
                            try {
                                affectedRows = await RowCounter.getAffectedRows(stmt, tr, dmlType);
                            } catch (e) { /* ignore */ }

                            stmt.close(); 
                            TransactionManager.getInstance(id).activeStatement = undefined;
                            wrapResolve({ rows: [], affectedRows });
                        }
                    }, { asObject: false });
                };

                const fetchMore = (stmt: any) => {
                    const columnNames = getUniqueColumnNames(stmt.output);
                    stmt.fetch(tr, limit, async (err: any, ret: any) => {
                        if (err) {
                            stmt.close();
                            TransactionManager.getInstance(id).activeStatement = undefined;
                            return wrapReject(err);
                        }
                        
                        try {
                            const processed = await processResultRows(ret.data || [], encodingConf, columnNames);
                            wrapResolve({ 
                                rows: processed, 
                                hasMore: !ret.fetched && (ret.data?.length === limit)
                            });
                        } catch (readErr) {
                            wrapReject(readErr);
                        }
                    });
                };

                // Logic for reusing statement
                if (offset > 0 && TransactionManager.getInstance(id).activeStatement && 
                    TransactionManager.getInstance(id).activeQuery === finalQuery && 
                    TransactionManager.getInstance(id).activeConnectionInfo === connectionInfo) {
                    fetchMore(TransactionManager.getInstance(id).activeStatement);
                } else {
                    // Start new query
                    if (TransactionManager.getInstance(id).activeStatement) {
                        try { TransactionManager.getInstance(id).activeStatement.close(); } catch (e) { /* ignore */ }
                        TransactionManager.getInstance(id).activeStatement = undefined;
                    }
                    
                    trAny.newStatement(queryString, (err: any, statement: any) => {
                        if (err) return wrapReject(err);
                        executeOnStatement(statement);
                    });
                }
            };

            if (TransactionManager.getInstance(id).transaction) {
                runQuery(TransactionManager.getInstance(id).transaction!);
            } else {
                const doAttach = (cb: (db: Firebird.Database) => void) => {
                    if (TransactionManager.getInstance(id).db) {
                        cb(TransactionManager.getInstance(id).db!);
                    } else {
                        Firebird.attach(options, (err, db) => {
                            if (err) return wrapReject(err);
                            
                            (db as any).on('error', (dbErr: any) => {
                                if (TransactionManager.getInstance(id).currentReject) {
                                    TransactionManager.getInstance(id).currentReject!(dbErr);
                                }
                            });
                            
                            TransactionManager.getInstance(id).db = db;
                            cb(db);
                        });
                    }
                };

                doAttach((db) => {
                    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => {
                        if (err) return wrapReject(err);
                        TransactionManager.getInstance(id).transaction = tr;
                        TransactionManager.getInstance(id).notifyStateChange(); 
                        runQuery(tr);
                    });
                });
            }
        });
    }

    /**
     * Executes a query to fetch the execution plan against the Firebird database without fetching rows.
     */
    public static async getPlan(id: string, query: string, connection?: DatabaseConnection): Promise<string> {
        const config = vscode.workspace.getConfiguration('firebird');
        
        const cleanQuery = query.trim().replace(/;$/, '');
        const finalQuery = cleanQuery;
        
        const encodingConf = connection?.charset || config.get<string>('charset', 'UTF8');
        const options: Firebird.Options = {
            host: connection?.host || config.get<string>('host', '127.0.0.1'),
            port: connection?.port || config.get<number>('port', 3050),
            database: connection?.database || config.get<string>('database', ''),
            user: connection?.user || config.get<string>('user', 'SYSDBA'),
            password: connection?.password || config.get<string>('password', 'masterkey'),
            role: connection?.role || config.get<string>('role', ''),
            encoding: 'NONE', 
            lowercase_keys: false
        } as any;

        if (!options.database) {
            throw new Error('Database path is not configured. Please select a database in the explorer or set "firebird.database" in settings.');
        }

        if (TransactionManager.getInstance(id).db && TransactionManager.getInstance(id).currentOptions) {
            if (TransactionManager.getInstance(id).currentOptions!.host !== options.host ||
                TransactionManager.getInstance(id).currentOptions!.database !== options.database) {
                 await TransactionManager.getInstance(id).rollback(); 
            }
        }

        TransactionManager.getInstance(id).currentOptions = options;
        
        // Stop auto-rollback while executing
        if (TransactionManager.getInstance(id).autoRollbackTimer) clearTimeout(TransactionManager.getInstance(id).autoRollbackTimer);
        TransactionManager.getInstance(id).autoRollbackDeadline = undefined;

        return new Promise((resolve, reject) => {
            const wrapResolve = (plan: string) => {
                TransactionManager.getInstance(id).currentReject = undefined;
                TransactionManager.getInstance(id).resetAutoRollback();
                resolve(plan);
            };
            const wrapReject = (err: any) => {
                TransactionManager.getInstance(id).currentReject = undefined;
                TransactionManager.getInstance(id).resetAutoRollback();
                reject(err);
            };

            TransactionManager.getInstance(id).currentReject = wrapReject;

            const runGetPlan = (tr: Firebird.Transaction) => {
                const trAny = tr as any;
                const queryString = prepareQueryBuffer(finalQuery, encodingConf);

                if (TransactionManager.getInstance(id).activeStatement) {
                    try { TransactionManager.getInstance(id).activeStatement.close(); } catch (e) { /* ignore */ }
                    TransactionManager.getInstance(id).activeStatement = undefined;
                }
                
                trAny.connection.prepare(tr, queryString, true, (err: any, statement: any) => {
                    if (err) return wrapReject(err);
                    const planResult = statement.plan || 'No plan available';
                    statement.drop(); // Release the statement immediately
                    wrapResolve(planResult);
                });
            };

            if (TransactionManager.getInstance(id).transaction) {
                runGetPlan(TransactionManager.getInstance(id).transaction!);
            } else {
                const doAttach = (cb: (db: Firebird.Database) => void) => {
                    if (TransactionManager.getInstance(id).db) {
                        cb(TransactionManager.getInstance(id).db!);
                    } else {
                        Firebird.attach(options, (err, db) => {
                            if (err) return wrapReject(err);
                            
                            (db as any).on('error', (dbErr: any) => {
                                if (TransactionManager.getInstance(id).currentReject) {
                                    TransactionManager.getInstance(id).currentReject!(dbErr);
                                }
                            });
                            
                            TransactionManager.getInstance(id).db = db;
                            cb(db);
                        });
                    }
                };

                doAttach((db) => {
                    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => {
                        if (err) return wrapReject(err);
                        TransactionManager.getInstance(id).transaction = tr;
                        TransactionManager.getInstance(id).notifyStateChange(); 
                        runGetPlan(tr);
                    });
                });
            }
        });
    }

    /**
     * Tests that a connection can be established.
     */
    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        return ConnectionChecker.checkConnection(connection);
    }
}
