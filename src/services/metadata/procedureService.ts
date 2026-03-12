import { DatabaseConnection } from '../../database/types';
import { Database } from '../../database';
import { MetadataQueries } from '../metadataQueries';
import { BaseMetadataService } from './baseMetadataService';

export class ProcedureService extends BaseMetadataService {
    public static async getProcedures(connection: DatabaseConnection): Promise<string[]> {
        return this.fetchNames(connection, MetadataQueries.getProcedures, 'RDB$PROCEDURE_NAME');
    }

    public static async getProcedureSource(connection: DatabaseConnection, name: string): Promise<string> {
        const query = MetadataQueries.getProcedureSource(name);
        
        try {
            const rows = await Database.runMetaQuery('metadata', connection, query);
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
            const rows = await Database.runMetaQuery('metadata', connection, query);
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
}
