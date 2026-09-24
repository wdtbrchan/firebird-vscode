import { DatabaseConnection } from '../../database/types';
import { Database } from '../../database';
import { escapeSqlString, quoteIdentifier } from '../../database/sqlIdentifier';
import { MetadataQueries } from '../metadataQueries';
import { BaseMetadataService } from './baseMetadataService';

function udfArgumentType(row: Record<string, unknown>): string {
    const type = Number(row.RDB$FIELD_TYPE);
    const subType = Number(row.RDB$FIELD_SUB_TYPE ?? 0);
    const precision = Number(row.RDB$FIELD_PRECISION ?? 0);
    const scale = Math.abs(Number(row.RDB$FIELD_SCALE ?? 0));
    const length = Number(row.RDB$CHARACTER_LENGTH ?? row.RDB$FIELD_LENGTH);

    if (type === 7 || type === 8 || type === 16 || type === 27) {
        if (subType === 1 || subType === 2) {
            const numeric = subType === 1 ? 'NUMERIC' : 'DECIMAL';
            return `${numeric}(${precision || (type === 7 ? 4 : type === 8 ? 9 : type === 27 ? 15 : 18)},${scale})`;
        }
        if (type === 7) return 'SMALLINT';
        if (type === 8) return 'INTEGER';
        if (type === 16) return 'BIGINT';
        return 'DOUBLE PRECISION';
    }
    if (type === 10) return 'FLOAT';
    if (type === 12) return 'DATE';
    if (type === 13) return 'TIME';
    if (type === 35) return 'TIMESTAMP';
    if (type === 45 || type === 261) return 'BLOB';
    if (type === 14 || type === 37 || type === 40) {
        const name = type === 14 ? 'CHAR' : type === 37 ? 'VARCHAR' : 'CSTRING';
        const charset = String(row.RDB$CHARACTER_SET_NAME ?? '').trim();
        return `${name}(${length})${charset && charset !== 'NONE' ? ` CHARACTER SET ${quoteIdentifier(charset)}` : ''}`;
    }
    throw new Error(`Unsupported UDF argument type: ${type}`);
}

export function formatUdfDeclaration(name: string, definition: Record<string, unknown>, argumentsRows: Record<string, unknown>[]): string {
    const returnPosition = Number(definition.RDB$RETURN_ARGUMENT ?? 0);
    const inputRows = argumentsRows.filter(row => Number(row.RDB$ARGUMENT_POSITION) > 0);
    const inputTypes = inputRows.map(row => {
        const mechanism = Math.abs(Number(row.RDB$MECHANISM ?? 1));
        const modifier = mechanism === 2 ? ' BY DESCRIPTOR' : mechanism === 4 ? ' BY SCALAR_ARRAY' : mechanism === 5 ? ' NULL' : '';
        return `${udfArgumentType(row)}${modifier}`;
    });
    const returnRow = argumentsRows.find(row => Number(row.RDB$ARGUMENT_POSITION) === returnPosition);
    if (!returnRow) throw new Error(`Return argument not found for UDF ${name}`);

    const returnMechanism = Number(returnRow.RDB$MECHANISM ?? 1);
    const returnType = returnPosition > 0 ? `PARAMETER ${returnPosition}` : udfArgumentType(returnRow);
    const returnModifier = returnPosition > 0 ? '' : Math.abs(returnMechanism) === 0 ? ' BY VALUE' : Math.abs(returnMechanism) === 2 ? ' BY DESCRIPTOR' : '';
    const freeIt = returnMechanism < 0 ? ' FREE_IT' : '';
    const entryPoint = escapeSqlString(String(definition.RDB$ENTRYPOINT ?? '').trim());
    const moduleName = escapeSqlString(String(definition.RDB$MODULE_NAME ?? '').trim());
    if (!entryPoint || !moduleName) throw new Error(`External function details missing for ${name}`);

    const inputs = inputTypes.length ? `\n    ${inputTypes.join(',\n    ')}` : '';
    return `DECLARE EXTERNAL FUNCTION ${quoteIdentifier(name)}${inputs}\nRETURNS ${returnType}${returnModifier}${freeIt}\nENTRY_POINT '${entryPoint}' MODULE_NAME '${moduleName}';`;
}

export class UdfService extends BaseMetadataService {
    public static async getUdfFunctions(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getUdfFunctions, 'RDB$FUNCTION_NAME');
    }

    public static async getUdfDDL(connection: DatabaseConnection, name: string): Promise<string> {
        const definitions = await Database.runMetaQuery('metadata', connection, MetadataQueries.getUdfDefinition(name));
        if (!definitions.length) throw new Error(`UDF ${name} not found`);
        const argumentsRows = await Database.runMetaQuery('metadata', connection, MetadataQueries.getUdfArguments(name));
        return formatUdfDeclaration(name, definitions[0], argumentsRows);
    }
}
