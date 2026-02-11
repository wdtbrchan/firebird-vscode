
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

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
