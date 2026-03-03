export * from './metadata/types';
export { TableService } from './metadata/tableService';
export { ProcedureService } from './metadata/procedureService';
export { ViewService } from './metadata/viewService';
export { TriggerService } from './metadata/triggerService';
export { IndexService } from './metadata/indexService';
export { GeneratorService } from './metadata/generatorService';
export { PermissionService } from './metadata/permissionService';

// Facade to maintain backward compatibility with existing codebase
// while we refactor the imports.
import { TableService } from './metadata/tableService';
import { ProcedureService } from './metadata/procedureService';
import { ViewService } from './metadata/viewService';
import { TriggerService } from './metadata/triggerService';
import { IndexService } from './metadata/indexService';
import { GeneratorService } from './metadata/generatorService';
import { PermissionService } from './metadata/permissionService';

export class MetadataService {
    public static async getTables(conn: any) { return TableService.getTables(conn); }
    public static async getTableDDL(conn: any, name: string) { return TableService.getTableDDL(conn, name); }
    public static async getTableColumns(conn: any, name: string) { return TableService.getTableColumns(conn, name); }
    public static async getPrimaryKeyColumns(conn: any, name: string) { return TableService.getPrimaryKeyColumns(conn, name); }
    public static async getForeignKeyColumns(conn: any, name: string) { return TableService.getForeignKeyColumns(conn, name); }
    public static async getTableDependencies(conn: any, name: string) { return TableService.getTableDependencies(conn, name); }

    public static async getProcedures(conn: any) { return ProcedureService.getProcedures(conn); }
    public static async getProcedureSource(conn: any, name: string) { return ProcedureService.getProcedureSource(conn, name); }

    public static async getViews(conn: any) { return ViewService.getViews(conn); }
    public static async getViewSource(conn: any, name: string) { return ViewService.getViewSource(conn, name); }

    public static async getTriggers(conn: any, table?: string) { return TriggerService.getTriggers(conn, table); }
    public static async getTriggerSource(conn: any, name: string) { return TriggerService.getTriggerSource(conn, name); }
    public static decodeTriggerType(type: number) { return TriggerService.decodeTriggerType(type); }

    public static async getIndexes(conn: any, table: string) { return IndexService.getIndexes(conn, table); }
    public static async getIndexDDL(conn: any, name: string) { return IndexService.getIndexDDL(conn, name); }
    public static async getIndexDetails(conn: any, name: string) { return IndexService.getIndexDetails(conn, name); }

    public static async getGenerators(conn: any) { return GeneratorService.getGenerators(conn); }
    public static async getGeneratorDDL(conn: any, name: string) { return GeneratorService.getGeneratorDDL(conn, name); }
    public static async getGeneratorValue(conn: any, name: string) { return GeneratorService.getGeneratorValue(conn, name); }

    public static async getTablePermissions(conn: any, name: string) { return PermissionService.getTablePermissions(conn, name); }
    public static async getObjectPermissions(conn: any, name: string, type: number) { return PermissionService.getObjectPermissions(conn, name, type); }
    public static formatPermissions(perms: any, name: string, type?: string) { return PermissionService.formatPermissions(perms, name, type); }
}
