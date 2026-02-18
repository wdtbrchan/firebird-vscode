


export class QueryExtractor {

    /**
     * Extracts a SQL query from the given document text at the specified offset.
     */
    public static extract(text: string, offset: number, languageId: string, useEmptyLineAsSeparator: boolean = false): { text: string, startOffset: number, type?: string } | null {
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
        return { text: content.trim(), startOffset: start + 1, type: 'QUERY' }; // start + 1 to skip quote
    }

    private static extractSqlFile(text: string, offset: number, useEmptyLineAsSeparator: boolean): { text: string, startOffset: number, type?: string } | null {
        // First, check if the offset is inside a SET TERM block
        const setTermBlock = this.findSetTermBlock(text, offset);
        if (setTermBlock) {
            return { ...setTermBlock, type: 'SET_TERM' };
        }

        // Standard extraction logic
        // Find statement between semicolons or empty lines
        let start = 0;
        let end = text.length;
        
        // ... existing logic ...
        // I need to keep the existing logic. I will rewrite the whole function to include the check at top, 
        // and then paste the existing logic back.
        // Actually, to minimalize diff, I can just insert the check at the top.
        // I'll assume the user wants me to implement the helper and call it.

        const isEmptyLine = (idx: number): boolean => {
            if (!useEmptyLineAsSeparator) return false;
            // Scan for \n\s*\n
            if (text[idx] !== '\n' && text[idx] !== '\r') return false;
            return false; 
        };

        // Backward scan
        for (let i = offset - 1; i >= 0; i--) {
            if (text[i] === ';') {
                start = i + 1;
                break;
            }
            if (useEmptyLineAsSeparator && (text[i] === '\n' || text[i] === '\r')) {
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
        const leadingWhitespace = content.length - content.trimStart().length;
        const actualStart = start + leadingWhitespace;
        
        return { text: content.trim(), startOffset: actualStart, type: 'QUERY' };
    }

    private static findSetTermBlock(text: string, offset: number): { text: string, startOffset: number } | null {
        const setTermPattern = /^\s*SET\s+TERM\s+(\S+)/gim;
        let match;
        const setTerms: { index: number, delimiter: string, length: number }[] = [];
        
        while ((match = setTermPattern.exec(text)) !== null) {
            setTerms.push({ index: match.index, delimiter: match[1], length: match[0].length });
        }

        if (setTerms.length === 0) {
            return null;
        }

        let currentDelimiter = ';';
        let blockStart = -1;
        let lastClosedBlock: { text: string, startOffset: number, endOffset: number } | null = null;
        
        for (let i = 0; i < setTerms.length; i++) {
            const term = setTerms[i];
            
            // Start of a block: switching away from default delimiter
            if (currentDelimiter === ';' && term.delimiter !== ';') {
                blockStart = term.index;
            }
            // End of a block: switching back to default delimiter
            else if (currentDelimiter !== ';' && term.delimiter === ';') {
                // Determine the end of this restoring statement
                let absoluteEnd = text.indexOf(currentDelimiter, term.index + term.length);
                if (absoluteEnd === -1) {
                    absoluteEnd = text.length;
                } else {
                    absoluteEnd += currentDelimiter.length; 
                }
                
                if (blockStart !== -1) {
                    const block = { 
                        text: text.substring(blockStart, absoluteEnd).trim(), 
                        startOffset: blockStart,
                        endOffset: absoluteEnd
                    };

                    // Check if offset is inside
                    if (offset >= blockStart && offset < absoluteEnd) {
                        return { text: block.text, startOffset: block.startOffset };
                    }
                    
                    lastClosedBlock = block;
                }
                blockStart = -1;
            }
            
            currentDelimiter = term.delimiter;
        }
        
        // Handle case where block is open at EOF
        if (currentDelimiter !== ';' && blockStart !== -1) {
            if (offset >= blockStart) {
                return { 
                    text: text.substring(blockStart).trim(), 
                    startOffset: blockStart 
                };
            }
        }

        // If we are here, offset is not inside any block.
        // Check if we are in the trailing whitespace of the last closed block.
        if (lastClosedBlock && offset >= lastClosedBlock.endOffset) {
            const gap = text.substring(lastClosedBlock.endOffset, offset);
            if (gap.trim().length === 0) {
                // If the gap is empty (only whitespace), we might be trailing the block.
                // However, if the character AT the cursor is non-whitespace, we are likely at the start of a new statement.
                // In that case, we should let the standard extractor handle it.
                const charAtCursor = offset < text.length ? text[offset] : ' ';
                if (!charAtCursor.trim()) {
                    return { text: lastClosedBlock.text, startOffset: lastClosedBlock.startOffset };
                }
            }
        }

        return null;
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
