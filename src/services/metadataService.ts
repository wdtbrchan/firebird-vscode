
import { Database } from '../db';
import { DatabaseConnection } from '../explorer/databaseTreeDataProvider';

export class MetadataService {

    public static async getTables(connection: DatabaseConnection): Promise<string[]> {
        const query = `
            SELECT RDB$RELATION_NAME 
            FROM RDB$RELATIONS 
            WHERE RDB$VIEW_BLR IS NULL 
              AND (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
            ORDER BY RDB$RELATION_NAME
        `;
        return this.fetchNames(connection, query, 'RDB$RELATION_NAME');
    }

    public static async getViews(connection: DatabaseConnection): Promise<string[]> {
        const query = `
            SELECT RDB$RELATION_NAME 
            FROM RDB$RELATIONS 
            WHERE RDB$VIEW_BLR IS NOT NULL 
              AND (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
            ORDER BY RDB$RELATION_NAME
        `;
        return this.fetchNames(connection, query, 'RDB$RELATION_NAME');
    }

    public static async getTriggers(connection: DatabaseConnection, tableName?: string): Promise<any[]> {
        let query = `
            SELECT RDB$TRIGGER_NAME, RDB$RELATION_NAME, RDB$TRIGGER_SEQUENCE, RDB$TRIGGER_TYPE, RDB$TRIGGER_INACTIVE 
            FROM RDB$TRIGGERS 
            WHERE (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
        `;
        if (tableName) {
            query += ` AND RDB$RELATION_NAME = '${tableName}'`;
        }
        query += ` ORDER BY RDB$TRIGGER_SEQUENCE`;

        // We still use fetchNames generic structure? No, custom row mapping needed.
        const rows = await Database.runMetaQuery(connection, query);
        return rows.map(row => ({
            name: row.RDB$TRIGGER_NAME.trim(),
            relation: row.RDB$RELATION_NAME ? row.RDB$RELATION_NAME.trim() : '',
            sequence: row.RDB$TRIGGER_SEQUENCE,
            type: row.RDB$TRIGGER_TYPE,
            inactive: row.RDB$TRIGGER_INACTIVE
        }));
    }

    public static async getProcedures(connection: DatabaseConnection): Promise<string[]> {
        const query = `
            SELECT RDB$PROCEDURE_NAME 
            FROM RDB$PROCEDURES 
            WHERE (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
            ORDER BY RDB$PROCEDURE_NAME
        `;
        return this.fetchNames(connection, query, 'RDB$PROCEDURE_NAME');
    }

    public static async getGenerators(connection: DatabaseConnection): Promise<string[]> {
        const query = `
            SELECT RDB$GENERATOR_NAME 
            FROM RDB$GENERATORS 
            WHERE (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
            ORDER BY RDB$GENERATOR_NAME
        `;
        return this.fetchNames(connection, query, 'RDB$GENERATOR_NAME');
    }

    private static async fetchNames(connection: DatabaseConnection, query: string, fieldName: string): Promise<string[]> {
        const rows = await Database.runMetaQuery(connection, query);
        return rows.map(row => row[fieldName].trim());
    }

    public static async getViewSource(connection: DatabaseConnection, name: string): Promise<string> {
        const query = `
            SELECT RDB$VIEW_SOURCE 
            FROM RDB$RELATIONS 
            WHERE RDB$RELATION_NAME = '${name}'
        `;
        const rows = await Database.runMetaQuery(connection, query);
        if (rows.length > 0 && rows[0].RDB$VIEW_SOURCE) {
            return `CREATE VIEW ${name} AS ${rows[0].RDB$VIEW_SOURCE.trim()}`;
        }
        return `-- View source not found for ${name}`;
    }

