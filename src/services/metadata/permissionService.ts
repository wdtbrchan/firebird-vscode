import { DatabaseConnection } from '../../database/types';
import { Database } from '../../database';
import { MetadataQueries } from '../metadataQueries';
import { BaseMetadataService } from './baseMetadataService';
import { TablePermission } from './types';

export class PermissionService extends BaseMetadataService {
    public static async getTablePermissions(connection: DatabaseConnection, tableName: string): Promise<TablePermission[]> {
        return this.getObjectPermissions(connection, tableName, 0); // 0 = Relation (Table/View)
    }

    public static async getObjectPermissions(connection: DatabaseConnection, objectName: string, objectType: number): Promise<TablePermission[]> {
        const query = MetadataQueries.getObjectPermissions(objectName, objectType);
        try {
            const rows = await Database.runMetaQuery('metadata', connection, query);
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
}
