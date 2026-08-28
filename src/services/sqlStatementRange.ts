export interface SqlStatementRange {
    start: number;
    end: number;
}

type ScannerState = 'normal' | 'lineComment' | 'blockComment' | 'singleQuoted' | 'doubleQuoted';

function consumeNewline(text: string, offset: number): number | null {
    if (text[offset] === '\n') return offset + 1;
    if (text[offset] === '\r') {
        return text[offset + 1] === '\n' ? offset + 2 : offset + 1;
    }
    return null;
}

function findEmptyLineSeparatorEnd(text: string, offset: number): number | null {
    const firstLineEnd = consumeNewline(text, offset);
    if (firstLineEnd === null) return null;

    let cursor = firstLineEnd;
    while (text[cursor] === ' ' || text[cursor] === '\t') cursor++;

    const secondLineEnd = consumeNewline(text, cursor);
    if (secondLineEnd === null) return null;

    cursor = secondLineEnd;
    while (cursor < text.length) {
        while (text[cursor] === ' ' || text[cursor] === '\t') cursor++;
        const nextLineEnd = consumeNewline(text, cursor);
        if (nextLineEnd === null) break;
        cursor = nextLineEnd;
    }

    return cursor;
}

/**
 * Finds the SQL statement containing the cursor. Only semicolons and optional
 * empty-line separators outside comments and quoted values delimit statements.
 */
export function findSqlStatementRange(
    text: string,
    offset: number,
    useEmptyLineAsSeparator: boolean
): SqlStatementRange {
    const cursorOffset = Math.max(0, Math.min(offset, text.length));
    let start = 0;
    let end = text.length;
    let state: ScannerState = 'normal';
    let i = 0;

    while (i < text.length) {
        const char = text[i];
        const nextChar = text[i + 1] || '';

        if (state === 'lineComment') {
            if (char === '\n' || char === '\r') {
                state = 'normal';
            } else {
                i++;
                continue;
            }
        }

        if (state === 'blockComment') {
            if (char === '*' && nextChar === '/') {
                state = 'normal';
                i += 2;
            } else {
                i++;
            }
            continue;
        }

        if (state === 'singleQuoted' || state === 'doubleQuoted') {
            const quote = state === 'singleQuoted' ? "'" : '"';
            if (char === quote) {
                if (nextChar === quote) {
                    i += 2;
                    continue;
                }
                state = 'normal';
            }
            i++;
            continue;
        }

        if (char === '-' && nextChar === '-') {
            state = 'lineComment';
            i += 2;
            continue;
        }
        if (char === '/' && nextChar === '*') {
            state = 'blockComment';
            i += 2;
            continue;
        }
        if (char === "'") {
            state = 'singleQuoted';
            i++;
            continue;
        }
        if (char === '"') {
            state = 'doubleQuoted';
            i++;
            continue;
        }

        if (char === ';') {
            if (i >= cursorOffset) {
                end = i;
                break;
            }
            start = i + 1;
            i++;
            continue;
        }

        if (useEmptyLineAsSeparator && (char === '\n' || char === '\r')) {
            const separatorEnd = findEmptyLineSeparatorEnd(text, i);
            if (separatorEnd !== null) {
                if (i >= cursorOffset) {
                    end = i;
                    break;
                }
                start = separatorEnd;
                i = separatorEnd;
                continue;
            }
        }

        i++;
    }

    return { start, end };
}
