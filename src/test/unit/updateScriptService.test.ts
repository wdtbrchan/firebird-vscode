import * as assert from 'assert';
import { buildUpdateScript } from '../../resultsPanel/updateScriptService';

async function runTests() {
    console.log('Running UpdateScriptService tests...');

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

    test('builds one UPDATE per changed row', () => {
        const sql = buildUpdateScript({
            tableName: 'USERS',
            primaryKeyColumns: ['ID'],
            rows: [{
                rowIndex: 1,
                originalValues: {
                    ID: { kind: 'number', value: '1' },
                    NAME: { kind: 'string', value: 'Old' }
                },
                changedValues: {
                    NAME: { kind: 'string', value: "O'Reilly" }
                }
            }]
        });

        assert.ok(sql.includes('UPDATE "USERS"'));
        assert.ok(sql.includes('"NAME" = \'O\'\'Reilly\''));
        assert.ok(sql.includes('"ID" = 1'));
    });

    test('uses original primary key value when key is edited', () => {
        const sql = buildUpdateScript({
            tableName: 'USERS',
            primaryKeyColumns: ['ID'],
            rows: [{
                rowIndex: 2,
                originalValues: {
                    ID: { kind: 'number', value: '10' }
                },
                changedValues: {
                    ID: { kind: 'number', value: '11' }
                }
            }]
        });

        assert.ok(sql.includes('"ID" = 11'));
        assert.ok(sql.includes('WHERE\n    "ID" = 10'));
    });

    test('rejects missing primary key values', () => {
        assert.throws(() => buildUpdateScript({
            tableName: 'USERS',
            primaryKeyColumns: ['ID'],
            rows: [{
                rowIndex: 3,
                originalValues: {},
                changedValues: {
                    NAME: { kind: 'string', value: 'New' }
                }
            }]
        }), /missing/);
    });

    test('rejects invalid numeric values', () => {
        assert.throws(() => buildUpdateScript({
            tableName: 'USERS',
            primaryKeyColumns: ['ID'],
            rows: [{
                rowIndex: 4,
                originalValues: {
                    ID: { kind: 'number', value: '4' }
                },
                changedValues: {
                    SCORE: { kind: 'number', value: 'abc' }
                }
            }]
        }), /Invalid numeric value/);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
