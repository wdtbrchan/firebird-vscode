
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

    // --- End Tests ---

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
