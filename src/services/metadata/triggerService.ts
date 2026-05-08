import { DatabaseConnection } from '../../database/types';
import { Database } from '../../database';
import { MetadataQueries } from '../metadataQueries';
import { BaseMetadataService } from './baseMetadataService';
import { Trigger } from './types';

export class TriggerService extends BaseMetadataService {
    public static async getTriggers(connection: DatabaseConnection, tableName?: string): Promise<Trigger[]> {
        const query = MetadataQueries.getTriggers(tableName);

        const rows = await Database.runMetaQuery('metadata', connection, query);
        return rows.map(row => ({
            name: row.RDB$TRIGGER_NAME.trim(),
            relation: row.RDB$RELATION_NAME ? row.RDB$RELATION_NAME.trim() : '',
            sequence: row.RDB$TRIGGER_SEQUENCE,
            type: row.RDB$TRIGGER_TYPE,
            inactive: row.RDB$TRIGGER_INACTIVE === 1
        }));
    }

    public static async getTriggerSource(connection: DatabaseConnection, name: string): Promise<string> {
        const query = MetadataQueries.getTriggerSource(name);
        const rows = await Database.runMetaQuery('metadata', connection, query);
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
}
