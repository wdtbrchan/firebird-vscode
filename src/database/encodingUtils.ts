import * as iconv from 'iconv-lite';

/**
 * Processes result rows from node-firebird, decoding buffers and BLOBs
 * according to the configured charset encoding.
 */
export async function processResultRows(result: any[], encodingConf: string, columnNames?: string[]): Promise<any[]> {
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

/**
 * Encodes a query string into a binary buffer using the configured charset.
 */
export function prepareQueryBuffer(query: string, encodingConf: string): string {
    let queryBuffer: Buffer;
    if (iconv.encodingExists(encodingConf)) {
        queryBuffer = iconv.encode(query, encodingConf);
    } else {
         queryBuffer = Buffer.from(query, 'utf8');
    }
    return queryBuffer.toString('binary');
}
