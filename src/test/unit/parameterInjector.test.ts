import * as assert from 'assert';
import { ParameterInjector } from '../../services/parameterInjector';
import { ScriptParser } from '../../services/scriptParser';

async function runTests() {
    console.log('Running ParameterInjector tests...');

    let passed = 0;
    let failed = 0;

    function test(name: string, fn: () => void) {
        try {
            fn();
            console.log(`passed: ${name}`);
            passed++;
        } catch (err: any) {
            console.error(`failed: ${name}`);
            console.error(err.message);
            failed++;
        }
    }

    test('injects line-comment value placeholders', () => {
        assert.strictEqual(
            ParameterInjector.inject("SELECT * FROM T WHERE TYP=? --@val='FIO'"),
            "SELECT * FROM T WHERE TYP='FIO'"
        );
    });

    test('injects values after script splitting', () => {
        const statements = ScriptParser.split(ParameterInjector.inject(`
SELECT * FROM T WHERE ID=? --@val=1;
SELECT * FROM T WHERE TYP=? --@val='FIO';
        `));

        assert.deepStrictEqual(statements, [
            'SELECT * FROM T WHERE ID=1',
            "SELECT * FROM T WHERE TYP='FIO'"
        ]);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
