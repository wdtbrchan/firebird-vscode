import { QueryOptions } from './types';

/**
 * Applies pagination (FIRST/SKIP) to a SELECT query if not already present.
 * Also checks for ROWS clause to avoid conflict.
 */
export function applyPagination(query: string, queryOptions?: QueryOptions): string {
    const cleanQuery = query.trim().replace(/;$/, '');
    
    // Regex to match SELECT and any leading comments/whitespace
    const selectRegex = /^(\s*(?:\/\*[\s\S]*?\*\/|\-\-.*?\n|\s+)*)(select)(\s+first\s+\d+|\s+skip\s+\d+)?/i;
    
    const match = selectRegex.exec(cleanQuery);
    
    // Check if query ends with ROWS clause
    // FIREBIRD 2.5+: ROWS <m> [TO <n>] [BY <step>] [PERCENT] [WITH TIES]
    const rowsRegex = /rows\s+\d+(\s+(to|by)\s+\d+)?(\s+percent)?(\s+with\s+ties)?\s*$/i;
    const hasRowsClause = rowsRegex.test(cleanQuery);

    const hasExistingPagination = (match && match[3]) || hasRowsClause ? true : false;
    
    if (queryOptions && queryOptions.limit && !hasExistingPagination && match) {
        const limit = queryOptions.limit;
        const skip = queryOptions.offset || 0;
        
        // Reconstruct the query: [comments] SELECT FIRST [limit] SKIP [skip] [rest of query]
        const leading = match[1];
        const selectWord = match[2];
        const restOfQuery = cleanQuery.substring(match[0].length);
        
        return `${leading}${selectWord} FIRST ${limit} SKIP ${skip}${restOfQuery}`;
    }
    return cleanQuery;
}
