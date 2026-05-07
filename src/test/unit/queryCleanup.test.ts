import * as assert from 'assert';
import { cleanQueryForExecution } from '../../commands/queryCleanup';

async function runTests() {
    console.log('Running queryCleanup tests...');

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

    test('SQL: trims and strips trailing semicolon', () => {
        assert.strictEqual(
            cleanQueryForExecution('  SELECT 1 FROM RDB$DATABASE;  ', 'sql'),
            'SELECT 1 FROM RDB$DATABASE'
        );
    });

    test('SQL: passes simple query through', () => {
        assert.strictEqual(
            cleanQueryForExecution('SELECT * FROM T', 'sql'),
            'SELECT * FROM T'
        );
    });

    test('SQL: strips SET TERM wrapper, returns first statement', () => {
        const input = `SET TERM ^ ;
EXECUTE BLOCK
AS
DECLARE VARIABLE x INT;
BEGIN
    x = 1;
END
^
SET TERM ; ^`;
        const out = cleanQueryForExecution(input, 'sql');
        assert.ok(out.startsWith('EXECUTE BLOCK'), `got: ${out}`);
        assert.ok(out.includes('END'));
        assert.ok(!out.includes('SET TERM'));
    });

    test('PHP: strips $var = assignment', () => {
        assert.strictEqual(
            cleanQueryForExecution(`$sql = 'SELECT 1'`, 'php'),
            'SELECT 1'
        );
    });

    test('PHP: strips outer single quotes', () => {
        assert.strictEqual(
            cleanQueryForExecution(`'SELECT 1'`, 'php'),
            'SELECT 1'
        );
    });

    test('PHP: strips outer double quotes', () => {
        assert.strictEqual(
            cleanQueryForExecution(`"SELECT 1"`, 'php'),
            'SELECT 1'
        );
    });

    test('PHP: $var = followed by quoted query', () => {
        assert.strictEqual(
            cleanQueryForExecution(`$query = "SELECT id FROM users"`, 'php'),
            'SELECT id FROM users'
        );
    });

    test('PHP: trailing semicolon stripped before quote handling', () => {
        // Trailing semicolon stripped first, then quotes stripped
        assert.strictEqual(
            cleanQueryForExecution(`$x = 'SELECT 1';`, 'php'),
            'SELECT 1'
        );
    });

    test('SQL: does not strip outer quotes (sql language)', () => {
        // In SQL context, leading/trailing quotes are part of the query (e.g. literal)
        assert.strictEqual(
            cleanQueryForExecution(`'literal'`, 'sql'),
            `'literal'`
        );
    });

    test('Empty string passes through as empty', () => {
        assert.strictEqual(cleanQueryForExecution('', 'sql'), '');
        assert.strictEqual(cleanQueryForExecution('   ', 'sql'), '');
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
