import * as assert from 'assert';
import { toFirebirdOptions } from '../../database/connectionOptions';
import { DatabaseConnection } from '../../database/types';

async function runTests() {
    console.log('Running ConnectionOptions tests...');

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

    const baseConn: DatabaseConnection = {
        id: 'c1',
        host: 'srv',
        port: 3050,
        database: '/data/test.fdb',
        user: 'SYSDBA',
        password: 'masterkey'
    };

    test('Maps mandatory fields verbatim', () => {
        const opts = toFirebirdOptions(baseConn);
        assert.strictEqual(opts.host, 'srv');
        assert.strictEqual(opts.port, 3050);
        assert.strictEqual(opts.database, '/data/test.fdb');
        assert.strictEqual(opts.user, 'SYSDBA');
        assert.strictEqual(opts.password, 'masterkey');
    });

    test('Uses UTF8 client encoding and preserves column names', () => {
        const opts = toFirebirdOptions(baseConn) as any;
        assert.strictEqual(opts.encoding, 'UTF8');
        assert.strictEqual(opts.lowercase_keys, false);
    });

    test('Uses UTF8 on the wire for a WIN1250 database', () => {
        const opts = toFirebirdOptions({ ...baseConn, charset: 'WIN1250' });
        assert.strictEqual(opts.encoding, 'UTF8');
    });

    test('Preserves an explicit NONE client charset', () => {
        const opts = toFirebirdOptions({ ...baseConn, charset: 'NONE' });
        assert.strictEqual(opts.encoding, 'NONE');
    });

    test('Passes optional role when provided', () => {
        const opts = toFirebirdOptions({ ...baseConn, role: 'RDB$ADMIN' });
        assert.strictEqual(opts.role, 'RDB$ADMIN');
    });

    test('Role undefined when not provided', () => {
        const opts = toFirebirdOptions(baseConn);
        assert.strictEqual(opts.role, undefined);
    });

    test('Does not propagate non-Firebird fields (name, color, groupId)', () => {
        const opts = toFirebirdOptions({
            ...baseConn,
            name: 'My DB',
            color: 'red',
            groupId: 'g1',
            charset: 'WIN1250',
            resultLocale: 'cs-CZ'
        }) as any;
        assert.strictEqual(opts.name, undefined);
        assert.strictEqual(opts.color, undefined);
        assert.strictEqual(opts.groupId, undefined);
        assert.strictEqual(opts.charset, undefined);
        assert.strictEqual(opts.resultLocale, undefined);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
