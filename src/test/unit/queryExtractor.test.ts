
import * as assert from 'assert';
import { QueryExtractor } from '../../services/queryExtractor';

// Simple test runner
async function runTests() {
    console.log('Running QueryExtractor tests...');
    
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

    // --- Tests ---

    test('PHP: Extract SQL from double quotes', () => {
        const text = `$sql = "SELECT * FROM table WHERE id=1";`;
        // Cursor at 'SELECT' (offset 8)
        const offset = 10; 
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, 'SELECT * FROM table WHERE id=1');
    });

    test('PHP: Extract SQL from single quotes', () => {
        const text = `$sql = 'SELECT * FROM table WHERE id=1';`;
        const offset = 10;
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, 'SELECT * FROM table WHERE id=1');
    });

    test('PHP: Extract SQL with embedded single quotes in double quotes', () => {
        const text = `$sql = "SELECT * FROM table WHERE name='test'";`;
        // Cursor at 'test'
        const offset = 40;
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, "SELECT * FROM table WHERE name='test'");
    });

    test('PHP: Extract SQL with embedded double quotes in single quotes', () => {
        const text = `$sql = 'SELECT * FROM table WHERE name="test"';`;
        const offset = 40;
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, 'SELECT * FROM table WHERE name="test"');
    });

    test('PHP: Handle escaped quotes (single)', () => {
        const text = `$sql = 'SELECT * FROM table WHERE name=\\'test\\'';`;
        const offset = 20; 
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, "SELECT * FROM table WHERE name='test'");
    });

    test('PHP: Handle escaped quotes (double)', () => {
        const text = `$sql = "SELECT * FROM table WHERE name=\\"test\\"";`;
        const offset = 20;
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, 'SELECT * FROM table WHERE name="test"');
    });

    test('PHP: Method chaining', () => {
        const text = `$db->query("SELECT * FROM table")->fetchAll();`;
        const offset = 15; // inside SELECT
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, 'SELECT * FROM table');
    });

    test('PHP: Multiline string', () => {
        const text = `$sql = "
            SELECT 
                * 
            FROM table
        ";`;
        const offset = 30; // middle of string
        const result = QueryExtractor.extract(text, offset, 'php');
        // result should preserve newlines? Yes, as per current implementation
        assert.ok(result?.text.includes('SELECT'));
        assert.ok(result?.text.includes('FROM table'));
    });
    
    test('PHP: Nested strings - Cursor in inner string (should return outer)', () => {
        // This is the tricky case: $sql = "SELECT ... WHERE x='val'"
        // Cursor at 'val'. We want the WHOLE SQL.
        const text = `$sql = "SELECT * FROM table WHERE x='val'";`;
        const offset = text.indexOf('val');
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, "SELECT * FROM table WHERE x='val'");
    });

    test('PHP: Nested strings - Cursor in inner string with escaped quotes', () => {
        const text = `$sql = 'SELECT * FROM table WHERE x=\\'val\\'';`;
        const offset = text.indexOf('val');
        const result = QueryExtractor.extract(text, offset, 'php');
        assert.strictEqual(result?.text, "SELECT * FROM table WHERE x='val'");
    });

    test('SQL: Extract query with semicolon', () => {
        const text = `SELECT 1 FROM RDB$DATABASE; SELECT 2 FROM RDB$DATABASE;`;
        const offset = 5; // inside first query
        const result = QueryExtractor.extract(text, offset, 'sql');
        assert.strictEqual(result?.text, 'SELECT 1 FROM RDB$DATABASE');
    });

    test('SQL: Extract query with empty line separator', () => {
        const text = `SELECT 1 FROM RDB$DATABASE

SELECT 2 FROM RDB$DATABASE`;
        const offset = 5; // inside first query
        const result = QueryExtractor.extract(text, offset, 'sql', true);
        assert.strictEqual(result?.text, 'SELECT 1 FROM RDB$DATABASE');

        const offset2 = text.indexOf('SELECT 2') + 2;
        const result2 = QueryExtractor.extract(text, offset2, 'sql', true);
        assert.strictEqual(result2?.text, 'SELECT 2 FROM RDB$DATABASE');
    });

    test('SQL: Empty line separator disabled', () => {
        const text = `SELECT 1 FROM RDB$DATABASE

SELECT 2 FROM RDB$DATABASE`;
        const offset = 5; 
        const result = QueryExtractor.extract(text, offset, 'sql', false);
        // Should return whole text as there are no semicolons
        assert.ok(result?.text.includes('SELECT 2'));
    });


    test('SQL: Extract SET TERM block', () => {
        const text = `
SELECT 1 FROM RDB$DATABASE;
SET TERM ^ ;
CREATE PROCEDURE P AS BEGIN END^
SET TERM ; ^
SELECT 2 FROM RDB$DATABASE;`;
        const offset = text.indexOf('CREATE PROCEDURE');
        const result = QueryExtractor.extract(text, offset, 'sql');
        assert.ok(result?.text.startsWith('SET TERM ^ ;'), 'Should start with SET TERM ^ ;');
        assert.ok(result?.text.endsWith('SET TERM ; ^'), 'Should end with SET TERM ; ^');
    });

    test('SQL: Extract SET TERM block when cursor is after', () => {
        const text = `
SET TERM ^ ;
CREATE PROCEDURE P AS BEGIN END^
SET TERM ; ^
   
`;
        const offset = text.length - 1; // Cursor at the end (whitespace)
        const result = QueryExtractor.extract(text, offset, 'sql');
        assert.ok(result?.text.startsWith('SET TERM ^ ;'), 'Should return the preceding SET TERM block');
    });

    // --- hasSqlKeywords Tests ---

    test('Keywords: Detect SELECT', () => {
        assert.strictEqual(QueryExtractor.hasSqlKeywords('SELECT * FROM table'), true);
    });

    test('Keywords: Detect lowercase select', () => {
        assert.strictEqual(QueryExtractor.hasSqlKeywords('select * from table'), true);
    });

    test('Keywords: Detect INSERT', () => {
        assert.strictEqual(QueryExtractor.hasSqlKeywords('INSERT INTO table VALUES (1)'), true);
    });

    test('Keywords: Detect UPDATE', () => {
        assert.strictEqual(QueryExtractor.hasSqlKeywords('UPDATE table SET id=1'), true);
    });

    test('Keywords: Detect EXECUTE', () => {
        assert.strictEqual(QueryExtractor.hasSqlKeywords('EXECUTE PROCEDURE proc'), true);
    });

    test('Keywords: No keywords in plain text', () => {
        assert.strictEqual(QueryExtractor.hasSqlKeywords('Hello World this is a test'), false);
    });

    test('Keywords: No keywords in text with similar words (selection)', () => {
        // "selection" contains "select" but should not match due to word boundaries
        assert.strictEqual(QueryExtractor.hasSqlKeywords('The selection was made'), false);
    });

    test('Keywords: No keywords in code like text', () => {
        assert.strictEqual(QueryExtractor.hasSqlKeywords('const x = "some string";'), false);
    });

    test('Keywords: Detect keyword inside code string', () => {
        assert.strictEqual(QueryExtractor.hasSqlKeywords('const query = "SELECT * FROM table";'), true);
    });


    // --- End Tests ---

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
