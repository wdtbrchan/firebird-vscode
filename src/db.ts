import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import * as iconv from 'iconv-lite';

export class Database {
    private static db: Firebird.Database | undefined;

    public static async executeQuery(query: string, connection?: { host: string, port: number, database: string, user: string, password?: string, role?: string, charset?: string }): Promise<any[]> {
        const config = vscode.workspace.getConfiguration('firebird');
        
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

        return new Promise((resolve, reject) => {
            Firebird.attach(options, (err, db) => {
                if (err) {
                    // Try detach just in case
                   if(db) db.detach();
                   return reject(err);
                }
                
                // Encode the query string to the target charset, then to 'binary' string
                // so the driver (patched to use 'binary') sends the correct bytes.
                let queryBuffer: Buffer;
                if (iconv.encodingExists(encodingConf)) {
                    queryBuffer = iconv.encode(query, encodingConf);
                } else {
                     queryBuffer = Buffer.from(query, 'utf8'); // Fallback
                }
                const queryString = queryBuffer.toString('binary');;

                db.query(queryString, [], (err, result) => {
                    db.detach(); // Always detach after query
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
                    }
                    
                    resolve(result);
                });
            });
        });
    }

    public static detach() {
        if (this.db) {
            this.db.detach();
            this.db = undefined;
        }
    }
}
