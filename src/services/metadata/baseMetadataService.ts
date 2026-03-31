import { Database } from '../../database';
import { DatabaseConnection } from '../../database/types';

export class BaseMetadataService {
    protected static async fetchNames(connection: DatabaseConnection, query: string, fieldName: string): Promise<string[]> {
        const rows = await Database.runMetaQuery('metadata', connection, query);
        return rows.map(row => row[fieldName].trim());
    }

    protected static decodeType(row: any): string {
        let type = 'UNKNOWN';
        const t = row.RDB$FIELD_TYPE;
        const sub = row.RDB$FIELD_SUB_TYPE;
        const len = row.RDB$FIELD_LENGTH;
        const precision = row.RDB$FIELD_PRECISION;
        const scale = row.RDB$FIELD_SCALE; // negative in Firebird (e.g. -2 = 2 decimal places)

        // Helper to format NUMERIC/DECIMAL with precision and scale
        const numericType = (typeName: string): string => {
            const hasScale = scale !== null && scale !== undefined && scale !== 0;
            const hasPrecision = precision !== null && precision !== undefined && precision > 0;
            if (hasPrecision || hasScale) {
                const p = hasPrecision ? precision : 0;
                const decimals = hasScale ? Math.abs(scale) : 0;
                return `${typeName}(${p},${decimals})`;
            }
            return typeName;
        };

        if (t === 7) {
            if (sub === 1) type = numericType('NUMERIC');
            else if (sub === 2) type = numericType('DECIMAL');
            else type = 'SMALLINT';
        }
        else if (t === 8) {
            if (sub === 1) type = numericType('NUMERIC');
            else if (sub === 2) type = numericType('DECIMAL');
            else type = 'INTEGER';
        }
        else if (t === 10) type = 'FLOAT';
        else if (t === 12) type = 'DATE';
        else if (t === 13) type = 'TIME';
        else if (t === 14) type = `CHAR(${len})`;
        else if (t === 16) {
            if (sub === 1) type = numericType('NUMERIC');
            else if (sub === 2) type = numericType('DECIMAL');
            else type = 'BIGINT';
        }
        else if (t === 27) {
            // Older Firebird dialect stores NUMERIC/DECIMAL with precision > 9 as DOUBLE PRECISION.
            // sub_type may be NULL in some DBs, so also check scale (DOUBLE PRECISION never has scale).
            // RDB$FIELD_PRECISION is not stored for type 27 in dialect 1 — default to 15 (max for DOUBLE).
            const effectivePrecision = (precision && precision > 0) ? precision : 15;
            const numericTypeWithFallback = (typeName: string): string => {
                const hasScale = scale !== null && scale !== undefined && scale !== 0;
                const decimals = hasScale ? Math.abs(scale) : 0;
                return `${typeName}(${effectivePrecision},${decimals})`;
            };
            if (sub === 1 || (sub !== 2 && scale && scale !== 0)) type = numericTypeWithFallback('NUMERIC');
            else if (sub === 2) type = numericTypeWithFallback('DECIMAL');
            else type = 'DOUBLE PRECISION';
        }
        else if (t === 35) type = 'TIMESTAMP';
        else if (t === 37) type = `VARCHAR(${len})`;
        else if (t === 261) type = 'BLOB';

        return type;
    }

    protected static decodePrivilege(code: string): string {
        switch (code) {
            case 'S': return 'SELECT';
            case 'D': return 'DELETE';
            case 'I': return 'INSERT';
            case 'U': return 'UPDATE';
            case 'R': return 'REFERENCES';
            case 'X': return 'EXECUTE';
            default: return code;
        }
    }
}
