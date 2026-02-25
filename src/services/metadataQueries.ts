/**
 * SQL queries for Firebird metadata extraction.
 */
export const MetadataQueries = {
    getTables: `
        SELECT RDB$RELATION_NAME 
        FROM RDB$RELATIONS 
        WHERE RDB$VIEW_BLR IS NULL 
          AND (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
        ORDER BY RDB$RELATION_NAME
    `,

    getViews: `
        SELECT RDB$RELATION_NAME 
        FROM RDB$RELATIONS 
        WHERE RDB$VIEW_BLR IS NOT NULL 
          AND (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
        ORDER BY RDB$RELATION_NAME
    `,

    getTriggers: (tableName?: string) => {
        let query = `
            SELECT RDB$TRIGGER_NAME, RDB$RELATION_NAME, RDB$TRIGGER_SEQUENCE, RDB$TRIGGER_TYPE, RDB$TRIGGER_INACTIVE 
            FROM RDB$TRIGGERS 
            WHERE (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
        `;
        if (tableName) {
            query += ` AND RDB$RELATION_NAME = '${tableName}'`;
        }
        query += ` ORDER BY RDB$TRIGGER_SEQUENCE`;
        return query;
    },

    getProcedures: `
        SELECT RDB$PROCEDURE_NAME 
        FROM RDB$PROCEDURES 
        WHERE (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
        ORDER BY RDB$PROCEDURE_NAME
    `,

    getGenerators: `
        SELECT RDB$GENERATOR_NAME 
        FROM RDB$GENERATORS 
        WHERE (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
        ORDER BY RDB$GENERATOR_NAME
    `,

    getViewSource: (name: string) => `
        SELECT RDB$VIEW_SOURCE 
        FROM RDB$RELATIONS 
        WHERE RDB$RELATION_NAME = '${name}'
    `,

    getTriggerSource: (name: string) => `
        SELECT RDB$TRIGGER_SOURCE, RDB$RELATION_NAME, RDB$TRIGGER_TYPE, RDB$TRIGGER_SEQUENCE, RDB$TRIGGER_INACTIVE
        FROM RDB$TRIGGERS 
        WHERE RDB$TRIGGER_NAME = '${name}'
    `,

    getProcedureSource: (name: string) => `
        SELECT RDB$PROCEDURE_SOURCE 
        FROM RDB$PROCEDURES 
        WHERE RDB$PROCEDURE_NAME = '${name}'
    `,

    getProcedureParameters: (procName: string, type: number) => `
        SELECT p.RDB$PARAMETER_NAME, f.RDB$FIELD_TYPE, f.RDB$FIELD_LENGTH, f.RDB$FIELD_PRECISION, f.RDB$FIELD_SCALE, f.RDB$FIELD_SUB_TYPE
        FROM RDB$PROCEDURE_PARAMETERS p
        LEFT JOIN RDB$FIELDS f ON p.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
        WHERE p.RDB$PROCEDURE_NAME = '${procName}' AND p.RDB$PARAMETER_TYPE = ${type}
        ORDER BY p.RDB$PARAMETER_NUMBER
    `,

    getTableFields: (name: string) => `
        SELECT rf.RDB$FIELD_NAME, f.RDB$FIELD_TYPE, f.RDB$FIELD_LENGTH, f.RDB$FIELD_PRECISION, f.RDB$FIELD_SCALE, f.RDB$FIELD_SUB_TYPE, rf.RDB$NULL_FLAG
        FROM RDB$RELATION_FIELDS rf
        JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
        WHERE rf.RDB$RELATION_NAME = '${name}'
        ORDER BY rf.RDB$FIELD_POSITION
    `,

    getGeneratorValue: (name: string) => `SELECT GEN_ID(${name}, 0) AS CUR_VAL FROM RDB$DATABASE`,

    getIndexes: (tableName: string) => `
        SELECT i.RDB$INDEX_NAME, i.RDB$UNIQUE_FLAG, i.RDB$INDEX_INACTIVE, s.RDB$FIELD_NAME
        FROM RDB$INDICES i
        LEFT JOIN RDB$INDEX_SEGMENTS s ON i.RDB$INDEX_NAME = s.RDB$INDEX_NAME
        WHERE i.RDB$RELATION_NAME = '${tableName}'
          AND (i.RDB$SYSTEM_FLAG IS NULL OR i.RDB$SYSTEM_FLAG = 0)
        ORDER BY i.RDB$INDEX_NAME, s.RDB$FIELD_POSITION
    `,

    getTableColumnsDetailed: (tableName: string) => `
        SELECT 
            rf.RDB$FIELD_NAME, 
            f.RDB$FIELD_TYPE, 
            f.RDB$FIELD_SUB_TYPE,
            f.RDB$FIELD_LENGTH, 
            f.RDB$FIELD_PRECISION, 
            f.RDB$FIELD_SCALE, 
            rf.RDB$NULL_FLAG,
            rf.RDB$DEFAULT_SOURCE,
            f.RDB$COMPUTED_SOURCE
        FROM RDB$RELATION_FIELDS rf
        JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
        WHERE rf.RDB$RELATION_NAME = '${tableName}'
        ORDER BY rf.RDB$FIELD_POSITION
    `,

    getPrimaryKeyColumns: (tableName: string) => `
        SELECT s.RDB$FIELD_NAME
        FROM RDB$RELATION_CONSTRAINTS rc
        LEFT JOIN RDB$INDEX_SEGMENTS s ON rc.RDB$INDEX_NAME = s.RDB$INDEX_NAME
        WHERE rc.RDB$RELATION_NAME = '${tableName}'
          AND rc.RDB$CONSTRAINT_TYPE = 'PRIMARY KEY'
        ORDER BY s.RDB$FIELD_POSITION
    `,

    getForeignKeyColumns: (tableName: string) => `
         SELECT 
            s.RDB$FIELD_NAME AS COLUMN_NAME,
            target_idx.RDB$RELATION_NAME AS TARGET_TABLE,
            target_s.RDB$FIELD_NAME AS TARGET_COLUMN
        FROM RDB$RELATION_CONSTRAINTS rc
        JOIN RDB$INDEX_SEGMENTS s ON rc.RDB$INDEX_NAME = s.RDB$INDEX_NAME
        JOIN RDB$INDICES src_idx ON rc.RDB$INDEX_NAME = src_idx.RDB$INDEX_NAME
        JOIN RDB$INDICES target_idx ON src_idx.RDB$FOREIGN_KEY = target_idx.RDB$INDEX_NAME
        JOIN RDB$INDEX_SEGMENTS target_s ON target_idx.RDB$INDEX_NAME = target_s.RDB$INDEX_NAME 
                                         AND s.RDB$FIELD_POSITION = target_s.RDB$FIELD_POSITION
        WHERE rc.RDB$RELATION_NAME = '${tableName}'
          AND rc.RDB$CONSTRAINT_TYPE = 'FOREIGN KEY'
    `,

    getTableDependencies: (tableName: string) => `
        SELECT DISTINCT d.RDB$DEPENDENT_NAME, d.RDB$DEPENDENT_TYPE
        FROM RDB$DEPENDENCIES d
        WHERE d.RDB$DEPENDED_ON_NAME = '${tableName}'
          AND d.RDB$DEPENDED_ON_TYPE = 0 
          AND d.RDB$DEPENDENT_TYPE = 1 
        ORDER BY d.RDB$DEPENDENT_NAME
    `,

    getObjectPermissions: (objectName: string, objectType: number) => `
        SELECT RDB$USER, RDB$PRIVILEGE, RDB$GRANTOR, RDB$GRANT_OPTION
        FROM RDB$USER_PRIVILEGES
        WHERE RDB$RELATION_NAME = '${objectName}'
          AND RDB$OBJECT_TYPE = ${objectType}
        ORDER BY RDB$USER, RDB$PRIVILEGE
    `,

    getIndexInfo: (indexName: string) => `
        SELECT RDB$RELATION_NAME, RDB$UNIQUE_FLAG, RDB$INDEX_INACTIVE, RDB$INDEX_TYPE, RDB$STATISTICS, RDB$EXPRESSION_SOURCE
        FROM RDB$INDICES 
        WHERE RDB$INDEX_NAME = '${indexName}'
    `,

    getIndexSegments: (indexName: string) => `
        SELECT RDB$FIELD_NAME 
        FROM RDB$INDEX_SEGMENTS 
        WHERE RDB$INDEX_NAME = '${indexName}' 
        ORDER BY RDB$FIELD_POSITION
    `
};
