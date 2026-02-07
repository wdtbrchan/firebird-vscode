


export class QueryExtractor {

    /**
     * Extracts a SQL query from the given document text at the specified offset.
     */
    public static extract(text: string, offset: number, languageId: string): { text: string, startOffset: number } | null {
        if (languageId === 'sql') {
            return this.extractSqlFile(text, offset);
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

    private static extractSqlFile(text: string, offset: number): { text: string, startOffset: number } | null {
        // Find statement between semicolons
        let start = 0;
        let end = text.length;

        // Backward scan for ;
        for (let i = offset - 1; i >= 0; i--) {
            if (text[i] === ';') {
                start = i + 1;
                break;
            }
        }

        // Forward scan for ;
        for (let i = offset; i < text.length; i++) {
             if (text[i] === ';') {
                 end = i;
                 break;
             }
        }
        
        return { text: text.substring(start, end).trim(), startOffset: start };
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
}
