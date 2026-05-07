/**
 * Pure CSV formatting helpers (no vscode / no I/O).
 */

export interface CsvFormat {
    delimiter: string;
    qualifier: string;
    decimalSeparator: '.' | ',';
}

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

function pad2(n: number): string {
    return n.toString().padStart(2, '0');
}

function formatDate(d: Date): string {
    const isDateOnly = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
    const dateOnly = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    if (isDateOnly) return dateOnly;
    return `${dateOnly} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * Renders a single value as a CSV field. null/undefined yield an empty
 * (un-qualified) field; everything else is qualified and any inner
 * qualifier is doubled.
 */
export function escapeCsvValue(value: unknown, fmt: CsvFormat): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Uint8Array) {
        return `${fmt.qualifier}[Blob]${fmt.qualifier}`;
    }

    let str: string;
    if (value instanceof Date) {
        str = formatDate(value);
    } else if (typeof value === 'object') {
        str = JSON.stringify(value);
    } else {
        str = String(value);
    }

    if (typeof value === 'number' && fmt.decimalSeparator === ',') {
        str = str.replace('.', ',');
    }

    const escapedQualifier = fmt.qualifier.replace(REGEX_META, '\\$&');
    const escaped = str.replace(new RegExp(escapedQualifier, 'g'), fmt.qualifier + fmt.qualifier);
    return `${fmt.qualifier}${escaped}${fmt.qualifier}`;
}

/**
 * Builds the full CSV body: header line plus one line per row, joined by '\n'.
 */
export function formatCsvRows(columns: string[], rows: Record<string, unknown>[], fmt: CsvFormat): string {
    const headerLine = columns.map(c => escapeCsvValue(c, fmt)).join(fmt.delimiter);
    if (rows.length === 0) return headerLine;
    const dataLines = rows.map(row => columns.map(c => escapeCsvValue(row[c], fmt)).join(fmt.delimiter));
    return [headerLine, ...dataLines].join('\n');
}
