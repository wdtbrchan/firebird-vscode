


export class QueryExtractor {

    /**
     * Extracts a SQL query from the given document text at the specified offset.
     */
    public static extract(text: string, offset: number, languageId: string, useEmptyLineAsSeparator: boolean = false): { text: string, startOffset: number } | null {
        if (languageId === 'sql') {
            return this.extractSqlFile(text, offset, useEmptyLineAsSeparator);
        }

        // 1. Find the outermost string literal covering the offset
        const stringInfo = this.findOutermostString(text, offset);
        if (!stringInfo) {
            return null;
        }

        let { content, quoteChar, start } = stringInfo;

        // 2. Cleanup
        if (quoteChar === '"') {
            // Unescape double quotes
            content = content.replace(/\\"/g, '"');
        } else if (quoteChar === "'") {
            // Unescape single quotes and backslashes
            content = content.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        }

        // 3. Fallback/Safety: If existing logic in extension.ts had specific trimming, we emulate it.
        // The user request shows clean SQL.
        return { text: content.trim(), startOffset: start + 1 }; // start + 1 to skip quote
    }

    private static extractSqlFile(text: string, offset: number, useEmptyLineAsSeparator: boolean): { text: string, startOffset: number } | null {
        // Find statement between semicolons or empty lines
        let start = 0;
        let end = text.length;

        const isEmptyLine = (idx: number): boolean => {
            if (!useEmptyLineAsSeparator) return false;
            // Scan for \n\s*\n
            // Simplified: check if at idx there is a newline and then only whitespace until another newline
            if (text[idx] !== '\n' && text[idx] !== '\r') return false;
            
            // Check backward or forward?
            // This helper should probably just check if the current position is part of an "empty line separator"
            return false; // See below for better implementation
        };

        // Backward scan
        for (let i = offset - 1; i >= 0; i--) {
            if (text[i] === ';') {
                start = i + 1;
                break;
            }
            if (useEmptyLineAsSeparator && (text[i] === '\n' || text[i] === '\r')) {
                // Check if the previous line was empty (or only whitespace)
                let j = i - 1;
                while (j >= 0 && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r')) {
                    j--;
                }
                if (j >= 0 && text[j] === '\n') {
                    start = i + 1;
                    break;
                }
                if (j < 0) { // start of file
                    start = 0;
                }
            }
        }

        // Forward scan
        for (let i = offset; i < text.length; i++) {
             if (text[i] === ';') {
                 end = i;
                 break;
             }
             if (useEmptyLineAsSeparator && (text[i] === '\n' || text[i] === '\r')) {
                 // Check if the next line is empty
                 let j = i + 1;
                 if (text[i] === '\r' && text[j] === '\n') j++;
                 
                 while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r')) {
                     j++;
                 }
                 if (j < text.length && text[j] === '\n') {
                     end = i;
                     break;
                 }
             }
        }
        
        const content = text.substring(start, end);
        // Find leading whitespace length
        const leadingWhitespace = content.length - content.trimStart().length;
        const actualStart = start + leadingWhitespace;
        
        return { text: content.trim(), startOffset: actualStart };
    }

    private static findOutermostString(text: string, offset: number): { content: string, quoteChar: string, length: number, start: number } | null {
        // Scan backwards to find potential start quotes.
        // We look for " or ' that are NOT escaped.
        // For each candidate, we check if there is a matching end quote AFTER the offset.
        
        const candidates: { start: number, char: string }[] = [];
        
        // Optimization: limit lookback to reasonable size (e.g. 50KB or 2000 lines) 
        // to prevent freezing on huge files.
        const limit = 50000; 
        const minIndex = Math.max(0, offset - limit);

        for (let i = offset - 1; i >= minIndex; i--) {
            const char = text[i];
            const prev = i > 0 ? text[i-1] : '';
            
            // Check for unescaped quote
            if ((char === '"' || char === "'") && prev !== '\\') {
                candidates.push({ start: i, char });
                // We keep searching backwards to find *outer* quotes.
                // But we can stop if we find too many unconnected quotes? 
                // No, we just collect them.
                if (candidates.length > 20) break; // limit candidates
            }
        }

        // Check candidates. We want the one that:
        // 1. Encloses the offset (end > offset)
        // 2. Is the "largest" / outermost valid string.
        
        let bestMatch: { content: string, quoteChar: string, length: number, start: number } | null = null;
        
        for (const candidate of candidates) {
            const end = this.findMatchingQuote(text, candidate.start + 1, candidate.char);
            
            // If valid string and contains offset
            // We need strictly > offset for end quote? offset is where cursor is.
            // If cursor is AT the closing quote, it's inside? 
            // Usually cursor |" is inside if we consider " to " range.
            if (end !== -1 && end >= offset) {
                // Determine if this is "better" (larger/outer)
                const len = end - candidate.start;
                
                if (!bestMatch || len > bestMatch.length) {
                    const content = text.substring(candidate.start + 1, end);
                    bestMatch = { content, quoteChar: candidate.char, length: len, start: candidate.start };
                }
            }
        }
        
        return bestMatch;
    }

    private static findMatchingQuote(text: string, startIndex: number, quoteChar: string): number {
        // Scan forward
        for (let i = startIndex; i < text.length; i++) {
            const char = text[i];
            const prev = i > 0 ? text[i-1] : '';
            
            if (char === quoteChar && prev !== '\\') {
                return i;
            }
        }
        return -1;
    }

    /**
     * Checks if the given text contains common SQL keywords.
     * This is used to filter out CodeLens in non-SQL files where the string might not be a query.
     */
    public static hasSqlKeywords(text: string): boolean {
        // List of common SQL keywords. 
        // We use word boundaries \b to ensure we match whole words.
        // Case insensitive match is handled by the regex flag 'i'.
        const keywords = [
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 
            'CREATE', 'ALTER', 'DROP', 'RECREATE',
            'EXECUTE', 'EXEC', 'MERGE', 
            'GRANT', 'REVOKE', 
            'COMMIT', 'ROLLBACK', 
            'SET', 'DECLARE', 'WITH'
        ];
        
        // Construct regex: /\b(SELECT|INSERT|...)\b/i
        const pattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'i');
        return pattern.test(text);
    }
}
