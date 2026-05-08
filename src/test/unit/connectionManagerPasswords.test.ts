import * as assert from 'assert';
import * as mock from './vscodeMock';

import * as Module from 'module';
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (path: string, ...args: any[]) {
    if (path === 'vscode') return mock;
    return originalRequire.apply(this, [path, ...args]);
};

import { ConnectionManager } from '../../explorer/connectionManager';
import { DatabaseConnection } from '../../database/types';

class MemorySecrets {
    private map = new Map<string, string>();
    async get(k: string): Promise<string | undefined> { return this.map.get(k); }
    async store(k: string, v: string): Promise<void> { this.map.set(k, v); }
    async delete(k: string): Promise<void> { this.map.delete(k); }
}

function makeContext() {
    const map = new Map<string, any>();
    const secrets = new MemorySecrets();
    return {
        ctx: {
            globalState: {
                get<T>(key: string, def?: T): T | undefined {
                    return map.has(key) ? (map.get(key) as T) : def;
                },
                update(key: string, value: any): Thenable<void> {
                    map.set(key, value);
                    return Promise.resolve();
                }
            },
            secrets,
            extensionUri: { fsPath: '/' }
        } as any,
        secrets,
        gs: map
    };
}

async function runTests() {
    console.log('Running ConnectionManager password tests...');

    let passed = 0;
    let failed = 0;

    function test(name: string, fn: () => void | Promise<void>) {
        return Promise.resolve()
            .then(fn)
            .then(() => { console.log(`✅ ${name}`); passed++; })
            .catch((err: any) => {
                console.error(`❌ ${name}`);
                console.error(err.message);
                failed++;
            });
    }

    function makeConn(id: string, password?: string): DatabaseConnection {
        return { id, host: 'h', port: 3050, database: '/d.fdb', user: 'SYSDBA', password };
    }

    // --- migrate from globalState into secrets ---

    await test('initializePasswordStore migrates legacy plain passwords from globalState into secrets', async () => {
        const { ctx, secrets, gs } = makeContext();
        // Pre-seed legacy globalState shape (passwords inline).
        gs.set('firebird.connections', [makeConn('a', 'pwA'), makeConn('b', 'pwB')]);
        const cm = new ConnectionManager(ctx, () => [], () => { /* no-op */ });
        cm.loadConnections();

        await cm.initializePasswordStore();

        // In-memory still has the passwords (hydrated back).
        assert.strictEqual(cm.getConnectionById('a')!.password, 'pwA');
        assert.strictEqual(cm.getConnectionById('b')!.password, 'pwB');
        // Secrets contain the passwords.
        assert.strictEqual(await secrets.get('firebird.password:a'), 'pwA');
        assert.strictEqual(await secrets.get('firebird.password:b'), 'pwB');
        // globalState was rewritten without passwords.
        const stored = gs.get('firebird.connections') as DatabaseConnection[];
        assert.strictEqual(stored.find(c => c.id === 'a')!.password, undefined);
        assert.strictEqual(stored.find(c => c.id === 'b')!.password, undefined);
    });

    // --- saveConnections must NOT erase in-memory passwords ---

    await test('saveConnections persists stripped to globalState but keeps in-memory passwords', async () => {
        const { ctx, gs } = makeContext();
        const cm = new ConnectionManager(ctx, () => [], () => { /* no-op */ });
        cm.setConnections([makeConn('a', 'pwA')]);
        cm.saveConnections();
        // Disk is stripped.
        const stored = gs.get('firebird.connections') as DatabaseConnection[];
        assert.strictEqual(stored[0].password, undefined);
        // Memory still has it.
        assert.strictEqual(cm.getConnectionById('a')!.password, 'pwA');
    });

    // --- repro: restore-flow side-effect ---

    await test('After restore-like flow, in-memory password survives a tree refresh that does NOT reload from disk', async () => {
        const { ctx } = makeContext();
        const cm = new ConnectionManager(ctx, () => [], () => { /* no-op */ });

        // Simulate restoreConnections:
        cm.setConnections([makeConn('a', 'pwA')]);
        await cm.initializePasswordStore();
        cm.saveConnections();

        // Memory must still have the password — caller will fire the tree
        // change event, but must NOT reload from globalState (which is stripped).
        assert.strictEqual(cm.getConnectionById('a')!.password, 'pwA');
    });

    await test('Edit-flow: persistPassword + saveConnections keeps in-memory password (no reload)', async () => {
        const { ctx, secrets } = makeContext();
        const cm = new ConnectionManager(ctx, () => [], () => { /* no-op */ });

        // Pre-existing connection with stored password
        cm.setConnections([makeConn('a', 'pwOld')]);
        await cm.initializePasswordStore();

        // Simulate edit: replace the connection in memory (as ConnectionManager.editDatabase does)
        // — caller has called persistPassword internally too.
        await secrets.store('firebird.password:a', 'pwNew');
        cm.getConnectionById('a')!.password = 'pwNew';
        cm.saveConnections();

        // Memory should still have the new password (the bug was that refresh()
        // used to call loadConnections() which wiped this).
        assert.strictEqual(cm.getConnectionById('a')!.password, 'pwNew');
    });

    await test('Reload from globalState (loadConnections) wipes passwords, requiring re-hydrate', async () => {
        const { ctx } = makeContext();
        const cm = new ConnectionManager(ctx, () => [], () => { /* no-op */ });

        cm.setConnections([makeConn('a', 'pwA')]);
        await cm.initializePasswordStore();
        cm.saveConnections();

        // This is what the buggy refresh() used to do: reload from globalState.
        cm.loadConnections();
        // Predictable consequence: passwords gone from memory.
        assert.strictEqual(cm.getConnectionById('a')!.password, undefined);

        // Re-hydrating from secrets restores them.
        await cm.initializePasswordStore();
        assert.strictEqual(cm.getConnectionById('a')!.password, 'pwA');
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
