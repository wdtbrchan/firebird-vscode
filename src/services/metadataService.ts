export * from './metadata/types';
export { TableService } from './metadata/tableService';
export { ProcedureService } from './metadata/procedureService';
export { ViewService } from './metadata/viewService';
export { TriggerService } from './metadata/triggerService';
export { IndexService } from './metadata/indexService';
export { GeneratorService } from './metadata/generatorService';
export { PermissionService } from './metadata/permissionService';

import { DatabaseConnection } from '../database/types';
import { TableService } from './metadata/tableService';
import { ProcedureService } from './metadata/procedureService';
import { ViewService } from './metadata/viewService';
import { TriggerService } from './metadata/triggerService';
import { IndexService } from './metadata/indexService';
import { GeneratorService } from './metadata/generatorService';
import { PermissionService } from './metadata/permissionService';
import { TablePermission, Trigger, IndexDetails } from './metadata/types';

/**
 * Facade over the per-object metadata services. Kept thin – all methods
 * forward straight to the corresponding service and pin the connection
 * type so misuse (e.g. passing the raw treeItem instead of its connection)
 * is caught at compile time.
 */
export class MetadataService {
    public static async getTables(conn: DatabaseConnection) { return TableService.getTables(conn); }
    public static async getTableDDL(conn: DatabaseConnection, name: string) { return TableService.getTableDDL(conn, name); }
    public static async getTableColumns(conn: DatabaseConnection, name: string) { return TableService.getTableColumns(conn, name); }
    public static async getPrimaryKeyColumns(conn: DatabaseConnection, name: string) { return TableService.getPrimaryKeyColumns(conn, name); }
    public static async getForeignKeyColumns(conn: DatabaseConnection, name: string) { return TableService.getForeignKeyColumns(conn, name); }
    public static async getTableDependencies(conn: DatabaseConnection, name: string) { return TableService.getTableDependencies(conn, name); }

    public static async getProcedures(conn: DatabaseConnection) { return ProcedureService.getProcedures(conn); }
    public static async getProcedureSource(conn: DatabaseConnection, name: string) { return ProcedureService.getProcedureSource(conn, name); }

    public static async getViews(conn: DatabaseConnection) { return ViewService.getViews(conn); }
    public static async getViewSource(conn: DatabaseConnection, name: string) { return ViewService.getViewSource(conn, name); }

    public static async getTriggers(conn: DatabaseConnection, table?: string) { return TriggerService.getTriggers(conn, table); }
    public static async getTriggerSource(conn: DatabaseConnection, name: string) { return TriggerService.getTriggerSource(conn, name); }
    public static decodeTriggerType(type: number) { return TriggerService.decodeTriggerType(type); }

    public static async getIndexes(conn: DatabaseConnection, table: string) { return IndexService.getIndexes(conn, table); }
    public static async getIndexDDL(conn: DatabaseConnection, name: string) { return IndexService.getIndexDDL(conn, name); }
    public static async getIndexDetails(conn: DatabaseConnection, name: string) { return IndexService.getIndexDetails(conn, name); }

    public static async getGenerators(conn: DatabaseConnection) { return GeneratorService.getGenerators(conn); }
    public static async getGeneratorDDL(conn: DatabaseConnection, name: string) { return GeneratorService.getGeneratorDDL(conn, name); }
    public static async getGeneratorValue(conn: DatabaseConnection, name: string) { return GeneratorService.getGeneratorValue(conn, name); }

    public static async getTablePermissions(conn: DatabaseConnection, name: string) { return PermissionService.getTablePermissions(conn, name); }
    public static async getObjectPermissions(conn: DatabaseConnection, name: string, type: number) { return PermissionService.getObjectPermissions(conn, name, type); }
    public static formatPermissions(perms: TablePermission[], name: string, type?: string) { return PermissionService.formatPermissions(perms, name, type); }
}
