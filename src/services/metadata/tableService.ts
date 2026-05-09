import { DatabaseConnection } from '../../database/types';
import { Database } from '../../database';
import { MetadataQueries } from '../metadataQueries';
import { BaseMetadataService } from './baseMetadataService';
import { TableColumn, TableDependency } from './types';

export class TableService extends BaseMetadataService {
    public static async getTables(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getTables, 'RDB$RELATION_NAME');
    }

    public static async getTableDDL(connection: DatabaseConnection, name: string): Promise<string> {
        const query = MetadataQueries.getTableFields(name);
        
        try {
            const rows = await Database.runMetaQuery('metadata', connection, query);
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

    public static async getTableColumns(connection: DatabaseConnection, tableName: string): Promise<TableColumn[]> {
        const query = MetadataQueries.getTableColumnsDetailed(tableName);

        try {
            const rows = await Database.runMetaQuery('metadata', connection, query);
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
            const rows = await Database.runMetaQuery('metadata', connection, query);
            return rows.map(r => r.RDB$FIELD_NAME ? r.RDB$FIELD_NAME.trim() : '');
        } catch (err) {
            console.error('Error getting PK columns:', err);
            return [];
        }
    }

    public static async getForeignKeyColumns(connection: DatabaseConnection, tableName: string): Promise<Map<string, string>> {
        const query = MetadataQueries.getForeignKeyColumns(tableName);

        try {
            const rows = await Database.runMetaQuery('metadata', connection, query);
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
            const rows = await Database.runMetaQuery('metadata', connection, query);
            return rows.map(row => ({
                name: row.RDB$DEPENDENT_NAME.trim(),
                type: 'View' // We filtered for dependent_type = 1
            }));
        } catch (err) {
            console.error('Error getting dependencies:', err);
            return [];
        }
    }
}
