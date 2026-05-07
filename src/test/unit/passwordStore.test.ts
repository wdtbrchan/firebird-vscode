import * as assert from 'assert';
import {
    passwordKey,
    getConnectionPassword,
    setConnectionPassword,
    deleteConnectionPassword,
    migratePasswordsToSecrets,
    hydratePasswordsFromSecrets,
    stripPasswords,
    SecretStorageLike
} from '../../explorer/passwordStore';
import { DatabaseConnection } from '../../database/types';

class MemorySecrets implements SecretStorageLike {
    private map = new Map<string, string>();
    async get(key: string): Promise<string | undefined> { return this.map.get(key); }
    async store(key: string, value: string): Promise<void> { this.map.set(key, value); }
    async delete(key: string): Promise<void> { this.map.delete(key); }
    public dump(): Record<string, string> { return Object.fromEntries(this.map); }
}

function conn(id: string, password?: string): DatabaseConnection {
    return {
        id,
        host: 'h',
        port: 3050,
        database: '/db.fdb',
        user: 'SYSDBA',
        password
    };
}

async function runTests() {
    console.log('Running PasswordStore tests...');

    let passed = 0;
    let failed = 0;

    async function test(name: string, fn: () => void | Promise<void>) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (err: any) {
            console.error(`❌ ${name}`);
            console.error(err.message);
            failed++;
        }
    }

    // --- passwordKey ---

    await test('passwordKey: prefixes connection id', () => {
        assert.strictEqual(passwordKey('abc'), 'firebird.password:abc');
    });

    // --- get/set/delete ---

    await test('setConnectionPassword + getConnectionPassword roundtrip', async () => {
        const s = new MemorySecrets();
        await setConnectionPassword(s, 'c1', 'pw1');
        const got = await getConnectionPassword(s, 'c1');
        assert.strictEqual(got, 'pw1');
    });

    await test('getConnectionPassword: undefined when not set', async () => {
        const s = new MemorySecrets();
        assert.strictEqual(await getConnectionPassword(s, 'missing'), undefined);
    });

    await test('deleteConnectionPassword removes the secret', async () => {
        const s = new MemorySecrets();
        await setConnectionPassword(s, 'c1', 'pw1');
        await deleteConnectionPassword(s, 'c1');
        assert.strictEqual(await getConnectionPassword(s, 'c1'), undefined);
    });

    // --- migratePasswordsToSecrets ---

    await test('migratePasswordsToSecrets: moves plain passwords to secrets and clears them', async () => {
        const s = new MemorySecrets();
        const cs = [conn('a', 'pwA'), conn('b', 'pwB')];
        const migrated = await migratePasswordsToSecrets(s, cs);
        assert.strictEqual(migrated, 2);
        assert.strictEqual(cs[0].password, undefined);
        assert.strictEqual(cs[1].password, undefined);
        assert.strictEqual(await getConnectionPassword(s, 'a'), 'pwA');
        assert.strictEqual(await getConnectionPassword(s, 'b'), 'pwB');
    });

    await test('migratePasswordsToSecrets: skips connections without password', async () => {
        const s = new MemorySecrets();
        const cs = [conn('a'), conn('b', 'pwB')];
        const migrated = await migratePasswordsToSecrets(s, cs);
        assert.strictEqual(migrated, 1);
        assert.strictEqual(await getConnectionPassword(s, 'a'), undefined);
        assert.strictEqual(await getConnectionPassword(s, 'b'), 'pwB');
    });

    await test('migratePasswordsToSecrets: is idempotent (running twice is a no-op)', async () => {
        const s = new MemorySecrets();
        const cs = [conn('a', 'pwA')];
        await migratePasswordsToSecrets(s, cs);
        const second = await migratePasswordsToSecrets(s, cs);
        assert.strictEqual(second, 0);
        assert.strictEqual(await getConnectionPassword(s, 'a'), 'pwA');
    });

    await test('migratePasswordsToSecrets: empty password is treated as no password', async () => {
        const s = new MemorySecrets();
        const cs = [conn('a', '')];
        const migrated = await migratePasswordsToSecrets(s, cs);
        assert.strictEqual(migrated, 0);
        assert.strictEqual(await getConnectionPassword(s, 'a'), undefined);
    });

    // --- hydratePasswordsFromSecrets ---

    await test('hydratePasswordsFromSecrets: copies stored passwords back into in-memory connections', async () => {
        const s = new MemorySecrets();
        await setConnectionPassword(s, 'a', 'pwA');
        await setConnectionPassword(s, 'b', 'pwB');
        const cs = [conn('a'), conn('b'), conn('c')];
        await hydratePasswordsFromSecrets(s, cs);
        assert.strictEqual(cs[0].password, 'pwA');
        assert.strictEqual(cs[1].password, 'pwB');
        assert.strictEqual(cs[2].password, undefined);
    });

    await test('hydratePasswordsFromSecrets: does not overwrite an existing password', async () => {
        const s = new MemorySecrets();
        await setConnectionPassword(s, 'a', 'fromSecrets');
        const cs = [conn('a', 'inMemory')];
        await hydratePasswordsFromSecrets(s, cs);
        assert.strictEqual(cs[0].password, 'inMemory', 'existing in-memory value should win');
    });

    // --- stripPasswords ---

    await test('stripPasswords: returns a copy with passwords removed; original untouched', () => {
        const cs = [conn('a', 'pwA'), conn('b')];
        const stripped = stripPasswords(cs);
        assert.strictEqual(stripped.length, 2);
        assert.strictEqual(stripped[0].password, undefined);
        assert.strictEqual(stripped[1].password, undefined);
        assert.strictEqual(stripped[0].id, 'a');
        // Original untouched
        assert.strictEqual(cs[0].password, 'pwA');
    });

    await test('stripPasswords: preserves all non-password fields', () => {
        const c: DatabaseConnection = {
            id: 'a',
            host: 'h',
            port: 3050,
            database: '/d',
            user: 'u',
            password: 'p',
            role: 'r',
            charset: 'UTF8',
            name: 'My',
            color: 'red',
            groupId: 'g'
        };
        const [out] = stripPasswords([c]);
        assert.strictEqual(out.host, 'h');
        assert.strictEqual(out.port, 3050);
        assert.strictEqual(out.database, '/d');
        assert.strictEqual(out.user, 'u');
        assert.strictEqual(out.role, 'r');
        assert.strictEqual(out.charset, 'UTF8');
        assert.strictEqual(out.name, 'My');
        assert.strictEqual(out.color, 'red');
        assert.strictEqual(out.groupId, 'g');
        assert.strictEqual(out.password, undefined);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
