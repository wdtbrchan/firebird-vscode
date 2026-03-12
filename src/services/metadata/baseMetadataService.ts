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
        
        if (t === 7) type = 'SMALLINT';
        else if (t === 8) type = 'INTEGER';
        else if (t === 10) type = 'FLOAT';
        else if (t === 12) type = 'DATE';
        else if (t === 13) type = 'TIME';
        else if (t === 14) type = `CHAR(${len})`; 
        else if (t === 16) {
             if (sub === 1) type = 'NUMERIC'; 
             else if (sub === 2) type = 'DECIMAL';
             else type = 'BIGINT';
        }
        else if (t === 27) type = 'DOUBLE PRECISION';
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
