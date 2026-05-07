import { ScriptParser } from '../services/scriptParser';

/**
 * Normalises a raw query string for direct execution.
 *
 *   - Trims whitespace.
 *   - Unwraps SET TERM blocks (returns the first parsed statement so the
 *     Firebird engine receives the inner block, not the SET TERM directives).
 *   - Drops a trailing `;`.
 *   - For non-SQL languages (PHP/JS/etc.) additionally strips a leading
 *     `$var = ` assignment and outer string quotes.
 */
export function cleanQueryForExecution(rawQuery: string, languageId: string): string {
    let cleanQuery = rawQuery.trim();
    if (!cleanQuery) return '';

    if (/^\s*SET\s+TERM\s+/i.test(cleanQuery)) {
        const parsed = ScriptParser.split(cleanQuery, false);
        if (parsed.length > 0) {
            cleanQuery = parsed[0];
        }
    }

    if (cleanQuery.endsWith(';')) {
        cleanQuery = cleanQuery.slice(0, -1).trim();
    }

    if (languageId !== 'sql') {
        const assignmentMatch = /^\$[\w\d_]+\s*=\s*/.exec(cleanQuery);
        if (assignmentMatch) {
            cleanQuery = cleanQuery.substring(assignmentMatch[0].length).trim();
        }

        if ((cleanQuery.startsWith('"') && cleanQuery.endsWith('"')) ||
            (cleanQuery.startsWith("'") && cleanQuery.endsWith("'"))) {
            cleanQuery = cleanQuery.substring(1, cleanQuery.length - 1);
        }
    }

    return cleanQuery;
}
