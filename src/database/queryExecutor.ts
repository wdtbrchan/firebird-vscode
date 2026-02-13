import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import { TransactionManager } from './transactionManager';
import { processResultRows, prepareQueryBuffer } from './encodingUtils';
import { QueryOptions, QueryResult } from './types';
import { applyPagination } from './paginationUtils';

/**
 * Handles query execution, affected row counting, and metadata queries.
 */
export class QueryExecutor {

    /**
     * Runs a simple metadata query using a one-shot connection (no transaction reuse).
     */
    public static async runMetaQuery(connection: any, query: string): Promise<any[]> {
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

                const finalQuery = prepareQueryBuffer(query, encodingConf);

                db.query(finalQuery, [], async (err, result) => {
                    if (err) {
                        try { db.detach(); } catch(e) {}
                        return reject(err);
                    }
                    
                    try {
                        const rows = await processResultRows(result, encodingConf);
                        try { db.detach(); } catch(e) {}
                        resolve(rows);
                    } catch(readErr) {
                         try { db.detach(); } catch(e) {}
                         reject(readErr);
                    }
                });
            });
        });
    }

    /**
     * Detects the DML type from a SQL query string.
     */
    private static detectDmlType(query: string): 'insert' | 'update' | 'delete' | undefined {
        const trimmed = query.replace(/^\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '').trim();
        const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();
        if (firstWord === 'INSERT' || firstWord === 'MERGE') return 'insert';
        if (firstWord === 'UPDATE') return 'update';
        if (firstWord === 'DELETE') return 'delete';
        return undefined;
    }

    /**
     * Fetches affected row count from a statement using internal Firebird protocol.
     * When dmlType is specified, returns only the count for that specific operation type.
     */
    public static async getAffectedRows(statement: any, transaction: any, dmlType?: 'insert' | 'update' | 'delete'): Promise<number | undefined> {
        return new Promise((resolve) => {
            if (!transaction || !transaction.connection || !transaction.connection._msg || !statement || !statement.handle) {
                resolve(undefined);
                return;
            }

            const connection = transaction.connection;
            const msg = connection._msg;
            // Constants
            const OP_INFO_SQL = 70; // Correct opcode (was incorrectly 19)
            const ISC_INFO_SQL_RECORDS = 23;
            const ISC_INFO_REQ_SELECT_COUNT = 13;
            const ISC_INFO_REQ_INSERT_COUNT = 14;
            const ISC_INFO_REQ_UPDATE_COUNT = 15;
            const ISC_INFO_REQ_DELETE_COUNT = 16;
            const ISC_INFO_END = 1;

            let timeoutId: NodeJS.Timeout;

            try {
                // Construct OP_INFO_SQL packet manually (XDR encoding)
                msg.pos = 0;
                msg.addInt(OP_INFO_SQL);
                msg.addInt(statement.handle);
                msg.addInt(0); // incarnation
                
                // Request records count - encoded as XDR string (length + bytes + padding)
                const infoBuffer = Buffer.from([ISC_INFO_SQL_RECORDS, ISC_INFO_END]);
                msg.addInt(infoBuffer.length);
                msg.addBuffer(infoBuffer); 
                msg.addAlignment(infoBuffer.length);

                msg.addInt(1024); // Buffer length for response

                // Set up timeout to prevent hanging
                timeoutId = setTimeout(() => {
                    resolve(undefined);
                }, 5000); // 5s timeout

                connection._queueEvent((err: any, response: any) => {
                    clearTimeout(timeoutId);
                    if (err || !response || !response.buffer) {
                        resolve(undefined);
                        return;
                    }

                    try {
                        const buf: Buffer = response.buffer;
                        let pos = 0;
                        let totalAffected = 0;
                        let found = false;

                        while (pos < buf.length) {
                            const type = buf[pos++];
                            if (type === ISC_INFO_END) break;

                            const len = buf.readUInt16LE(pos);
                            pos += 2;
                            
                            if (type === ISC_INFO_SQL_RECORDS) {
                                let subPos = pos;
                                const subEnd = pos + len;
                                while (subPos < subEnd) {
                                    const reqType = buf[subPos++];
                                    if (reqType === ISC_INFO_END) break;
                                    
                                    const reqLen = buf.readUInt16LE(subPos);
                                    subPos += 2;
                                    
                                    const count = buf.readUInt32LE(subPos);
                                    subPos += reqLen; // Should be 4

                                    if (dmlType) {
                                        // Return only the count for the specific DML type
                                        if ((dmlType === 'insert' && reqType === ISC_INFO_REQ_INSERT_COUNT) ||
                                            (dmlType === 'update' && reqType === ISC_INFO_REQ_UPDATE_COUNT) ||
                                            (dmlType === 'delete' && reqType === ISC_INFO_REQ_DELETE_COUNT)) {
                                            totalAffected += count;
                                            found = true;
                                        }
                                    } else {
                                        // Fallback: sum all DML counts
                                        if (reqType === ISC_INFO_REQ_INSERT_COUNT || 
                                            reqType === ISC_INFO_REQ_UPDATE_COUNT || 
                                            reqType === ISC_INFO_REQ_DELETE_COUNT) {
                                            totalAffected += count;
                                            found = true;
                                        }
                                    }
                                }
                            }
                            
                            pos += len;
                        }
                        
                        resolve(found ? totalAffected : undefined);
                    } catch (e) {
                        resolve(undefined);
                    }
                });
            } catch (e) {
                if (timeoutId!) clearTimeout(timeoutId);
                resolve(undefined);
            }
        });
    }

    /**
     * Executes a query against the Firebird database.
     * Handles SELECT pagination, DML affected rows, transaction reuse, and encoding.
     */
    public static async executeQuery(query: string, connection?: { host: string, port: number, database: string, user: string, password?: string, role?: string, charset?: string }, queryOptions?: QueryOptions): Promise<QueryResult> {
        const config = vscode.workspace.getConfiguration('firebird');
        
        const cleanQuery = query.trim().replace(/;$/, '');
        
        // Use the helper method for pagination
        const finalQuery = applyPagination(cleanQuery, queryOptions);
        
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

        if (TransactionManager.db && TransactionManager.currentOptions) {
            if (TransactionManager.currentOptions.host !== options.host ||
                TransactionManager.currentOptions.database !== options.database) {
                 await TransactionManager.rollback(); 
            }
        }

        TransactionManager.currentOptions = options;
        
        // Stop auto-rollback while executing
        if (TransactionManager.autoRollbackTimer) clearTimeout(TransactionManager.autoRollbackTimer);
        TransactionManager.autoRollbackDeadline = undefined;

        return new Promise((resolve, reject) => {
            const wrapResolve = (res: QueryResult) => {
                TransactionManager.resetAutoRollback();
                resolve(res);
            };
            const wrapReject = (err: any) => {
                TransactionManager.resetAutoRollback();
                reject(err);
            };

            const runQuery = (tr: Firebird.Transaction) => {
                const trAny = tr as any; // Access internal methods
                const queryString = prepareQueryBuffer(finalQuery, encodingConf);

                trAny.newStatement(queryString, (err: any, statement: any) => {
                    if (err) return wrapReject(err);
                    
                    // Pass { asObject: true } to get rows as objects with column names
                    statement.execute(tr, [], async (err: any, result: any, output: any, isSelect: boolean) => {
                        if (err) return wrapReject(err);
                        
                        // Fallback logic for isSelect if it's undefined
                        if (isSelect === undefined) {
                             // Check statement type: 1 = SELECT
                             isSelect = (statement.type === 1); 
                        }

                        if (isSelect) {
                            statement.fetchAll(tr, async (err: any, rows: any[]) => {
                                if (err) {
                                    statement.close();
                                    return wrapReject(err);
                                }
                                
                                statement.close();
                                
                                try {
                                    const processed = await processResultRows(rows, encodingConf);
                                    wrapResolve({ rows: processed });
                                } catch (readErr) {
                                    wrapReject(readErr);
                                }
                            });
                        } else {
                            // DML (Insert/Update/Delete) or DDL
                            const dmlType = this.detectDmlType(cleanQuery);
                            let affectedRows: number | undefined;
                            try {
                                affectedRows = await this.getAffectedRows(statement, tr, dmlType);
                            } catch (e) {
                                // Ignore error fetching affected rows
                            }

                            statement.close(); 
                            wrapResolve({ rows: [], affectedRows });
                        }
                    }, { asObject: true });
                });
            };

            if (TransactionManager.transaction) {
                runQuery(TransactionManager.transaction);
            } else {
                const doAttach = (cb: (db: Firebird.Database) => void) => {
                    if (TransactionManager.db) {
                        cb(TransactionManager.db);
                    } else {
                        Firebird.attach(options, (err, db) => {
                            if (err) return wrapReject(err);
                            TransactionManager.db = db;
                            cb(db);
                        });
                    }
                };

                doAttach((db) => {
                    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => {
                        if (err) return wrapReject(err);
                        TransactionManager.transaction = tr;
                        TransactionManager.notifyStateChange(); 
                        runQuery(tr);
                    });
                });
            }
        });
    }

    /**
     * Tests that a connection can be established.
     */
    public static async checkConnection(connection: any): Promise<void> {
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
                try {
                    db.detach();
                } catch (e) {}
                resolve();
            });
        });
    }
}
