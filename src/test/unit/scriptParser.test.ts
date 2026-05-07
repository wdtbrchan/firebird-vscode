
import * as assert from 'assert';
import { ScriptParser } from '../../services/scriptParser';

async function runTests() {
    console.log('Running ScriptParser tests...');
    
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

    test('Split by semicolon', () => {
        const text = `SELECT 1 FROM RDB$DATABASE; SELECT 2 FROM RDB$DATABASE;`;
        const result = ScriptParser.split(text);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0], 'SELECT 1 FROM RDB$DATABASE');
        assert.strictEqual(result[1], 'SELECT 2 FROM RDB$DATABASE');
    });

    test('Split by empty line', () => {
        const text = `SELECT 1 FROM RDB$DATABASE

SELECT 2 FROM RDB$DATABASE`;
        const result = ScriptParser.split(text, true);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0], 'SELECT 1 FROM RDB$DATABASE');
        assert.strictEqual(result[1], 'SELECT 2 FROM RDB$DATABASE');
    });

    test('Split by empty line with whitespace', () => {
        const text = `SELECT 1 FROM RDB$DATABASE
  
SELECT 2 FROM RDB$DATABASE`;
        const result = ScriptParser.split(text, true);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0], 'SELECT 1 FROM RDB$DATABASE');
        assert.strictEqual(result[1], 'SELECT 2 FROM RDB$DATABASE');
    });

    test('Empty line separator disabled', () => {
        const text = `SELECT 1 FROM RDB$DATABASE

SELECT 2 FROM RDB$DATABASE`;
        const result = ScriptParser.split(text, false);
        assert.strictEqual(result.length, 1);
        assert.ok(result[0].includes('SELECT 2'));
    });

    test('Respect SET TERM', () => {
        const text = `SET TERM ^ ;
CREATE PROCEDURE P AS BEGIN END^
SET TERM ; ^
SELECT 1 FROM RDB$DATABASE;`;
        const result = ScriptParser.split(text);
        assert.strictEqual(result.length, 2);
        assert.ok(result[0].includes('CREATE PROCEDURE P'));
        assert.strictEqual(result[1], 'SELECT 1 FROM RDB$DATABASE');
    });

    test('Strip SET TERM from single block (Run Query integration)', () => {
        const text = `-- testovaci blok
SET TERM ^ ;
EXECUTE BLOCK
AS
DECLARE VARIABLE datum_servisu DATE;
BEGIN

    datum_servisu = NULL;

END
^
SET TERM ; ^`;
        const result = ScriptParser.split(text, false);
        assert.strictEqual(result.length, 1);
        assert.ok(result[0].includes('EXECUTE BLOCK'));
        assert.ok(!result[0].includes('SET TERM'));
    });

    test('Empty line inside custom terminator block should not split script', () => {
        const text = `SET TERM ^ ;
CREATE OR ALTER PROCEDURE SKUPINY_USERS () AS
BEGIN

END ^
SET TERM ; ^`;
        const result = ScriptParser.split(text, true);
        assert.strictEqual(result.length, 1);
        assert.ok(result[0].includes('CREATE OR ALTER PROCEDURE'));
        assert.ok(result[0].includes('END'));
    });

    test('SQL escaped apostrophe inside string is not a string terminator', () => {
        const text = `INSERT INTO t VALUES ('it''s');INSERT INTO t VALUES ('next');`;
        const result = ScriptParser.split(text);
        assert.strictEqual(result.length, 2, `Expected 2 statements, got ${result.length}: ${JSON.stringify(result)}`);
        assert.strictEqual(result[0], `INSERT INTO t VALUES ('it''s')`);
        assert.strictEqual(result[1], `INSERT INTO t VALUES ('next')`);
    });

    test('Semicolon inside SQL-escaped apostrophe string does not split', () => {
        const text = `INSERT INTO t VALUES ('foo;bar''baz;qux');SELECT 1 FROM RDB$DATABASE;`;
        const result = ScriptParser.split(text);
        assert.strictEqual(result.length, 2, `Expected 2 statements, got ${result.length}: ${JSON.stringify(result)}`);
        assert.strictEqual(result[0], `INSERT INTO t VALUES ('foo;bar''baz;qux')`);
        assert.strictEqual(result[1], `SELECT 1 FROM RDB$DATABASE`);
    });

    test('Multiple consecutive escaped apostrophes', () => {
        const text = `SELECT '''' FROM RDB$DATABASE;SELECT 2 FROM RDB$DATABASE;`;
        const result = ScriptParser.split(text);
        assert.strictEqual(result.length, 2, `Expected 2 statements, got ${result.length}: ${JSON.stringify(result)}`);
        assert.strictEqual(result[0], `SELECT '''' FROM RDB$DATABASE`);
        assert.strictEqual(result[1], `SELECT 2 FROM RDB$DATABASE`);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
