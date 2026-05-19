import { escapeSqlString, quoteIdentifier } from '../database/sqlIdentifier';

export type EditableCellValueKind = 'null' | 'number' | 'date' | 'string';

export interface EditableCellValue {
    kind: EditableCellValueKind;
    value: string | null;
}

export interface EditedRowPayload {
    rowIndex: number;
    originalValues: Record<string, EditableCellValue>;
    changedValues: Record<string, EditableCellValue>;
}

export interface UpdateScriptRequest {
    tableName: string;
    primaryKeyColumns: string[];
    rows: EditedRowPayload[];
}

function serializeValue(value: EditableCellValue): string {
    if (value.kind === 'null' || value.value === null) return 'NULL';
    if (value.kind === 'number') {
        if (!/^[-+]?(?:\d+|\d+\.\d+|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.value)) {
            throw new Error(`Invalid numeric value "${value.value}".`);
        }
        return value.value;
    }
    return `'${escapeSqlString(value.value)}'`;
}

export function buildUpdateScript(request: UpdateScriptRequest): string {
    if (!request.tableName.trim()) {
        throw new Error('Table name is required.');
    }
    if (request.primaryKeyColumns.length === 0) {
        throw new Error('At least one primary key column is required.');
    }
    if (request.rows.length === 0) {
        throw new Error('There are no changed rows to save.');
    }

    const quotedTable = quoteIdentifier(request.tableName);
    const statements = request.rows.map(row => {
        const changedColumns = Object.keys(row.changedValues);
        if (changedColumns.length === 0) {
            throw new Error(`Row ${row.rowIndex} does not contain changed values.`);
        }

        const setClause = changedColumns
            .map(column => `    ${quoteIdentifier(column)} = ${serializeValue(row.changedValues[column])}`)
            .join(',\n');

        const whereClause = request.primaryKeyColumns.map(column => {
            const originalValue = row.originalValues[column];
            if (!originalValue) {
                throw new Error(`Primary key column "${column}" is missing in row ${row.rowIndex}.`);
            }
            if (originalValue.kind === 'null') {
                throw new Error(`Primary key column "${column}" is NULL in row ${row.rowIndex}.`);
            }
            return `    ${quoteIdentifier(column)} = ${serializeValue(originalValue)}`;
        }).join('\n    AND ');

        return `UPDATE ${quotedTable}\nSET\n${setClause}\nWHERE\n${whereClause};`;
    });

    return [
        `-- Generated from edited query results`,
        `-- Table: ${request.tableName}`,
        `-- Rows: ${request.rows.length}`,
        '',
        ...statements
    ].join('\n\n');
}
