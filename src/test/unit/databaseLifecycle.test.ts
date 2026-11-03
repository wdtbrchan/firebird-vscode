import * as assert from 'assert';
import * as Module from 'module';
import { EventEmitter } from 'events';

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
import { RowCounter } from '../../database/rowCounter';

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

function createMetadataDatabase(rows: unknown[]) {
    const events: string[] = [];
    let active = false;
    const transaction = {
        query: (_query: string, _params: unknown[], callback: (err: Error | null, rows: unknown[]) => void) => {
            events.push('query');
            callback(null, rows);
        },
        commit: (callback: (err: Error | null) => void) => {
            events.push('commit');
            active = false;
            callback(null);
        },
        rollback: (callback: (err: Error | null) => void) => {
            events.push('rollback');
            active = false;
            callback(null);
        }
    };
    const database = {
        on: () => {},
        transaction: (_isolation: number, callback: (err: Error | null, value: typeof transaction) => void) => {
            events.push('begin');
            active = true;
            callback(null, transaction);
        },
        // Reproduce the driver's auto-commit path used before the fix.
        query: (sql: string, params: unknown[], callback: (err: Error | null, rows: unknown[]) => void) => {
            transaction.query(sql, params, (err, result) => {
                transaction.commit(() => callback(err, result));
            });
        },
        detach: () => { events.push('detach'); },
        connection: {
            _socket: {
                destroy: () => {
                    events.push('destroy');
                    active = false;
                }
            }
        }
    };
    return { database, transaction, events, get active() { return active; } };
}

function createSelectDatabase(fetchDelayMs: number) {
    let fetchCount = 0;
    const statement = {
        output: [{ alias: 'VALUE' }],
        type: 1,
        execute: (
            _tr: unknown,
            _params: unknown[],
            callback: (err: Error | null, result: unknown, output: unknown, isSelect: boolean) => void
        ) => callback(null, undefined, undefined, true),
        fetch: (
            _tr: unknown,
            _limit: number,
            callback: (err: Error | null, result: { data: number[][]; fetched: boolean }) => void
        ) => {
            const page = ++fetchCount;
            setTimeout(() => callback(null, { data: [[page]], fetched: page >= 2 }), fetchDelayMs);
        },
        close: () => {},
        drop: () => {}
    };
    const fixture = createDmlDatabase();
    const transaction = {
        ...fixture.transaction,
        newStatement: (_query: string, callback: (err: Error | null, value: typeof statement) => void) => callback(null, statement)
    };
    const database = {
        ...fixture.database,
        transaction: (_isolation: number, callback: (err: Error | null, value: typeof transaction) => void) => callback(null, transaction)
    };
    return { database, statement };
}

