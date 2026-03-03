export class RowCounter {
    /**
     * Detects the DML type from a SQL query string.
     */
    public static detectDmlType(query: string): 'insert' | 'update' | 'delete' | undefined {
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
}
