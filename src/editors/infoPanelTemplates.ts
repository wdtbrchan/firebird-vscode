/**
 * Shared loading / error HTML for the various info webview panels
 * (TableInfo, SourceCode, IndexInfo, GeneratorInfo).
 *
 * Pure functions — kept free of vscode dependencies so they're easy to
 * unit test and reuse from BaseInfoPanel.
 */

const SHARED_STYLE = `
    body {
        font-family: var(--vscode-font-family);
        padding: 20px;
        color: var(--vscode-editor-foreground);
        background-color: var(--vscode-editor-background);
    }
    .error { color: var(--vscode-errorForeground); }
    .spinner-wrap {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        height: 100vh;
        margin: 0;
    }
    .spinner {
        border: 4px solid var(--vscode-editor-background);
        border-top: 4px solid var(--vscode-progressBar-background);
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: info-spin 1s linear infinite;
        margin-bottom: 20px;
    }
    @keyframes info-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;

export function renderInfoLoadingHtml(title: string, dataType?: string): string {
    const label = dataType ? `${dataType} ${title}` : title;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>${SHARED_STYLE}</style>
</head>
<body>
    <div class="spinner-wrap">
        <div class="spinner"></div>
        <h2>Loading ${label}...</h2>
    </div>
</body>
</html>`;
}

export function renderInfoErrorHtml(title: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>${SHARED_STYLE}</style>
</head>
<body>
    <h2>Error loading info for ${title}</h2>
    <p class="error">${message}</p>
</body>
</html>`;
}
