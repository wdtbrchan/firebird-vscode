/**
 * Helpers for safely embedding metadata names (table/index/column/etc.) into
 * Firebird SQL strings. The metadata queries in this extension fetch user
 * object names from RDB$ catalog tables and then build new SQL by string
 * concatenation. Without escaping, an apostrophe inside a name (or a
 * malicious value) would break the literal or allow injection.
 */

/**
 * Returns true if the identifier is safe to embed verbatim in SQL without
 * delimited quoting — alphanumerics, `_`, and `$`. Empty / non-string is
 * rejected.
 */
export function isSafeIdentifier(name: unknown): boolean {
    if (typeof name !== 'string' || name.length === 0) return false;
    return /^[A-Za-z0-9_$]+$/.test(name);
}

/**
 * Escapes a value for use inside a single-quoted SQL string literal:
 * doubles every apostrophe. Caller is responsible for the surrounding `'`.
 */
export function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Returns the identifier wrapped in double quotes, escaping any inner
 * double quote per SQL standard (`"` -> `""`). Use when an identifier may
 * contain spaces or other characters not allowed by the unquoted grammar.
 */
export function quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}
