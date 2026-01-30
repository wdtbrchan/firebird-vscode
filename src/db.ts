import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import * as iconv from 'iconv-lite';

export interface QueryOptions {
    limit?: number;
    offset?: number;
}

export class Database {
    private static db: Firebird.Database | undefined;
    private static transaction: Firebird.Transaction | undefined;
    private static autoRollbackTimer: NodeJS.Timeout | undefined;
    private static currentOptions: Firebird.Options | undefined;

    private static onStateChangeHandlers: ((hasTransaction: boolean) => void)[] = [];

    public static onTransactionChange(handler: (hasTransaction: boolean) => void) {
        this.onStateChangeHandlers.push(handler);
    }

    private static notifyStateChange() {
        const isActive = this.hasActiveTransaction;
        this.onStateChangeHandlers.forEach(h => h(isActive));
    }

    public static async executeQuery(query: string, connection?: { host: string, port: number, database: string, user: string, password?: string, role?: string, charset?: string }, queryOptions?: QueryOptions): Promise<any[]> {
        const config = vscode.workspace.getConfiguration('firebird');
        
        let finalQuery = query;
        if (queryOptions && queryOptions.limit && query.trim().toLowerCase().startsWith('select')) {
            const start = (queryOptions.offset || 0) + 1;
            const end = (queryOptions.offset || 0) + queryOptions.limit;
            // Remove trailing semicolon if present to wrap correctly
            const cleanQuery = query.trim().replace(/;$/, '');
            finalQuery = `SELECT * FROM (${cleanQuery}) ROWS ${start} TO ${end}`;
        }
        
        const encodingConf = connection?.charset || config.get<string>('charset', 'UTF8');
        const options: Firebird.Options = {
            host: connection?.host || config.get<string>('host', '127.0.0.1'),
            port: connection?.port || config.get<number>('port', 3050),
            database: connection?.database || config.get<string>('database', ''),
            user: connection?.user || config.get<string>('user', 'SYSDBA'),
            password: connection?.password || config.get<string>('password', 'masterkey'),
            role: connection?.role || config.get<string>('role', ''),
            encoding: 'NONE', // Use NONE so FB sends raw bytes. Driver now reads them as 'binary' (latin1) due to patch.
            lowercase_keys: false
        } as any;

        if (!options.database) {
            throw new Error('Database path is not configured. Please select a database in the explorer or set "firebird.database" in settings.');
        }

        // Check if we need to switch database or if we are already connected to a different one
        if (this.db && this.currentOptions) {
            if (this.currentOptions.host !== options.host ||
                this.currentOptions.database !== options.database) {
                 await this.rollback(); // Switch implies rollback of potential old work
            }
        }

        this.currentOptions = options;
        this.resetAutoRollback();

        return new Promise((resolve, reject) => {
            const runQuery = (tr: Firebird.Transaction) => {
                 // Encode the query string to the target charset, then to 'binary' string
                // so the driver (patched to use 'binary') sends the correct bytes.
                let queryBuffer: Buffer;
                if (iconv.encodingExists(encodingConf)) {
                    queryBuffer = iconv.encode(finalQuery, encodingConf);
                } else {
                     queryBuffer = Buffer.from(finalQuery, 'utf8'); // Fallback
                }
                const queryString = queryBuffer.toString('binary');;

                tr.query(queryString, [], (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    if (Array.isArray(result)) {
                        result = result.map(row => {
                            const newRow: any = {};
                            for (const key in row) {
                                let val = row[key];
                                if (val instanceof Buffer) {
                                    // Should not happen for texts with 'binary' encoding patch, but just in case
                                    if (iconv.encodingExists(encodingConf)) {
                                       val = iconv.decode(val, encodingConf);
                                    } else {
                                       val = val.toString(); 
                                    }
                                } else if (typeof val === 'string') {
                                    // val is now a 'binary' (latin1) string preserving the original bytes
                                    if (iconv.encodingExists(encodingConf)) {
                                            const buf = Buffer.from(val, 'binary'); // Convert back to raw bytes
                                            val = iconv.decode(buf, encodingConf); // Decode correctly
                                    }
                                }
                                newRow[key] = val;
                            }
                            return newRow;
                         });
                    } else if (typeof result === 'object' && result !== null) {
                        // Check if it's a single row return (INSERT RETURNING)
                        // Heuristic: check if keys are typical column names (not metadata like row_count?)
                        // node-firebird usually returns { ...columns... } for RETURNING.
                        // Metadata for update/insert might be missing or different.
                         const keys = Object.keys(result);
                         if (keys.length > 0) {
                             // Assuming it's a data row if it has keys.
                             // Process encoding for single row too
                             const row: any = result;
                             const newRow: any = {};
                             for (const key in row) {
                                let val = row[key];
                                if (val instanceof Buffer) {
                                    if (iconv.encodingExists(encodingConf)) {
                                       val = iconv.decode(val, encodingConf);
                                    } else {
                                       val = val.toString(); 
                                    }
                                } else if (typeof val === 'string') {
                                    if (iconv.encodingExists(encodingConf)) {
                                            const buf = Buffer.from(val, 'binary');
                                            val = iconv.decode(buf, encodingConf);
                                    }
                                }
                                newRow[key] = val;
                            }
                            result = [newRow];
                         }
                    }
                    
                    resolve(result);
                });
            };

            if (this.transaction) {
                runQuery(this.transaction);
            } else {
                // Attach if not attached
                const doAttach = (cb: (db: Firebird.Database) => void) => {
                    if (this.db) {
                        cb(this.db);
                    } else {
                        Firebird.attach(options, (err, db) => {
                            if (err) return reject(err);
                            this.db = db;
                            cb(db);
                        });
                    }
                };

                doAttach((db) => {
                    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => {
                        if (err) return reject(err);
                        this.transaction = tr;
                        this.notifyStateChange(); // Notify start
                        runQuery(tr);
                    });
                });
            }
        });
    }

    public static async commit(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.transaction) {
                this.transaction.commit((err) => {
                    this.transaction = undefined;
                    this.notifyStateChange(); // Notify end
                    this.cleanupConnection();
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public static async rollback(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.transaction) {
                this.transaction.rollback((err) => {
                    this.transaction = undefined;
                    this.notifyStateChange(); // Notify end
                    this.cleanupConnection();
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                 this.cleanupConnection(); // Ensure connection is closed even if no transaction
                resolve();
            }
        });
    }

    private static cleanupConnection() {
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
            this.autoRollbackTimer = undefined;
        }
        if (this.db) {
            try {
                this.db.detach();
            } catch (e) {}
            this.db = undefined;
            this.currentOptions = undefined;
        }
    }

    private static resetAutoRollback() {
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
        }
        this.autoRollbackTimer = setTimeout(() => {
            vscode.window.showInformationMessage('Firebird transaction auto-rollback due to inactivity.');
            this.rollback();
        }, 60000); // 60s
    }

    public static detach() {
        this.rollback();
    }

    public static get hasActiveTransaction(): boolean {
        return !!this.transaction;
    }
}
