import { DatabaseConnection } from '../../database/types';
import { Database } from '../../database';
import { MetadataQueries } from '../metadataQueries';
import { BaseMetadataService } from './baseMetadataService';

export class ViewService extends BaseMetadataService {
    public static async getViews(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getViews, 'RDB$RELATION_NAME');
    }

    public static async getViewSource(connection: DatabaseConnection, name: string): Promise<string> {
        const query = MetadataQueries.getViewSource(name);
        const rows = await Database.runMetaQuery('metadata', connection, query);
        if (rows.length > 0 && rows[0].RDB$VIEW_SOURCE) {
            return `CREATE VIEW ${name} AS ${rows[0].RDB$VIEW_SOURCE.trim()}`;
        }
        return `-- View source not found for ${name}`;
    }
}
