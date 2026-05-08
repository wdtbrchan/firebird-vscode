import * as assert from 'assert';
import { parseSlotArg } from '../../commands/slotArg';

async function runTests() {
    console.log('Running slotArg tests...');

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

    // --- accepts number form ---

    test('accepts plain number 1', () => assert.strictEqual(parseSlotArg(1), 1));
    test('accepts plain number 9', () => assert.strictEqual(parseSlotArg(9), 9));

    // --- accepts string form (keybinding "args" might pass strings) ---

    test('accepts string "5"', () => assert.strictEqual(parseSlotArg('5'), 5));

    // --- accepts {slot: N} form ---

    test('accepts { slot: 3 }', () => assert.strictEqual(parseSlotArg({ slot: 3 }), 3));
    test('accepts { slot: "7" }', () => assert.strictEqual(parseSlotArg({ slot: '7' }), 7));

    // --- rejects out of range ---

    test('rejects 0', () => assert.strictEqual(parseSlotArg(0), null));
    test('rejects 10', () => assert.strictEqual(parseSlotArg(10), null));
    test('rejects -1', () => assert.strictEqual(parseSlotArg(-1), null));
    test('rejects 1.5', () => assert.strictEqual(parseSlotArg(1.5), null));
    test('rejects { slot: 0 }', () => assert.strictEqual(parseSlotArg({ slot: 0 }), null));
    test('rejects { slot: 10 }', () => assert.strictEqual(parseSlotArg({ slot: 10 }), null));

    // --- rejects garbage ---

    test('rejects undefined', () => assert.strictEqual(parseSlotArg(undefined), null));
    test('rejects null', () => assert.strictEqual(parseSlotArg(null), null));
    test('rejects empty object', () => assert.strictEqual(parseSlotArg({}), null));
    test('rejects non-numeric string', () => assert.strictEqual(parseSlotArg('abc'), null));
    test('rejects boolean', () => assert.strictEqual(parseSlotArg(true), null));
    test('rejects array', () => assert.strictEqual(parseSlotArg([5]), null));

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
