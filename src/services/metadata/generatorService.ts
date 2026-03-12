import { DatabaseConnection } from '../../database/types';
import { Database } from '../../database';
import { MetadataQueries } from '../metadataQueries';
import { BaseMetadataService } from './baseMetadataService';

export class GeneratorService extends BaseMetadataService {
    public static async getGenerators(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getGenerators, 'RDB$GENERATOR_NAME');
    }

    public static async getGeneratorDDL(connection: DatabaseConnection, name: string): Promise<string> {
        return `CREATE GENERATOR ${name};`;
    }

    public static async getGeneratorValue(connection: DatabaseConnection, name: string): Promise<string> {
        const query = MetadataQueries.getGeneratorValue(name);
        try {
            const rows = await Database.runMetaQuery('metadata', connection, query);
            if (rows.length > 0) {
                return rows[0].CUR_VAL !== undefined ? rows[0].CUR_VAL.toString() : 'Unknown';
            }
            return 'Unknown';
        } catch (e) {
            return `Error: ${e}`;
        }
    }
}
