
import { Database } from '../database';
import { DatabaseConnection } from '../database/types';
import { MetadataQueries } from './metadataQueries';

export interface TableColumn {
    name: string;
    type: string;
    length: number;
    precision?: number;
    scale?: number;
    notNull: boolean;
    defaultValue?: string;
    computedSource?: string;
    pk?: boolean; // Primary Key
    fk?: string;  // Foreign Key target table
}

export interface TableIndex {
    name: string;
    unique: boolean;
    inactive: boolean;
    columns: string[];
}

export interface TableDependency {
    name: string;
    type: string; // 'View', 'Trigger', etc.
}

export interface TablePermission {
    user: string;
    privilege: string;
    grantor: string;
    grantOption: boolean;
}

export class MetadataService {

    public static async getTables(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getTables, 'RDB$RELATION_NAME');
    }

    public static async getViews(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getViews, 'RDB$RELATION_NAME');
    }

    public static async getTriggers(connection: DatabaseConnection, tableName?: string): Promise<any[]> {
        const query = MetadataQueries.getTriggers(tableName);

        // We still use fetchNames generic structure? No, custom row mapping needed.
        const rows = await Database.runMetaQuery(connection, query);
        return rows.map(row => ({
            name: row.RDB$TRIGGER_NAME.trim(),
            relation: row.RDB$RELATION_NAME ? row.RDB$RELATION_NAME.trim() : '',
            sequence: row.RDB$TRIGGER_SEQUENCE,
            type: row.RDB$TRIGGER_TYPE,
            inactive: row.RDB$TRIGGER_INACTIVE === 1
        }));
    }

    public static async getProcedures(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getProcedures, 'RDB$PROCEDURE_NAME');
    }

    public static async getGenerators(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getGenerators, 'RDB$GENERATOR_NAME');
    }

    private static async fetchNames(connection: DatabaseConnection, query: string, fieldName: string): Promise<string[]> {
        const rows = await Database.runMetaQuery(connection, query);
        return rows.map(row => row[fieldName].trim());
    }

    public static async getViewSource(connection: DatabaseConnection, name: string): Promise<string> {
        const query = MetadataQueries.getViewSource(name);
        const rows = await Database.runMetaQuery(connection, query);
        if (rows.length > 0 && rows[0].RDB$VIEW_SOURCE) {
            return `CREATE VIEW ${name} AS ${rows[0].RDB$VIEW_SOURCE.trim()}`;
        }
        return `-- View source not found for ${name}`;
    }

    public static async getTriggerSource(connection: DatabaseConnection, name: string): Promise<string> {
        const query = MetadataQueries.getTriggerSource(name);
        const rows = await Database.runMetaQuery(connection, query);
        if (rows.length > 0) {
            const row = rows[0];
            const source = row.RDB$TRIGGER_SOURCE ? row.RDB$TRIGGER_SOURCE.trim() : '';
            const relation = row.RDB$RELATION_NAME ? row.RDB$RELATION_NAME.trim() : '';
            const seq = row.RDB$TRIGGER_SEQUENCE || 0;
            const inactive = row.RDB$TRIGGER_INACTIVE === 1;
            const type = row.RDB$TRIGGER_TYPE || 0;
            
            const typeStr = this.decodeTriggerType(type);

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
        const query = MetadataQueries.getProcedureSource(name);
        
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
            // 1. DECLARE VARIABLE on new lines, removing extra empty lines before it
            source = source.replace(/\s*DECLARE\s+VARIABLE/gi, '\nDECLARE VARIABLE');
            
            // 2. Ensure BEGIN is on its own line, removing extra empty lines before it
            // Only target the first BEGIN (case insensitive) to avoid messing up nested blocks
            source = source.replace(/\s*BEGIN/i, '\nBEGIN');
            
            source = source.trim(); 
            
            return `${header}\n${source}`;
        } catch (err) {
            return `-- Error getting procedure source: ${err}`;
        }
    }

    private static async getProcedureParameters(connection: DatabaseConnection, procName: string, type: number): Promise<string[]> {
        // type: 0 = input, 1 = output
        const query = MetadataQueries.getProcedureParameters(procName, type);
        
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
        const query = MetadataQueries.getTableFields(name);
        
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
        const query = MetadataQueries.getGeneratorValue(name);
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

    public static async getIndexes(connection: DatabaseConnection, tableName: string): Promise<TableIndex[]> {
        const query = MetadataQueries.getIndexes(tableName);
        
        try {
            const rows = await Database.runMetaQuery(connection, query);
            const indexes = new Map<string, TableIndex>();

            for (const row of rows) {
                const name = row.RDB$INDEX_NAME.trim();
                const col = row.RDB$FIELD_NAME ? row.RDB$FIELD_NAME.trim() : '';

                if (!indexes.has(name)) {
                    indexes.set(name, {
                        name: name,
                        unique: row.RDB$UNIQUE_FLAG === 1,
                        inactive: row.RDB$INDEX_INACTIVE === 1,
                        columns: col ? [col] : []
                    });
                } else {
                    const idx = indexes.get(name)!;
                    if (col) idx.columns.push(col);
                }
            }
            return Array.from(indexes.values());
        } catch (err) {
            console.error('Error getting indexes:', err);
            return [];
        }
    }

    public static async getTableColumns(connection: DatabaseConnection, tableName: string): Promise<TableColumn[]> {
        const query = MetadataQueries.getTableColumnsDetailed(tableName);

        try {
            const rows = await Database.runMetaQuery(connection, query);
            return rows.map(row => ({
                name: row.RDB$FIELD_NAME.trim(),
                type: this.decodeType(row),
                length: row.RDB$FIELD_LENGTH,
                precision: row.RDB$FIELD_PRECISION,
                scale: row.RDB$FIELD_SCALE,
                notNull: row.RDB$NULL_FLAG === 1,
                defaultValue: row.RDB$DEFAULT_SOURCE ? row.RDB$DEFAULT_SOURCE.trim() : undefined,
                computedSource: row.RDB$COMPUTED_SOURCE ? row.RDB$COMPUTED_SOURCE.trim() : undefined
            }));
        } catch (err) {
            console.error('Error getting table columns:', err);
            return [];
        }
    }

    public static async getPrimaryKeyColumns(connection: DatabaseConnection, tableName: string): Promise<string[]> {
        const query = MetadataQueries.getPrimaryKeyColumns(tableName);

        try {
            const rows = await Database.runMetaQuery(connection, query);
            return rows.map(r => r.RDB$FIELD_NAME ? r.RDB$FIELD_NAME.trim() : '');
        } catch (err) {
            console.error('Error getting PK columns:', err);
            return [];
        }
    }

    public static async getForeignKeyColumns(connection: DatabaseConnection, tableName: string): Promise<Map<string, string>> {
        const query = MetadataQueries.getForeignKeyColumns(tableName);

        try {
            const rows = await Database.runMetaQuery(connection, query);
            const fks = new Map<string, string>();
            rows.forEach(r => {
                if (r.COLUMN_NAME && r.TARGET_TABLE && r.TARGET_COLUMN) {
                    fks.set(r.COLUMN_NAME.trim(), `${r.TARGET_TABLE.trim()}.${r.TARGET_COLUMN.trim()}`);
                }
            });
            return fks;
        } catch (err) {
            console.error('Error getting FK columns:', err);
            return new Map();
        }
    }

    public static async getTableDependencies(connection: DatabaseConnection, tableName: string): Promise<TableDependency[]> {
         const query = MetadataQueries.getTableDependencies(tableName);
        try {
            const rows = await Database.runMetaQuery(connection, query);
            return rows.map(row => ({
                name: row.RDB$DEPENDENT_NAME.trim(),
                type: 'View' // We filtered for dependent_type = 1
            }));
        } catch (err) {
            console.error('Error getting dependencies:', err);
            return [];
        }
    }

    public static async getTablePermissions(connection: DatabaseConnection, tableName: string): Promise<TablePermission[]> {
        return this.getObjectPermissions(connection, tableName, 0); // 0 = Relation (Table/View)
    }

    public static async getObjectPermissions(connection: DatabaseConnection, objectName: string, objectType: number): Promise<TablePermission[]> {
        const query = MetadataQueries.getObjectPermissions(objectName, objectType);
        try {
            const rows = await Database.runMetaQuery(connection, query);
            return rows.map(row => ({
                user: row.RDB$USER.trim(),
                privilege: this.decodePrivilege(row.RDB$PRIVILEGE.trim()),
                grantor: row.RDB$GRANTOR.trim(),
                grantOption: row.RDB$GRANT_OPTION === 1
            }));
        } catch (err) {
            console.error('Error getting permissions:', err);
            return [];
        }
    }

    public static formatPermissions(permissions: TablePermission[], objectName: string, objectType: string = 'PROCEDURE'): string {
        if (!permissions || permissions.length === 0) {
            return '';
        }

        const lines = permissions.map(p => {
             const grantOption = p.grantOption ? ' WITH GRANT OPTION' : '';
             return `GRANT ${p.privilege} ON ${objectType} ${objectName} TO ${p.user}${grantOption};`;
        });
        
        return lines.join('\n');
    }

    private static decodePrivilege(code: string): string {
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

    public static async getIndexDDL(connection: DatabaseConnection, indexName: string): Promise<string> {
        try {
            const details = await this.getIndexDetails(connection, indexName);
            const unique = details.unique ? 'UNIQUE ' : '';
            const desc = details.descending ? 'DESCENDING ' : 'ASCENDING ';
            // definition already includes parens if computed, or column list if not? 
            // In getIndexDetails:
            // if expression -> COMPUTED BY (expr)
            // else -> columns
            
            // Reconstruct logic slightly or just use details.
            let definition = details.definition;
            if (!definition.startsWith('COMPUTED BY')) {
                definition = `(${definition})`;
            }

            return `CREATE ${unique}${desc !== 'ASCENDING ' ? desc : ''}INDEX ${indexName} ON ${details.relation} ${definition};\n\n-- Status: ${details.status}\n-- Statistics: ${details.statistics}`;
        } catch (err) {
            return `-- Error generating DDL for index ${indexName}: ${err}`;
        }
    }

    public static async getIndexDetails(connection: DatabaseConnection, indexName: string): Promise<any> {
        const queryIdx = MetadataQueries.getIndexInfo(indexName);
        const querySeg = MetadataQueries.getIndexSegments(indexName);

        const idxRows = await Database.runMetaQuery(connection, queryIdx);
        if (idxRows.length === 0) throw new Error(`Index ${indexName} not found`);

            const idx = idxRows[0];
            const relation = idx.RDB$RELATION_NAME.trim();
            const unique = idx.RDB$UNIQUE_FLAG === 1;
            const inactive = idx.RDB$INDEX_INACTIVE === 1;
            const descending = idx.RDB$INDEX_TYPE === 1;
            const statistics = idx.RDB$STATISTICS;
            const expression = idx.RDB$EXPRESSION_SOURCE;

            let definition: string;
            if (expression) {
                definition = `COMPUTED BY (${expression.trim()})`;
            } else {
                const segRows = await Database.runMetaQuery(connection, querySeg);
                const columns = segRows.map(r => r.RDB$FIELD_NAME.trim()).join(', ');
                definition = columns;
            }

            return {
                relation,
                unique,
                status: inactive ? 'INACTIVE' : 'ACTIVE',
                descending,
                statistics,
                definition
            };
    }
}