function createResultDatabase(type: number, columns: string[], executeResult?: { data: unknown[] }) {
    const fixture = createDmlDatabase();
    const calls = { execute: 0, fetch: [] as number[], close: 0 };
    const statement = {
        type,
        output: columns.map(alias => ({ alias })),
        execute: (_tr: unknown, _params: unknown[], callback: (err: Error | null, result?: { data: unknown[] }) => void) => {
            calls.execute++;
            callback(null, executeResult);
        },
        fetch: (_tr: unknown, limit: number, callback: (err: Error | null, result: { data: unknown[]; fetched: boolean }) => void) => {
            calls.fetch.push(limit);
            callback(null, { data: columns.length === 2 ? [[0, 1]] : [[42]], fetched: true });
        },
        close: () => { calls.close++; },
        drop: () => {}
    };
    const transaction = {
        ...fixture.transaction,
        newStatement: (_query: string, callback: (err: Error | null, value: typeof statement) => void) => callback(null, statement)
    };
    const database = {
        ...fixture.database,
        transaction: (_isolation: number, callback: (err: Error | null, value: typeof transaction) => void) => callback(null, transaction)
    };
    return { database, statement, calls, transaction };
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

    for (const queryTimeout of [0.2, 0]) {
        await test(`initial and subsequent result pages use queryTimeout=${queryTimeout} instead of driverOperationTimeout`, async () => {
            const originalQueryTimeout = configuration.get('queryTimeout')!;
            const originalDriverTimeout = configuration.get('driverOperationTimeout')!;
            configuration.set('queryTimeout', queryTimeout);
            configuration.set('driverOperationTimeout', 0.01);
            try {
                const fixture = createSelectDatabase(40);
                firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
                const query = 'select value from slow_procedure';
                const first = await QueryExecutor.executeQuery('slow-fetch', query, connection, { limit: 1 });
                assert.deepStrictEqual(first, { rows: [{ VALUE: 1 }], columns: ['VALUE'], hasMore: true });
                const second = await QueryExecutor.executeQuery('slow-fetch', query, connection, { limit: 1, offset: 1 });
                assert.deepStrictEqual(second, { rows: [{ VALUE: 2 }], columns: ['VALUE'], hasMore: false });
            } finally {
                configuration.set('queryTimeout', originalQueryTimeout);
                configuration.set('driverOperationTimeout', originalDriverTimeout);
            }
        });
    }

    await test('EXECUTE BLOCK RETURNS fetches rows using low-level statement metadata', async () => {
        const fixture = createResultDatabase(1, ['UPDATED_CLIENTS', 'SKIPPED_CLIENTS']);
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
        const result = await QueryExecutor.executeQuery('block', `EXECUTE BLOCK
RETURNS (updated_clients INTEGER, skipped_clients INTEGER)
AS BEGIN updated_clients = 0; skipped_clients = 1; SUSPEND; END`, connection);
        assert.deepStrictEqual(result.rows, [{ UPDATED_CLIENTS: 0, SKIPPED_CLIENTS: 1 }]);
        assert.deepStrictEqual(fixture.calls, { execute: 1, fetch: [1000], close: 1 });
        assert.strictEqual(TransactionManager.getInstance('block').activeStatement, undefined);
    });

    for (const type of [1, 2, 12]) {
        await test(`output-bearing statement type ${type} reads its cursor`, async () => {
            const fixture = createResultDatabase(type, ['VALUE']);
            firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
            const result = await QueryExecutor.executeQuery('cursor', 'SQL supplied by caller', connection);
            assert.deepStrictEqual(result.rows, [{ VALUE: 42 }]);
            assert.deepStrictEqual(fixture.calls.fetch, [1000]);
            assert.strictEqual(result.hasMore, false);
        });
    }

    for (const data of [[[42]], []]) {
        await test(`execute2 singleton with ${data.length} rows is consumed without fetching`, async () => {
            const fixture = createResultDatabase(8, ['VALUE'], { data });
            firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
            const result = await QueryExecutor.executeQuery('singleton', 'execute procedure p', connection, { limit: 1 });
            assert.deepStrictEqual(result.rows, data.map(row => ({ VALUE: row[0] })));
            assert.deepStrictEqual(result.columns, ['VALUE']);
            assert.strictEqual(result.hasMore, false);
            assert.deepStrictEqual(fixture.calls, { execute: 1, fetch: [], close: 1 });
        });
    }

    await test('legacy singleton output fetches exactly one row and closes even without EOF', async () => {
        const fixture = createResultDatabase(8, ['VALUE']);
        fixture.statement.fetch = (_tr, limit, callback) => {
            fixture.calls.fetch.push(limit);
            callback(null, { data: [[42]], fetched: false });
        };
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
        const result = await QueryExecutor.executeQuery('legacy', 'insert into t values (42) returning id', connection, { limit: 1 });
        assert.deepStrictEqual(result.rows, [{ VALUE: 42 }]);
        assert.strictEqual(result.hasMore, false);
        assert.deepStrictEqual(fixture.calls, { execute: 1, fetch: [1], close: 1 });
    });

    await test('EXECUTE BLOCK without output does not fetch', async () => {
        const fixture = createResultDatabase(8, []);
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
        const result = await QueryExecutor.executeQuery('no-output', 'execute block as begin end', connection);
        assert.deepStrictEqual(result.rows, []);
        assert.deepStrictEqual(fixture.calls, { execute: 1, fetch: [], close: 1 });
    });

    await test('short cursor pages without EOF remain available until the server reports completion', async () => {
        const fixture = createResultDatabase(1, ['VALUE']);
        fixture.statement.fetch = (_tr, limit, callback) => {
            fixture.calls.fetch.push(limit);
            callback(null, { data: fixture.calls.fetch.length === 1 ? [[42]] : [], fetched: fixture.calls.fetch.length > 1 });
        };
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
        const first = await QueryExecutor.executeQuery('short-page', 'select value from p', connection);
        assert.strictEqual(first.hasMore, true);
        assert.strictEqual(fixture.calls.close, 0);
        const last = await QueryExecutor.executeQuery('short-page', 'select value from p', connection, { offset: 1 });
        assert.strictEqual(last.hasMore, false);
        assert.strictEqual(fixture.calls.close, 1);
    });

    await test('RETURNING rows retain affected row counts before statement cleanup', async () => {
        const originalCounter = RowCounter.getAffectedRows;
        try {
            for (const type of [8, 2]) {
                const fixture = createResultDatabase(type, ['ID'], type === 8 ? { data: [[42]] } : undefined);
                RowCounter.getAffectedRows = async (stmt, tr, dmlType) => {
                    assert.strictEqual(stmt, fixture.statement);
                    assert.strictEqual(tr, fixture.transaction);
                    assert.strictEqual(dmlType, 'insert');
                    assert.strictEqual(fixture.calls.close, 0);
                    return 1;
                };
                firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
                const result = await QueryExecutor.executeQuery(`returning-${type}`, 'insert into t values (42) returning id', connection);
                assert.deepStrictEqual(result.rows, [{ ID: 42 }]);
                assert.strictEqual(result.affectedRows, 1);
                assert.strictEqual(fixture.calls.close, 1);
            }
        } finally {
            RowCounter.getAffectedRows = originalCounter;
        }
    });

    await test('singleton BLOB output is read in its transaction before statement cleanup', async () => {
        const fixture = createResultDatabase(8, ['SOURCE'], { data: [] });
        fixture.statement.execute = (_tr, _params, callback) => callback(null, { data: [[
            (tr: unknown, done: (err: Error | null, name: string, emitter: EventEmitter) => void) => {
                assert.strictEqual(tr, fixture.transaction);
                assert.strictEqual(fixture.calls.close, 0);
                const emitter = new EventEmitter();
                done(null, 'SOURCE', emitter);
                setImmediate(() => { emitter.emit('data', Buffer.from('source')); emitter.emit('end'); });
            }
        ]] });
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
        const result = await QueryExecutor.executeQuery('singleton-blob', 'execute procedure p', connection);
        assert.deepStrictEqual(result.rows, [{ SOURCE: 'source' }]);
        assert.strictEqual(fixture.calls.close, 1);
    });

    for (const stage of ['executing SQL statement', 'fetching result rows', 'fetching more result rows']) {
        await test(`${stage} timeout explains queryTimeout and permits another query`, async () => {
            const fixture = createSelectDatabase(0);
            firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
            const query = 'select value from slow_procedure';
            if (stage === 'executing SQL statement') {
                fixture.statement.execute = () => {};
            } else {
                if (stage === 'fetching more result rows') {
                    await QueryExecutor.executeQuery('query-timeout', query, connection, { limit: 1 });
                }
                fixture.statement.fetch = () => {};
            }
            const offset = stage === 'fetching more result rows' ? 1 : 0;
            await assert.rejects(
                QueryExecutor.executeQuery('query-timeout', query, connection, { limit: 1, offset }),
                (err: Error) => {
                    assert.ok(err.message.includes(`timed out during ${stage}`));
                    assert.ok(err.message.includes('Increase "firebird.queryTimeout" in VS Code Settings (seconds)'));
                    assert.ok(err.message.includes('set it to 0 to disable this timeout'));
                    return true;
                }
            );
            const manager = TransactionManager.getInstance('query-timeout');
            assert.strictEqual(manager.db, undefined);
            assert.strictEqual(manager.hasActiveTransaction, false);
            const next = createDmlDatabase();
            firebirdMock.attach = (_options, callback) => callback(null, next.database);
            const result = await QueryExecutor.executeQuery('query-timeout', 'update t set x = 1', connection);
            assert.deepStrictEqual(result.rows, []);
        });
    }

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

    await test('passes Unicode SQL unchanged to node-firebird', async () => {
        const query = "select 'Brodský Tomáš' from rdb$database";
        let receivedQuery: string | undefined;
        const fixture = createMetadataDatabase([]);
        fixture.transaction.query = (sql, _params, done) => {
            receivedQuery = sql;
            done(null, []);
        };
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);

        await QueryExecutor.runMetaQuery('unicode-query', connection, query);
        assert.strictEqual(receivedQuery, query);
        assert.deepStrictEqual(fixture.events, ['begin', 'commit', 'detach']);
    });

    await test('reads complete metadata BLOBs in the query transaction before committing', async () => {
        const rawRows: unknown[] = [];
        const fixture = createMetadataDatabase(rawRows);
        const source = `AS\nBEGIN\n/* Brodský Tomáš ${'x'.repeat(40_000)} */\nEND`;
        const blob = (text: string) => (
            tr: unknown,
            callback: (err: Error | null, name: string, emitter: EventEmitter) => void
        ) => {
            if (tr !== fixture.transaction || !fixture.active) {
                throw new Error('Invalid BLOB ID');
            }
            const emitter = new EventEmitter();
            callback(null, 'SOURCE', emitter);
            setImmediate(() => {
                const buffer = Buffer.from(text, 'utf8');
                emitter.emit('data', buffer.subarray(0, 25));
                emitter.emit('data', buffer.subarray(25));
                fixture.events.push('blob-end');
                emitter.emit('end');
            });
        };
        rawRows.push({ RDB$TRIGGER_SOURCE: blob(source), RDB$TRIGGER_SEQUENCE: 0, DESCRIPTION: null });
        rawRows.push({ RDB$TRIGGER_SOURCE: blob('AS BEGIN END') });
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);

        const rows = await QueryExecutor.runMetaQuery('trigger-source', connection, 'select rdb$trigger_source from rdb$triggers');
        assert.deepStrictEqual(rows, [
            { RDB$TRIGGER_SOURCE: source, RDB$TRIGGER_SEQUENCE: 0, DESCRIPTION: null },
            { RDB$TRIGGER_SOURCE: 'AS BEGIN END' }
        ]);
        assert.deepStrictEqual(fixture.events, ['begin', 'query', 'blob-end', 'blob-end', 'commit', 'detach']);
    });

    await test('metadata BLOB failure closes the connection and permits the next request', async () => {
        const fixture = createMetadataDatabase([{
            RDB$TRIGGER_SOURCE: () => { throw new Error('Invalid BLOB ID'); }
        }]);
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
        await assert.rejects(
            QueryExecutor.runMetaQuery('trigger-source', connection, 'select source'),
            /Invalid BLOB ID/
        );
        assert.deepStrictEqual(fixture.events, ['begin', 'query', 'destroy']);
        assert.strictEqual(fixture.active, false);

        const next = createMetadataDatabase([{ RDB$TRIGGER_SOURCE: null }]);
        firebirdMock.attach = (_options, callback) => callback(null, next.database);
        assert.deepStrictEqual(await QueryExecutor.runMetaQuery('trigger-source', connection, 'select source'), [
            { RDB$TRIGGER_SOURCE: null }
        ]);
        assert.deepStrictEqual(next.events, ['begin', 'query', 'commit', 'detach']);
    });

    await test('metadata BLOB timeout closes the connection without committing', async () => {
        const fixture = createMetadataDatabase([{ RDB$TRIGGER_SOURCE: () => {} }]);
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
        await assert.rejects(
            QueryExecutor.runMetaQuery('blob-timeout', connection, 'select source'),
            /BLOB read timed out/i
        );
        assert.deepStrictEqual(fixture.events, ['begin', 'query', 'destroy']);
    });

    await test('metadata query and commit errors close their connections', async () => {
        for (const stage of ['query', 'commit'] as const) {
            const fixture = createMetadataDatabase([]);
            if (stage === 'query') {
                fixture.transaction.query = (_sql, _params, callback) => callback(new Error('query failed'), []);
            } else {
                fixture.transaction.commit = callback => callback(new Error('commit failed'));
            }
            firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
            await assert.rejects(
                QueryExecutor.runMetaQuery('metadata-error', connection, 'select source'),
                new RegExp(`${stage} failed`)
            );
            assert.strictEqual(fixture.events.filter(event => event === 'destroy').length, 1);
            assert.ok(!fixture.events.includes('detach'));
        }
    });

    await test('late metadata commit callback after timeout cannot settle or close twice', async () => {
        const fixture = createMetadataDatabase([]);
        let commitCallback: ((err: Error | null) => void) | undefined;
        fixture.transaction.commit = callback => { commitCallback = callback; };
        firebirdMock.attach = (_options, callback) => callback(null, fixture.database);
        await assert.rejects(
            QueryExecutor.runMetaQuery('metadata-commit-timeout', connection, 'select source'),
            /timed out during committing metadata transaction/i
        );
        assert.ok(commitCallback);
        commitCallback!(null);
        assert.deepStrictEqual(fixture.events, ['begin', 'query', 'destroy']);
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
