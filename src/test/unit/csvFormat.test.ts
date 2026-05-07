import * as assert from 'assert';
import { escapeCsvValue, formatCsvRows, CsvFormat } from '../../resultsPanel/csvFormat';

async function runTests() {
    console.log('Running CsvFormat tests...');

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

    const fmt: CsvFormat = { delimiter: ';', qualifier: '"', decimalSeparator: '.' };
    const fmtComma: CsvFormat = { delimiter: ';', qualifier: '"', decimalSeparator: ',' };

    // --- escapeCsvValue ---

    test('null/undefined become empty string (no qualifier)', () => {
        assert.strictEqual(escapeCsvValue(null, fmt), '');
        assert.strictEqual(escapeCsvValue(undefined, fmt), '');
    });

    test('Uint8Array becomes [Blob] placeholder', () => {
        assert.strictEqual(escapeCsvValue(new Uint8Array([1, 2, 3]), fmt), '"[Blob]"');
    });

    test('plain string is wrapped in qualifier', () => {
        assert.strictEqual(escapeCsvValue('hello', fmt), '"hello"');
    });

    test('embedded qualifier is doubled', () => {
        assert.strictEqual(escapeCsvValue('he said "hi"', fmt), '"he said ""hi"""');
    });

    test('number with comma decimal separator', () => {
        assert.strictEqual(escapeCsvValue(3.14, fmtComma), '"3,14"');
    });

    test('number with dot decimal separator', () => {
        assert.strictEqual(escapeCsvValue(3.14, fmt), '"3.14"');
    });

    test('integer is rendered without forced decimal', () => {
        assert.strictEqual(escapeCsvValue(42, fmt), '"42"');
    });

    test('Date with no time renders as YYYY-MM-DD', () => {
        const d = new Date(2026, 0, 5);
        assert.strictEqual(escapeCsvValue(d, fmt), '"2026-01-05"');
    });

    test('Date with time renders as YYYY-MM-DD HH:MM:SS', () => {
        const d = new Date(2026, 4, 7, 14, 3, 9);
        assert.strictEqual(escapeCsvValue(d, fmt), '"2026-05-07 14:03:09"');
    });

    test('object falls back to JSON.stringify', () => {
        assert.strictEqual(escapeCsvValue({ a: 1 }, fmt), '"{""a"":1}"');
    });

    test('boolean renders as true/false', () => {
        assert.strictEqual(escapeCsvValue(true, fmt), '"true"');
        assert.strictEqual(escapeCsvValue(false, fmt), '"false"');
    });

    test('alternative qualifier (single quote) is supported and doubled', () => {
        const f: CsvFormat = { delimiter: ';', qualifier: "'", decimalSeparator: '.' };
        assert.strictEqual(escapeCsvValue("it's me", f), `'it''s me'`);
    });

    // --- formatCsvRows ---

    test('formatCsvRows: header + body, default delimiter', () => {
        const out = formatCsvRows(['a', 'b'], [{ a: 1, b: 'x' }, { a: 2, b: 'y' }], fmt);
        assert.strictEqual(out, '"a";"b"\n"1";"x"\n"2";"y"');
    });

    test('formatCsvRows: respects column order, ignores extras', () => {
        const out = formatCsvRows(['b', 'a'], [{ a: 1, b: 2, c: 3 }], fmt);
        assert.strictEqual(out, '"b";"a"\n"2";"1"');
    });

    test('formatCsvRows: missing column renders empty', () => {
        const out = formatCsvRows(['a', 'missing'], [{ a: 1 }], fmt);
        assert.strictEqual(out, '"a";"missing"\n"1";');
    });

    test('formatCsvRows: empty body returns just header', () => {
        const out = formatCsvRows(['a'], [], fmt);
        assert.strictEqual(out, '"a"');
    });

    test('formatCsvRows: alternative delimiter (comma)', () => {
        const f: CsvFormat = { delimiter: ',', qualifier: '"', decimalSeparator: '.' };
        const out = formatCsvRows(['a', 'b'], [{ a: 1, b: 2 }], f);
        assert.strictEqual(out, '"a","b"\n"1","2"');
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
