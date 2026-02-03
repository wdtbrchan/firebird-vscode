
export class ParameterInjector {
    /**
     * Injects parameters into the query string based on comments following the '?' placeholder.
     * Supports:
     *   ? --@val='string'
     *   ? --@val=123
     *   ? / * @val='string' * /
     *   ? / * @val=123 * /
     */
    public static inject(query: string): string {
        // Regex explaining:
        // \?                  Match literal '?'
        // (\s*)               Capture whitespace after ?
        // (?:                 Non-capturing group for comment variants
        //   --\s*@val\s*=\s*(.+?)$      Line comment: -- @val=... until end of line
        //   |                           OR
        //   \/\*\s*@val\s*=\s*(.+?)\s*\*\/  Block comment: /* @val=... */
        // )
        // Flags: g (global), m (multiline)
        
        const regex = /\?(\s*)(?:--\s*@val\s*=\s*(.+?)$|\/\*\s*@val\s*=\s*(.+?)\s*\*\/)/gm;

        return query.replace(regex, (match, whitespace, lineVal, blockVal) => {
            let val = lineVal || blockVal;
            if (val) {
                val = val.trim();
                // If it's a string, it might be quoted. If it's a number, it's plain.
                // We replaced '?' so we just return the value.
                // We preserve whitespace before the comment if needed, or just replace the whole thing.
                // The requirements say "replace ?".
                // Example: "WHERE typ=?" becomes "WHERE typ='SG0A'"
                // The comment is consumed by the regex.
                return `${whitespace}${val}`; 
            }
            return match;
        });
    }
}
