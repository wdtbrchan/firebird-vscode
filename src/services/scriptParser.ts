
export class ScriptParser {
    /**
     * Splits a SQL script into individual statements, respecting SET TERM directives.
     * @param script The full SQL script.
     * @param useEmptyLineAsSeparator Whether to treat empty lines as separators.
     * @returns An array of SQL statements.
     */
    public static split(script: string, useEmptyLineAsSeparator: boolean = false): string[] {
        const statements: string[] = [];
        const lines = script.split(/\r?\n/);
        
        // ... (existing line-based logic omitted for brevity as it's not used)

        // Let's restart with a char-loop approach on the whole text.
        return this.parseCharByChar(script, useEmptyLineAsSeparator);
    }

    private static parseCharByChar(script: string, useEmptyLineAsSeparator: boolean): string[] {
        const statements: string[] = [];
        let buffer = '';
        let delimiter = ';';
        let i = 0;
        let inString = false;
        let stringQuote = '';
        let inLineComment = false;
        let inBlockComment = false;

        while (i < script.length) {
            const char = script[i];
            const nextChar = script[i + 1] || '';
            const prevChar = i > 0 ? script[i - 1] : '';

            // Handle comments
            if (inLineComment) {
                if (char === '\n') {
                    inLineComment = false;
                    buffer += char;
                }
                // Don't add comment content to buffer? 
                // Usually we want to preserve comments in procedures/triggers.
                // But for splitting execution, we can keep them.
                else {
                    buffer += char;
                }
                i++;
                continue;
            }

            if (inBlockComment) {
                buffer += char;
                if (char === '*' && nextChar === '/') {
                    inBlockComment = false;
                    buffer += '/';
                    i += 2; // skip /
                    continue;
                }
                i++;
                continue;
            }

            // Start comments
            if (!inString && char === '-' && nextChar === '-') {
                inLineComment = true;
                buffer += '--';
                i += 2;
                continue;
            }
            if (!inString && char === '/' && nextChar === '*') {
                inBlockComment = true;
                buffer += '/*';
                i += 2;
                continue;
            }

            // Strings
            if (char === "'" || char === '"') {
                if (!inString) {
                    inString = true;
                    stringQuote = char;
                } else if (inString && char === stringQuote) {
                    // Check for escaped quote? SQL uses '' for ' inside string
                    // But Firebird strings...
                    inString = false;
                }
                buffer += char;
                i++;
                continue;
            }

            // Check for SET TERM command
            // We need to look ahead for "SET TERM" if we are at start of line or buffer is "clean"
            // Simplified: if buffer trims to empty, check if we are starting SET TERM
            if (!inString && buffer.trim() === '' && (char === 'S' || char === 's')) {
                const rest = script.substring(i);
                const match = /^\s*SET\s+TERM\s+(\S+)/i.exec(rest);
                if (match) {
                     // Found SET TERM
                     let newDelim = match[1];
                     
                     // Clean up delimiter if user omitted space (e.g. SET TERM ^;)
                     if (newDelim.length > 1 && newDelim.endsWith(delimiter)) {
                         newDelim = newDelim.substring(0, newDelim.length - delimiter.length);
                     }
                     
                     delimiter = newDelim;
                     
                     // Skip the whole line/command. 
                     // We assume SET TERM ends with newline or is just a directive.
                     
                     // NOTE: SET TERM line often has the *old* delimiter at the end too?
                     // e.g. "SET TERM ^ ;" -> changing to ^, old was ;
                     // or "SET TERM ; ^" -> changing to ;, old was ^
                     
                     // The match[1] detects the first token after TERM.
                     // If user writes "SET TERM ^ ;", match[1] is "^".
                     
                     // We need to advance i past this command.
                     // Find the end of line or next whitespace?
                     
                     // Let's consume until newline.
                     const lineEnd = script.indexOf('\n', i);
                     const jump = lineEnd === -1 ? script.length : lineEnd + 1;
                     
                     // Also check if the delimiter token matches what we found.
                     // If line is "SET TERM ^ ;", parts are SET, TERM, ^, ;
                     // Our regex captured ^.
                     
                     i = jump;
                     continue; // Don't add SET TERM to buffer
                }
            }

            // Check for delimiter or empty line separator
            if (!inString && !inLineComment && !inBlockComment) {
                // Regular delimiter check
                if (script.substr(i, delimiter.length) === delimiter) {
                     // Found statement end
                     if (buffer.trim().length > 0) {
                         statements.push(buffer.trim());
                     }
                     buffer = '';
                     i += delimiter.length;
                     continue;
                }

                // Empty line separator check
                if (useEmptyLineAsSeparator && delimiter === ';' && (char === '\n' || char === '\r')) {
                    // Check if the current line being finished is empty (only whitespace)
                    // and if it was preceded by a newline.
                    // Actually, we want to split when we see a newline followed by an empty line.
                    
                    // Let's check for \n\s*\n
                    const rest = script.substring(i);
                    const match = /^(\r?\n\s*){2,}/.exec(rest);
                    if (match) {
                        if (buffer.trim().length > 0) {
                            statements.push(buffer.trim());
                        }
                        buffer = '';
                        i += match[0].length;
                        continue;
                    }
                }
            }

            buffer += char;
            i++;
        }

        if (buffer.trim().length > 0) {
            statements.push(buffer.trim());
        }

        return statements;
    }

    /**
     * Checks if a SQL statement is a DDL command (CREATE, ALTER, DROP, RECREATE).
     * @param query The SQL query to check.
     */
    public static isDDL(query: string): boolean {
        // Simple comment stripping (careful with strings, but good enough for start-of-statement check)
        // We handle block comments /* ... */ and line comments -- ...
        // We match comments found anywhere, but most importantly at the start.
        
        // Note: Regex comment stripping might be imperfect for strings containing comment markers.
        // But since we check for keywords at the START of the resulting string, 
        // it's unlikely a SELECT statement would become a CREATE statement unless 'SELECT' was inside a comment.
        
        const clean = query
            .replace(/\/\*[\s\S]*?\*\//g, '') // remove block comments
            .replace(/--.*$/gm, '')           // remove line comments
            .trim();
            
        return /^\s*(CREATE|ALTER|DROP|RECREATE)\b/i.test(clean);
    }
}
