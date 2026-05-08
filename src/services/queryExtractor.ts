


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
        const setTermBlock = this.findSetTermBlock(text, offset);
        if (setTermBlock) {
            return { ...setTermBlock, type: 'SET_TERM' };
        }

        let start = 0;
        let end = text.length;

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
            
            // Clean up delimiter if user omitted space (e.g. SET TERM ^;)
            if (term.delimiter.length > 1 && term.delimiter.endsWith(currentDelimiter)) {
                term.delimiter = term.delimiter.substring(0, term.delimiter.length - currentDelimiter.length);
            }

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
        let i = 0;
        const len = text.length;

        let inString: string | null = null;
        let inComment: 'LINE' | 'BLOCK' | null = null;
        let stringStart = -1;

        // Linear scan from 0 because correct parsing depends on knowing whether
        // we're inside a string/comment by the time we reach `offset`. We bail
        // out as soon as we know the offset can't be inside any outer string.

        while (i < len) {
            const char = text[i];
            const next = i + 1 < len ? text[i + 1] : '';

            if (inString) {
                if (char === '\\') {
                    i += 2;
                    continue;
                }
                if (char === inString) {
                    const stringEnd = i;
                    if (stringStart <= offset && offset <= stringEnd) {
                        return {
                            content: text.substring(stringStart + 1, stringEnd),
                            quoteChar: inString,
                            start: stringStart,
                            length: stringEnd - stringStart + 1
                        };
                    }
                    inString = null;
                    stringStart = -1;
                    i++;
                    if (i >= offset) return null; // passed offset, not inside any string
                } else {
                    i++;
                }
            } else if (inComment === 'LINE') {
                if (char === '\n' || char === '\r') {
                    inComment = null;
                    i++;
                    // If we passed offset while still in a comment, the offset
                    // was inside that comment — not in a string.
                    if (i > offset) return null;
                } else {
                    i++;
                    if (i > offset) return null; // offset is inside this line comment
                }
            } else if (inComment === 'BLOCK') {
                if (char === '*' && next === '/') {
                    inComment = null;
                    i += 2;
                    if (i > offset) return null; // passed offset while in block comment
                } else {
                    i++;
                    if (i > offset) return null; // offset is inside this block comment
                }
            } else {
                if (char === '/' && next === '/') {
                    inComment = 'LINE';
                    i += 2;
                } else if (char === '#' && (i === 0 || /[\s\n\r]/.test(text[i - 1]))) {
                    inComment = 'LINE';
                    i++;
                } else if (char === '/' && next === '*') {
                    inComment = 'BLOCK';
                    i += 2;
                } else if (char === '"' || char === "'" || char === '`') {
                    // If a fresh string starts strictly past the offset, the
                    // offset was in code/whitespace — no outer string can cover it.
                    if (i > offset) return null;
                    inString = char;
                    stringStart = i;
                    i++;
                } else {
                    i++;
                }

                if (i > offset && !inString && !inComment) return null;
            }
        }

        return null;
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
