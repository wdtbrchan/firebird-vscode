import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import * as iconv from 'iconv-lite';
import { DatabaseConnection } from './explorer/databaseTreeDataProvider';

export interface QueryOptions {
    limit?: number;
    offset?: number;
}

export interface QueryResult {
    rows: any[];
    affectedRows?: number;
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

    private static async processResultRows(result: any[], encodingConf: string, columnNames?: string[]): Promise<any[]> {
        if (!Array.isArray(result)) return [];
        
        return Promise.all(result.map(async row => {
            const newRow: any = {};
            const isArray = Array.isArray(row);
            // Check if row is array-like (has '0' key) to support node-firebird's object return format
            const isNumeric = isArray || (row && typeof row === 'object' && '0' in row);
            const keys = (columnNames && columnNames.length > 0) ? columnNames : Object.keys(row);

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                let val = isNumeric ? row[i] : row[key];

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

    private static async getAffectedRows(statement: any, transaction: any): Promise<number | undefined> {
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
            const ISC_INFO_REQ_INSERT_COUNT = 13;
            const ISC_INFO_REQ_UPDATE_COUNT = 14;
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
                }, 1000); // 1s timeout

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

                                    if (reqType === ISC_INFO_REQ_INSERT_COUNT || 
                                        reqType === ISC_INFO_REQ_UPDATE_COUNT || 
                                        reqType === ISC_INFO_REQ_DELETE_COUNT) {
                                        totalAffected += count;
                                        found = true;
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

    public static async executeQuery(query: string, connection?: { host: string, port: number, database: string, user: string, password?: string, role?: string, charset?: string }, queryOptions?: QueryOptions): Promise<QueryResult> {
        const config = vscode.workspace.getConfiguration('firebird');
        
        const cleanQuery = query.trim().replace(/;$/, '');
        let finalQuery = cleanQuery;
        
        // Regex to match SELECT and any leading comments/whitespace
        // Capture group 1: leading comments/spaces
        // Capture group 2: the "SELECT" word itself
        // Capture group 3: what follows (to check for FIRST/SKIP)
        const selectRegex = /^(\s*(?:\/\*[\s\S]*?\*\/|\-\-.*?\n|\s+)*)(select)(\s+first\s+\d+|\s+skip\s+\d+)?/i;
        
        const match = selectRegex.exec(cleanQuery);
        const hasExistingPagination = match && match[3] ? true : false;
        
        if (queryOptions && queryOptions.limit && !hasExistingPagination && match) {
            const limit = queryOptions.limit;
            const skip = queryOptions.offset || 0;
            
            // Reconstruct the query: [comments] SELECT FIRST [limit] SKIP [skip] [rest of query]
            const leading = match[1];
            const selectWord = match[2];
            const restOfQuery = cleanQuery.substring(match[0].length);
            
            finalQuery = `${leading}${selectWord} FIRST ${limit} SKIP ${skip}${restOfQuery}`;
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
        this.currentOptions = options;
        
        // Stop auto-rollback while executing
        if (this.autoRollbackTimer) clearTimeout(this.autoRollbackTimer);
        this.autoRollbackDeadline = undefined;
        // this.notifyStateChange('Executing...'); // This overrides the loading screen in results panel

        return new Promise((resolve, reject) => {
            const wrapResolve = (res: QueryResult) => {
                this.resetAutoRollback();
                resolve(res);
            };
            const wrapReject = (err: any) => {
                this.resetAutoRollback();
                reject(err);
            };

            const runQuery = (tr: Firebird.Transaction) => {
                const trAny = tr as any; // Access internal methods
                const queryString = this.prepareQueryBuffer(finalQuery, encodingConf);

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
                                    // Row objects now have column names as keys thanks to { asObject: true }
                                    const processed = await this.processResultRows(rows, encodingConf);
                                    wrapResolve({ rows: processed });
                                } catch (readErr) {
                                    wrapReject(readErr);
                                }
                            });
                        } else {
                            // DML (Insert/Update/Delete) or DDL
                            // Try to fetch affected rows
                            let affectedRows: number | undefined;
                            try {
                                affectedRows = await this.getAffectedRows(statement, tr);
                            } catch (e) {
                                // Ignore error fetching affected rows
                            }

                            statement.close(); 
                            
                            // For DML, result/output might be relevant but usually empty or just metadata
                            // Use empty rows for DML
                            wrapResolve({ rows: [], affectedRows });
                        }
                    }, { asObject: true }); // Pass { asObject: true } to get rows as objects
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
                            if (err) return wrapReject(err);
                            this.db = db;
                            cb(db);
                        });
                    }
                };

                doAttach((db) => {
                    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => {
                        if (err) return wrapReject(err);
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
                    this.notifyStateChange('Committed'); 
                    this.cleanupConnection();
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public static async rollback(reason: string = 'Rolled back'): Promise<void> {
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
            vscode.window.showInformationMessage('Firebird transaction auto-rolled back due to inactivity.');
            this.rollback('Auto-rolled back');
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
