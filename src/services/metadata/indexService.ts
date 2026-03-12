import { DatabaseConnection } from '../../database/types';
import { Database } from '../../database';
import { MetadataQueries } from '../metadataQueries';
import { BaseMetadataService } from './baseMetadataService';
import { TableIndex } from './types';

export class IndexService extends BaseMetadataService {
    public static async getIndexes(connection: DatabaseConnection, tableName: string): Promise<TableIndex[]> {
        const query = MetadataQueries.getIndexes(tableName);
        
        try {
            const rows = await Database.runMetaQuery('metadata', connection, query);
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

    public static async getIndexDDL(connection: DatabaseConnection, indexName: string): Promise<string> {
        try {
            const details = await this.getIndexDetails(connection, indexName);
            const unique = details.unique ? 'UNIQUE ' : '';
            const desc = details.descending ? 'DESCENDING ' : 'ASCENDING ';
            
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

        const idxRows = await Database.runMetaQuery('metadata', connection, queryIdx);
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
            const segRows = await Database.runMetaQuery('metadata', connection, querySeg);
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
