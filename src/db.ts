import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import * as iconv from 'iconv-lite';
import { DatabaseConnection } from './explorer/databaseTreeDataProvider';

export interface QueryOptions {
    limit?: number;
    offset?: number;
}

export class Database {
    private static db: Firebird.Database | undefined;
    private static transaction: Firebird.Transaction | undefined;
    private static autoRollbackTimer: NodeJS.Timeout | undefined;
    private static autoRollbackDeadline: number | undefined;
    private static currentOptions: Firebird.Options | undefined;

    private static onStateChangeHandlers: ((hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void)[] = [];

    public static onTransactionChange(handler: (hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void) {
        this.onStateChangeHandlers.push(handler);
    }

    private static notifyStateChange(lastAction?: string) {
        const isActive = this.hasActiveTransaction;
        this.onStateChangeHandlers.forEach(h => h(isActive, this.autoRollbackDeadline, lastAction));
    }

    private static async processResultRows(result: any[], encodingConf: string): Promise<any[]> {
        if (!Array.isArray(result)) return [];
        
        return Promise.all(result.map(async row => {
            const newRow: any = {};
            for (const key in row) {
                let val = row[key];
                if (val instanceof Buffer) {
                    if (iconv.encodingExists(encodingConf)) {
                        val = iconv.decode(val, encodingConf);
                    } else {
                        val = val.toString(); 
                    }
                } else if (typeof val === 'function') {
                    // It's a BLOB (function)
                    // Usage: val(function(err, name, eventEmitter) { ... })
                    // We must read it inside the transaction context
                    val = await new Promise((resolve, reject) => {
                         val((err: any, name: any, emitter: any) => {
                             if (err) return reject(err);
                             let chunks: Buffer[] = [];
                             emitter.on('data', (chunk: Buffer) => chunks.push(chunk));
                             emitter.on('end', () => {
                                 const buf = Buffer.concat(chunks);
                                 if (iconv.encodingExists(encodingConf)) {
                                     resolve(iconv.decode(buf, encodingConf));
                                 } else {
                                     resolve(buf.toString());
                                 }
                             });
                             emitter.on('error', reject);
                         });
                    });
                } else if (typeof val === 'string') {
                    if (iconv.encodingExists(encodingConf)) {
                        const buf = Buffer.from(val, 'binary');
                        val = iconv.decode(buf, encodingConf);
                    }
                }
                newRow[key] = val;
            }
            return newRow;
        }));
    }

    private static prepareQueryBuffer(query: string, encodingConf: string): string {
        let queryBuffer: Buffer;
        if (iconv.encodingExists(encodingConf)) {
            queryBuffer = iconv.encode(query, encodingConf);
        } else {
             queryBuffer = Buffer.from(query, 'utf8');
        }
        return queryBuffer.toString('binary');
    }

    // Using 'any' for connection to avoid circular dependency
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

                const finalQuery = this.prepareQueryBuffer(query, encodingConf);

                db.query(finalQuery, [], async (err, result) => {
                    if (err) {
                        try { db.detach(); } catch(e) {}
                        return reject(err);
                    }
                    
                    try {
                        const rows = await this.processResultRows(result, encodingConf);
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

    public static async executeQuery(query: string, connection?: { host: string, port: number, database: string, user: string, password?: string, role?: string, charset?: string }, queryOptions?: QueryOptions): Promise<any[]> {
        const config = vscode.workspace.getConfiguration('firebird');
        
        let finalQuery = query;
        if (queryOptions && queryOptions.limit && query.trim().toLowerCase().startsWith('select')) {
            const start = (queryOptions.offset || 0) + 1;
            const end = (queryOptions.offset || 0) + queryOptions.limit;
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
            encoding: 'NONE', 
            lowercase_keys: false
        } as any;

        if (!options.database) {
            throw new Error('Database path is not configured. Please select a database in the explorer or set "firebird.database" in settings.');
        }

        if (this.db && this.currentOptions) {
            if (this.currentOptions.host !== options.host ||
                this.currentOptions.database !== options.database) {
                 await this.rollback(); 
            }
        }

        this.currentOptions = options;
        this.resetAutoRollback();

        return new Promise((resolve, reject) => {
            const runQuery = (tr: Firebird.Transaction) => {
                const queryString = this.prepareQueryBuffer(finalQuery, encodingConf);

                tr.query(queryString, [], async (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    try {
                        if (Array.isArray(result)) {
                            result = await this.processResultRows(result, encodingConf);
                        } else if (typeof result === 'object' && result !== null) {
                             const keys = Object.keys(result);
                             if (keys.length > 0) {
                                 const row: any = result;
                                 const processed = await this.processResultRows([row], encodingConf);
                                 result = processed;
                             }
                        }
                    } catch (readErr) {
                         return reject(readErr);
                    }
                    
                    if (!Array.isArray(result)) {
                        result = [];
                    }
                    resolve(result);
                });
            };

            if (this.transaction) {
                runQuery(this.transaction);
            } else {
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
                        this.notifyStateChange(); 
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
                    this.notifyStateChange('Transaction Committed'); 
                    this.cleanupConnection();
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public static async rollback(reason: string = 'Transaction Rolled Back'): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.transaction) {
                this.transaction.rollback((err) => {
                    this.transaction = undefined;
                    this.notifyStateChange(reason); 
                    this.cleanupConnection();
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                 this.cleanupConnection(); 
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
        this.autoRollbackDeadline = undefined;
    }

    private static resetAutoRollback() {
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
        }
        
        const config = vscode.workspace.getConfiguration('firebird');
        let timeoutSeconds = config.get<number>('autoRollbackTimeout', 60);
        if (!timeoutSeconds || typeof timeoutSeconds !== 'number' || isNaN(timeoutSeconds)) {
             timeoutSeconds = 60;
        }

        if (timeoutSeconds <= 0) {
            this.autoRollbackDeadline = undefined;
            if (this.transaction) {
                 this.notifyStateChange();
            }
            return;
        }

        this.autoRollbackDeadline = Date.now() + (timeoutSeconds * 1000);

        this.autoRollbackTimer = setTimeout(() => {
            vscode.window.showInformationMessage('Firebird transaction auto-rollback due to inactivity.');
            this.rollback('Auto-rollback');
        }, timeoutSeconds * 1000);

        if (this.transaction) {
            this.notifyStateChange();
        }
    }

    public static detach() {
        this.rollback();
    }

    public static get hasActiveTransaction(): boolean {
        return !!this.transaction;
    }

    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        const config = vscode.workspace.getConfiguration('firebird');
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
