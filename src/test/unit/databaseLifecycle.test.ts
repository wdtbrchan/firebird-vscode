import * as assert from 'assert';
import * as Module from 'module';

type AttachCallback = (err: Error | null, db: any) => void;

const configuration = new Map<string, number>([
    ['connectionTimeout', 0.02],
    ['driverOperationTimeout', 0.05],
    ['queryTimeout', 0.05],
    ['blobReadTimeout', 0.02],
    ['transactionTimeout', 0.02],
    ['autoRollbackTimeout', 60]
]);

const outputChannel = {
    appendLine: () => {},
    show: () => {},
    dispose: () => {}
};

const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (key: string, fallback: unknown) => configuration.has(key) ? configuration.get(key) : fallback
        })
    },
    window: {
        createOutputChannel: () => outputChannel,
        showInformationMessage: () => Promise.resolve(undefined)
    }
};

const firebirdMock: {
    ISOLATION_READ_COMMITTED: number;
    attach: (options: unknown, callback: AttachCallback) => void;
} = {
    ISOLATION_READ_COMMITTED: 2,
    attach: () => {}
};

const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function(path: string, ...args: any[]) {
    if (path === 'vscode') return vscodeMock;
    if (path === 'node-firebird') return firebirdMock;
    return originalRequire.apply(this, [path, ...args]);
};

import { QueryExecutor } from '../../database/queryExecutor';
import { TransactionManager } from '../../database/transactionManager';
import { processResultRows } from '../../database/encodingUtils';
import { DatabaseConnection } from '../../database/types';

const connection: DatabaseConnection = {
    id: 'test',
    host: 'localhost',
    port: 3050,
    database: '/test.fdb',
    user: 'SYSDBA',
    password: 'masterkey'
};

function createDmlDatabase(closeThrows: boolean = false) {
    let detachCount = 0;
    let transactionCount = 0;
    const statement = {
        output: [],
        type: 2,
        handle: 1,
        execute: (
            _tr: unknown,
            _params: unknown[],
            callback: (err: Error | null, result: unknown, output: unknown, isSelect: boolean) => void
        ) => callback(null, undefined, undefined, false),
        fetch: () => {},
        close: () => {
            if (closeThrows) throw new Error('close failed');
        },
        drop: () => {}
    };
    const transaction = {
        newStatement: (_query: string, callback: (err: Error | null, value: typeof statement) => void) => callback(null, statement),
        commit: (callback: (err: Error | null) => void) => callback(null),
        rollback: (callback: (err: Error | null) => void) => callback(null)
    };
    const database = {
        on: () => {},
        transaction: (_isolation: number, callback: (err: Error | null, value: typeof transaction) => void) => {
            transactionCount++;
            callback(null, transaction);
        },
        detach: () => { detachCount++; }
    };
    return {
        database,
        transaction,
        get detachCount() { return detachCount; },
        get transactionCount() { return transactionCount; }
    };
}

async function delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('Running database lifecycle tests...');
    let passed = 0;
    let failed = 0;

    async function test(name: string, fn: () => Promise<void>) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (err) {
            console.error(`❌ ${name}`);
            console.error(err instanceof Error ? err.stack || err.message : err);
            failed++;
        } finally {
            TransactionManager.cleanupAll();
        }
    }

    await test('missing attach callback times out and releases the operation slot', async () => {
        firebirdMock.attach = () => {};
        await assert.rejects(
            QueryExecutor.executeQuery('timeout', 'select 1', connection),
            /timed out during connecting to Firebird/i
        );

        const successful = createDmlDatabase();
        firebirdMock.attach = (_options, callback) => callback(null, successful.database);
        const result = await QueryExecutor.executeQuery('timeout', 'update t set x = 1', connection);
        assert.deepStrictEqual(result.rows, []);
    });

    await test('late attach callback after cancel cannot revive the connection', async () => {
        let attachCallback: AttachCallback | undefined;
        firebirdMock.attach = (_options, callback) => { attachCallback = callback; };

        const pending = QueryExecutor.executeQuery('cancel-race', 'select 1', connection);
        await delay(0);
        assert.ok(attachCallback, 'attach callback should be registered before cancellation');
        const manager = TransactionManager.getInstance('cancel-race');
        manager.cancelConnection();
        await assert.rejects(pending, /Cancelled by user/);

        const late = createDmlDatabase();
        attachCallback!(null, late.database);
        await delay(5);

        assert.strictEqual(manager.db, undefined);
        assert.strictEqual(manager.hasActiveTransaction, false);
        assert.strictEqual(late.transactionCount, 0);
        assert.strictEqual(late.detachCount, 1);
        assert.strictEqual(manager.autoRollbackTimer, undefined);
    });

    await test('exception from statement.close cannot leave the outer Promise pending', async () => {
        const fixture = createDmlDatabase(true);
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);

        const result = await QueryExecutor.executeQuery('close-error', 'update t set x = 1', connection);
        assert.deepStrictEqual(result.rows, []);
    });

    await test('a second operation cannot overwrite cancellation of the first', async () => {
        firebirdMock.attach = () => {};
        const first = QueryExecutor.executeQuery('exclusive', 'select 1', connection);
        const second = QueryExecutor.executeQuery('exclusive', 'select 2', connection);

        await assert.rejects(second, /already running/i);
        TransactionManager.getInstance('exclusive').cancelConnection();
        await assert.rejects(first, /Cancelled by user/);
    });

    await test('BLOB reader without callback is bounded by its timeout', async () => {
        const stalledBlob = (_callback: (err: unknown, name: unknown, emitter: NodeJS.EventEmitter) => void) => {};
        await assert.rejects(
            processResultRows([[stalledBlob]], 'UTF8', ['DATA'], 20),
            /BLOB read timed out/i
        );
    });

    await test('commit callback timeout clears the transaction state', async () => {
        const fixture = createDmlDatabase();
        const manager = TransactionManager.getInstance('commit-timeout');
        manager.db = fixture.database as any;
        manager.transaction = {
            commit: () => {},
            rollback: () => {}
        } as any;

        await assert.rejects(manager.commit(), /commit timed out/i);
        assert.strictEqual(manager.hasActiveTransaction, false);
        assert.strictEqual(manager.db, undefined);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

void runTests();
