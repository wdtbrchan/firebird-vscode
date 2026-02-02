
export class ScriptParser {
    /**
     * Splits a SQL script into individual statements, respecting SET TERM directives.
     * @param script The full SQL script.
     * @returns An array of SQL statements.
     */
    public static split(script: string): string[] {
        const statements: string[] = [];
        const lines = script.split(/\r?\n/);
        
        let currentDelimiter = ';';
        let currentStatement = '';
        let inString = false;
        let stringChar = '';

        // Simple line-based parser that handles SET TERM and multi-line statements.
        // This is a heuristic parser. A full FSM would be better but this covers most cases.
        // We iterate char by char effectively, but we can look at lines to detect SET TERM easily.

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            const originalLine = lines[i];

            // Check for SET TERM at the start of the line (ignoring case)
            if (line.toUpperCase().startsWith('SET TERM')) {
                // Parse new terminator
                // Format: SET TERM <new_term> <old_term/empty>
                // Example: SET TERM ^ ; or SET TERM ^;
                // Actually usually: SET TERM ^ ;  (changes to ^)
                // or SET TERM ; ^ (changes back to ;)
                
                const parts = line.split(/\s+/);
                if (parts.length >= 3) {
                    currentDelimiter = parts[2]; // usually the 3rd part "SET" "TERM" "^"
                    // If the delimiter is part of the command like "SET TERM ^;", we need to handle that.
                    // But Firebird uses space usually.
                } 
                // Don't add SET TERM line to statements to be executed by the driver?
                // The driver doesn't understand SET TERM most likely. 
                // So we consume it here and don't push it.
                continue;
            }

            // Append line with newline to preserve formatting (mostly)
            // But we need to check for delimiter.
            // Note: We need a more robust char-by-char loop if we want to handle comments/strings perfectly.
            // Given the complexity of DDLs (triggers with strings inside), a char loop is safer.
        }
        
        // Let's restart with a char-loop approach on the whole text.
        return this.parseCharByChar(script);
    }

    private static parseCharByChar(script: string): string[] {
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
                     delimiter = match[1];
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

            // Check for delimiter
            // Delimiter can be multi-char? Firebird usually single char but potentially string.
            // We assume delimiter matches the sequence at i.
            if (!inString && !inLineComment && !inBlockComment) {
                if (script.substr(i, delimiter.length) === delimiter) {
                     // Found statement end
                     if (buffer.trim().length > 0) {
                         statements.push(buffer.trim());
                     }
                     buffer = '';
                     i += delimiter.length;
                     continue;
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
}