    public static async getTriggerSource(connection: DatabaseConnection, name: string): Promise<string> {
        const query = `
            SELECT RDB$TRIGGER_SOURCE, RDB$RELATION_NAME, RDB$TRIGGER_TYPE, RDB$TRIGGER_SEQUENCE, RDB$TRIGGER_INACTIVE
            FROM RDB$TRIGGERS 
            WHERE RDB$TRIGGER_NAME = '${name}'
        `;
        const rows = await Database.runMetaQuery(connection, query);
        if (rows.length > 0) {
            const row = rows[0];
            const source = row.RDB$TRIGGER_SOURCE ? row.RDB$TRIGGER_SOURCE.trim() : '';
            const relation = row.RDB$RELATION_NAME ? row.RDB$RELATION_NAME.trim() : '';
            const seq = row.RDB$TRIGGER_SEQUENCE || 0;
            const inactive = row.RDB$TRIGGER_INACTIVE === 1;
            const type = row.RDB$TRIGGER_TYPE || 0;
            
            let typeStr = this.decodeTriggerType(type);

            return `CREATE TRIGGER ${name} FOR ${relation} ${inactive ? 'INACTIVE' : 'ACTIVE'}\n${typeStr} POSITION ${seq}\n${source}`;
        }
        return `-- Trigger source not found for ${name}`;
    }

    public static decodeTriggerType(type: number): string {
        // Standard mapping (1-based often used in docs, but DB values are distinct)
        // 1: BI, 2: AI, 3: BU, 4: AU, 5: BD, 6: AD
        switch (type) {
            case 1: return 'BEFORE INSERT';
            case 2: return 'AFTER INSERT';
            case 3: return 'BEFORE UPDATE';
            case 4: return 'AFTER UPDATE';
            case 5: return 'BEFORE DELETE';
            case 6: return 'AFTER DELETE';
            case 12: return 'AFTER INSERT OR UPDATE';
            case 17: return 'BEFORE INSERT OR UPDATE';
            case 18: return 'AFTER INSERT OR UPDATE';
            case 25: return 'BEFORE INSERT OR DELETE';
            case 26: return 'AFTER INSERT OR DELETE';
            case 27: return 'BEFORE UPDATE OR DELETE';
            case 28: return 'AFTER UPDATE OR DELETE';
            case 113: return 'BEFORE INSERT OR UPDATE OR DELETE';
            case 114: return 'AFTER INSERT OR UPDATE OR DELETE';
            case 8192: return 'ON CONNECT';
            case 8193: return 'ON DISCONNECT';
            case 8194: return 'ON TRANSACTION START';
            case 8195: return 'ON TRANSACTION COMMIT';
            case 8196: return 'ON TRANSACTION ROLLBACK';
        }
        return `TYPE ${type}`;
    }

    public static async getProcedureSource(connection: DatabaseConnection, name: string): Promise<string> {
        const query = `
            SELECT RDB$PROCEDURE_SOURCE 
            FROM RDB$PROCEDURES 
            WHERE RDB$PROCEDURE_NAME = '${name}'
        `;
        
        try {
            const rows = await Database.runMetaQuery(connection, query);
            let source = '';
            if (rows.length > 0 && rows[0].RDB$PROCEDURE_SOURCE) {
                source = rows[0].RDB$PROCEDURE_SOURCE.trim();
            } else {
                 return `-- Procedure source not found for ${name}`;
            }

            // Fetch parameters
            const inputs = await this.getProcedureParameters(connection, name, 0); // 0 = Input
            const outputs = await this.getProcedureParameters(connection, name, 1); // 1 = Output

            let header = `CREATE OR ALTER PROCEDURE ${name}`;
            
            if (inputs.length > 0) {
                header += ' (\n' + inputs.map(p => `    ${p}`).join(',\n') + '\n)';
            }
            
            if (outputs.length > 0) {
                header += '\nRETURNS (\n' + outputs.map(p => `    ${p}`).join(',\n') + '\n)';
            }
            
            header += ' AS';

            // Formatting enhancements
            // 1. DECLARE VARIABLE on new lines
            source = source.replace(/DECLARE\s+VARIABLE/gi, '\nDECLARE VARIABLE');
            // 2. BEGIN/END on new lines (simple heuristic)
            // Be careful not to break strings/comments.
            // A safe approach is hard without a full parser. 
            // But usually BEGIN is followed by newline or starts a line.
            // Let's just ensure there is a space or newline before BEGIN if previous char is not whitespace?
            // User asked for "prehledny format".
            
            // Basic indentation fix:
            // Ensure BEGIN is on its own line?
            // source = source.replace(/\s+BEGIN\s+/gi, '\nBEGIN\n'); 
            
            return `${header}\n${source}`;
        } catch (err) {
            return `-- Error getting procedure source: ${err}`;
        }
    }

