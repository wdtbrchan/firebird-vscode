import * as vscode from 'vscode';

export class ObjectViewer {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static display(content: string, title: string) {
        if (this.currentPanel) {
            this.currentPanel.title = title;
            this.currentPanel.webview.html = this.getHtml(content, title);
            this.currentPanel.reveal(vscode.ViewColumn.One);
        } else {
            this.currentPanel = vscode.window.createWebviewPanel(
                'firebirdObjectViewer',
                title,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.currentPanel.webview.html = this.getHtml(content, title);

            this.currentPanel.onDidDispose(() => {
                this.currentPanel = undefined;
            }, null, []);
        }
    }

    private static getHtml(content: string, title: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 10px;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .sql-keyword { color: #569cd6; font-weight: bold; }
        .sql-string { color: #ce9178; }
        .sql-comment { color: #6a9955; }
        .sql-number { color: #b5cea8; }
        .sql-function { color: #dcdcaa; }
    </style>
</head>
<body>
    <pre id="code-content"></pre>
    <script>
        const content = ${JSON.stringify(content).replace(/</g, '\\u003c')};
        
        function escapeHtml(text) {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        function colorize(text) {
            const keywords = new Set([
                'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 
                'DELETE', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'TRIGGER', 'PROCEDURE', 'GENERATOR',
                'SEQUENCE', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'INDEX', 'ON',
                'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'AS', 'IS', 'NULL', 'NOT', 'DISTINCT',
                'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'ROWS', 'TO', 'UNION', 'ALL',
                'EXECUTE', 'BLOCK', 'RETURNS', 'DECLARE', 'VARIABLE', 'BEGIN', 'END', 'IF', 'THEN', 'ELSE',
                'WHILE', 'DO', 'FOR', 'IN', 'SUSPEND', 'EXIT', 'RECREATE', 'ACTIVE', 'INACTIVE', 'POSITION',
                'BEFORE', 'AFTER', 'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'WORK', 'TRANSACTION'
            ]);

            // Pattern to match: Strings, Comments, Words, Whitespace/Symbols
            let re = /('[^']*')|(--.*$)|([a-zA-Z_][a-zA-Z0-9_]*)|(\s+)|([^a-zA-Z0-9_\s'-]+)/gm;
            
            let result = '';
            let match;
            while ((match = re.exec(text)) !== null) {
                if (match[1]) { // String
                     result += '<span class="sql-string">' + escapeHtml(match[1]) + '</span>';
                } else if (match[2]) { // Comment
                     result += '<span class="sql-comment">' + escapeHtml(match[2]) + '</span>';
                } else if (match[3]) { // Word
                     const word = match[3];
                     if (keywords.has(word.toUpperCase())) {
                         result += '<span class="sql-keyword">' + escapeHtml(word) + '</span>';
                     } else {
                         result += escapeHtml(word);
                     }
                } else {
                     // Whitespace or symbols
                     result += escapeHtml(match[0]);
                }
            }
            return result;
        }
        
        document.getElementById('code-content').innerHTML = colorize(content);
        
    </script>
</body>
</html>`;
    }

    private static escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
