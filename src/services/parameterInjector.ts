
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
        // (\?|:[a-zA-Z0-9_$]+)  Match literal '?' or named parameter (starting with :)
        // (\s*)                 Capture whitespace after ? or :name
        // (?:                   Non-capturing group for comment variants
        //   --\s*@val(?:ue)?\s*=\s*(.+?)$      Line comment: -- @val=... or -- @value=... until end of line
        //   |                                  OR
        //   \/\*\s*@val(?:ue)?\s*=\s*(.+?)\s*\*\/  Block comment: /* @val=... */ or /* @value=... */
        // )
        // Flags: g (global), m (multiline)
        
        const regex = /(\?|:[a-zA-Z0-9_$]+)(\s*)(?:--\s*@val(?:ue)?\s*=\s*(.+?)$|\/\*\s*@val(?:ue)?\s*=\s*(.+?)\s*\*\/)/gm;

        return query.replace(regex, (match, placeholder, whitespace, lineVal, blockVal) => {
            let val = lineVal || blockVal;
            if (val) {
                val = val.trim();
                // If it's a string, it might be quoted. If it's a number, it's plain.
                // We replaced '?' or ':name' so we just return the value.
                // We preserve whitespace before the comment if needed, or just replace the whole thing.
                
                // Example: "WHERE typ=?"       becomes "WHERE typ='SG0A'"
                // Example: "WHERE typ=:myval"  becomes "WHERE typ='SG0A'"
                // The comment is consumed by the regex.
                return `${whitespace}${val}`; 
            }
            return match;
        });
    }
}