    private static async getProcedureParameters(connection: DatabaseConnection, procName: string, type: number): Promise<string[]> {
        // type: 0 = input, 1 = output
        const query = `
            SELECT p.RDB$PARAMETER_NAME, f.RDB$FIELD_TYPE, f.RDB$FIELD_LENGTH, f.RDB$FIELD_PRECISION, f.RDB$FIELD_SCALE, f.RDB$FIELD_SUB_TYPE
            FROM RDB$PROCEDURE_PARAMETERS p
            LEFT JOIN RDB$FIELDS f ON p.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
            WHERE p.RDB$PROCEDURE_NAME = '${procName}' AND p.RDB$PARAMETER_TYPE = ${type}
            ORDER BY p.RDB$PARAMETER_NUMBER
        `;
        
        try {
            const rows = await Database.runMetaQuery(connection, query);
            return rows.map(row => {
                const paramName = row.RDB$PARAMETER_NAME.trim();
                const typeStr = this.decodeType(row);
                return `${paramName} ${typeStr}`;
            });
        } catch (err) {
            console.error(`Error fetching params for ${procName}:`, err);
            return [];
        }
    }

    private static decodeType(row: any): string {
        let type = 'UNKNOWN';
        const t = row.RDB$FIELD_TYPE;
        const sub = row.RDB$FIELD_SUB_TYPE;
        const len = row.RDB$FIELD_LENGTH;
        // scale is often negative in FB (e.g. -2 means /100)
        // precision might apply.
        
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
             // TODO: Handle precision/scale for Numeric/Decimal
        }
        else if (t === 27) type = 'DOUBLE PRECISION';
        else if (t === 35) type = 'TIMESTAMP';
        else if (t === 37) type = `VARCHAR(${len})`;
        else if (t === 261) type = 'BLOB';
        
        return type;
    }

    public static async getGeneratorDDL(connection: DatabaseConnection, name: string): Promise<string> {
        return `CREATE GENERATOR ${name};`;
    }

    public static async getTableDDL(connection: DatabaseConnection, name: string): Promise<string> {
        const query = `
            SELECT rf.RDB$FIELD_NAME, f.RDB$FIELD_TYPE, f.RDB$FIELD_LENGTH, f.RDB$FIELD_PRECISION, f.RDB$FIELD_SCALE, f.RDB$FIELD_SUB_TYPE, rf.RDB$NULL_FLAG
            FROM RDB$RELATION_FIELDS rf
            JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
            WHERE rf.RDB$RELATION_NAME = '${name}'
            ORDER BY rf.RDB$FIELD_POSITION
        `;
        
        try {
            const rows = await Database.runMetaQuery(connection, query);
            if (rows.length === 0) return `-- Table columns not found for ${name}`;

            let ddl = `CREATE TABLE ${name} (\n`;
            const cols = rows.map(row => {
                const colName = row.RDB$FIELD_NAME.trim();
                const type = this.decodeType(row);
                return `    ${colName} ${type}`; 
            });
            ddl += cols.join(',\n');
            ddl += `\n);`;
            return ddl;
        } catch (e) {
            return `-- Error generating DDL for ${name}: ${e}`;
        }
    }

    public static async getGeneratorValue(connection: DatabaseConnection, name: string): Promise<string> {
        // GEN_ID(name, 0) returns current value without incrementing
        const query = `SELECT GEN_ID(${name}, 0) AS CUR_VAL FROM RDB$DATABASE`;
        try {
            const rows = await Database.runMetaQuery(connection, query);
            if (rows.length > 0) {
                return rows[0].CUR_VAL !== undefined ? rows[0].CUR_VAL.toString() : 'Unknown';
            }
            return 'Unknown';
        } catch (e) {
            return `Error: ${e}`;
        }
    }
}
