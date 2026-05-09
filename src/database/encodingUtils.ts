import * as iconv from 'iconv-lite';

/**
 * Shape of one entry in node-firebird's `statement.output` array.
 */
interface StatementOutputColumn {
    alias?: string;
    field?: string;
}

/**
 * BLOB callback exposed by node-firebird. Invoking it yields a name and an
 * EventEmitter that streams the BLOB data.
 */
type BlobReader = (cb: (err: unknown, name: unknown, emitter: NodeJS.EventEmitter) => void) => void;

export type ResultRow = Record<string, unknown>;

/**
 * Extracts unique column names from a node-firebird statement output array.
 * Suffixes duplicate column names with _1, _2, etc.
 */
export function getUniqueColumnNames(outputs: StatementOutputColumn[]): string[] {
    const names: string[] = [];
    const nameCounts = new Map<string, number>();
    for (const out of (outputs || [])) {
        const baseName = out.alias || out.field || 'COLUMN';
        let finalName = baseName;
        let count = nameCounts.get(baseName) || 0;

        if (count > 0) {
            finalName = `${baseName}_${count}`;
        }
        nameCounts.set(baseName, count + 1);

        while (names.includes(finalName)) {
            count++;
            finalName = `${baseName}_${count}`;
            nameCounts.set(baseName, count + 1);
        }
        names.push(finalName);
    }
    return names;
}

/**
 * Processes result rows from node-firebird, decoding buffers and BLOBs
 * according to the configured charset encoding.
 */
export async function processResultRows(result: unknown[], encodingConf: string, columnNames?: string[]): Promise<ResultRow[]> {
    if (!Array.isArray(result)) return [];

    return Promise.all(result.map(async (rawRow): Promise<ResultRow> => {
        const row = rawRow as Record<string | number, unknown>;
        const newRow: ResultRow = {};
        const isArray = Array.isArray(row);
        // Check if row is array-like (has '0' key) to support node-firebird's object return format
        const isNumeric = isArray || (row && typeof row === 'object' && '0' in row);
        const keys = (columnNames && columnNames.length > 0) ? columnNames : Object.keys(row);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            let val: unknown = isNumeric ? row[i] : row[key];

            if (val instanceof Buffer) {
                if (iconv.encodingExists(encodingConf)) {
                    val = iconv.decode(val, encodingConf);
                } else {
                    val = val.toString();
                }
            } else if (typeof val === 'function') {
                // It's a BLOB (function): val(cb) where cb yields a stream EventEmitter.
                const blobReader = val as BlobReader;
                val = await new Promise<string>((resolve, reject) => {
                    blobReader((err, _name, emitter) => {
                        if (err) return reject(err);
                        const chunks: Buffer[] = [];
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
    const queryBuffer: Buffer = iconv.encodingExists(encodingConf)
        ? iconv.encode(query, encodingConf)
        : Buffer.from(query, 'utf8');
    return queryBuffer.toString('binary');
}
