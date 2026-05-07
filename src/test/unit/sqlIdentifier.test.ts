import * as assert from 'assert';
import { escapeSqlString, isSafeIdentifier, quoteIdentifier } from '../../database/sqlIdentifier';

async function runTests() {
    console.log('Running SqlIdentifier tests...');

    let passed = 0;
    let failed = 0;

    function test(name: string, fn: () => void) {
        try {
            fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (err: any) {
            console.error(`❌ ${name}`);
            console.error(err.message);
            failed++;
        }
    }

    // --- escapeSqlString ---

    test('escapeSqlString: plain ASCII passes through', () => {
        assert.strictEqual(escapeSqlString('USERS'), 'USERS');
    });

    test('escapeSqlString: single apostrophe is doubled', () => {
        assert.strictEqual(escapeSqlString("O'Reilly"), "O''Reilly");
    });

    test('escapeSqlString: multiple apostrophes are all doubled', () => {
        assert.strictEqual(escapeSqlString("a'b'c"), "a''b''c");
    });

    test('escapeSqlString: already-escaped apostrophe is doubled again (idempotency does NOT apply)', () => {
        // SQL escape is *not* idempotent — escaping twice produces 4 quotes.
        // Callers must escape exactly once before constructing a literal.
        assert.strictEqual(escapeSqlString("a''b"), "a''''b");
    });

    test('escapeSqlString: empty string returns empty', () => {
        assert.strictEqual(escapeSqlString(''), '');
    });

    test('escapeSqlString: does not touch backslashes (Firebird is not C-escape)', () => {
        assert.strictEqual(escapeSqlString('a\\b'), 'a\\b');
    });

    test('escapeSqlString: preserves spaces, dots, dollar signs', () => {
        assert.strictEqual(escapeSqlString('RDB$DATABASE.foo bar'), 'RDB$DATABASE.foo bar');
    });

    // --- isSafeIdentifier ---

    test('isSafeIdentifier: accepts canonical RDB names', () => {
        assert.strictEqual(isSafeIdentifier('RDB$RELATIONS'), true);
        assert.strictEqual(isSafeIdentifier('USERS'), true);
        assert.strictEqual(isSafeIdentifier('IDX_USERS_NAME'), true);
        assert.strictEqual(isSafeIdentifier('GEN_USERS_ID'), true);
    });

    test('isSafeIdentifier: rejects names with apostrophe', () => {
        assert.strictEqual(isSafeIdentifier("O'Reilly"), false);
    });

    test('isSafeIdentifier: rejects names with semicolon, parens, spaces', () => {
        assert.strictEqual(isSafeIdentifier('A;B'), false);
        assert.strictEqual(isSafeIdentifier('A(B)'), false);
        assert.strictEqual(isSafeIdentifier('A B'), false);
    });

    test('isSafeIdentifier: rejects empty', () => {
        assert.strictEqual(isSafeIdentifier(''), false);
    });

    test('isSafeIdentifier: rejects non-string', () => {
        assert.strictEqual(isSafeIdentifier(undefined as any), false);
        assert.strictEqual(isSafeIdentifier(null as any), false);
        assert.strictEqual(isSafeIdentifier(123 as any), false);
    });

    test('isSafeIdentifier: accepts digits in middle/end (not as first char – but Firebird is liberal)', () => {
        // Firebird allows leading digits in delimited identifiers; for unquoted SQL
        // we still treat names like "T1" / "_X" as safe enough — they came from RDB$.
        assert.strictEqual(isSafeIdentifier('T1'), true);
        assert.strictEqual(isSafeIdentifier('_X'), true);
    });

    // --- quoteIdentifier ---

    test('quoteIdentifier: wraps in double quotes and doubles inner quotes', () => {
        assert.strictEqual(quoteIdentifier('USERS'), '"USERS"');
        assert.strictEqual(quoteIdentifier('My Table'), '"My Table"');
        assert.strictEqual(quoteIdentifier('weird "name"'), '"weird ""name"""');
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
