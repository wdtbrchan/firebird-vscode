import { escapeSqlString } from '../database/sqlIdentifier';

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

function formatIdentifier(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
        throw new Error('Identifier name is required.');
    }
    return trimmed;
}

function resolveColumnName(column: string, row: EditedRowPayload): string {
    const requested = formatIdentifier(column);
    const availableColumns = Object.keys(row.originalValues);
    if (Object.prototype.hasOwnProperty.call(row.originalValues, requested)) {
        return requested;
    }

    const matches = availableColumns.filter(name => name.toUpperCase() === requested.toUpperCase());
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        throw new Error(`Primary key column "${column}" is ambiguous in row ${row.rowIndex}.`);
    }

    throw new Error(`Primary key column "${column}" is missing in row ${row.rowIndex}.`);
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

    const tableName = formatIdentifier(request.tableName);
    const statements = request.rows.map(row => {
        const changedColumns = Object.keys(row.changedValues);
        if (changedColumns.length === 0) {
            throw new Error(`Row ${row.rowIndex} does not contain changed values.`);
        }

        const setClause = changedColumns
            .map(column => `    ${formatIdentifier(column)} = ${serializeValue(row.changedValues[column])}`)
            .join(',\n');

        const whereClause = request.primaryKeyColumns.map(column => {
            const resolvedColumn = resolveColumnName(column, row);
            const originalValue = row.originalValues[resolvedColumn];
            if (originalValue.kind === 'null') {
                throw new Error(`Primary key column "${column}" is NULL in row ${row.rowIndex}.`);
            }
            return `    ${formatIdentifier(resolvedColumn)} = ${serializeValue(originalValue)}`;
        }).join('\n    AND ');

        return `UPDATE ${tableName}\nSET\n${setClause}\nWHERE\n${whereClause};`;
    });

    return [
        `-- Generated from edited query results`,
        `-- Table: ${request.tableName}`,
        `-- Rows: ${request.rows.length}`,
        '',
        ...statements
    ].join('\n\n');
}
