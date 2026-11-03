import * as assert from 'assert';
import * as Module from 'module';
import * as path from 'path';
import type { DatabaseConnection, QueryOptions, QueryResult } from '../../database/types';
import type { ExecutionDataEvent } from '../../services/executionService';

class MockEventEmitter<T> {
    private listeners: ((value: T) => void)[] = [];
    public event = (listener: (value: T) => void) => { this.listeners.push(listener); };
    public fire(value: T) { this.listeners.forEach(listener => listener(value)); }
}

const calls: { query: string; options?: QueryOptions }[] = [];
let execute: (query: string, options?: QueryOptions) => Promise<QueryResult>;
let hasTransaction = true;
let rollbackCount = 0;
let exported: Buffer | undefined;
const database = {
    executeQuery: (_id: string, query: string, _connection: DatabaseConnection, options?: QueryOptions) => {
        calls.push({ query, options });
        return execute(query, options);
    },
    hasActiveTransaction: () => hasTransaction,
    rollback: async () => { rollbackCount++; }
};
const vscodeMock = {
    EventEmitter: MockEventEmitter,
    Uri: {
        file: (fsPath: string) => ({ fsPath }),
        joinPath: (uri: { fsPath: string }, ...parts: string[]) => ({ fsPath: path.join(uri.fsPath, ...parts) })
    },
    workspace: {
        getConfiguration: () => ({
            get: (key: string, fallback: unknown) => key === 'maxRows' ? 1 : key === 'queryAudioNotificationEnabled' ? false : fallback,
            update: async () => {}
        }),
        fs: { writeFile: async (_uri: unknown, buffer: Buffer) => { exported = buffer; } }
    },
    window: {
        showWarningMessage: () => {},
        showInformationMessage: () => {},
        showErrorMessage: (message: string) => { throw new Error(message); },
        showSaveDialog: async () => ({ fsPath: '/export.csv' })
    }
};
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function(name: string, ...args: unknown[]) {
    if (name === 'vscode') return vscodeMock;
    if (name === '../database') return { Database: database };
    if (name === '../database/transactionManager') return { TransactionManager: {} };
    if (name === '../logger') return { FirebirdLog: { info: () => {}, error: () => {} } };
    return originalRequire.apply(this, [name, ...args]);
};

import { ExecutionService } from '../../services/executionService';
import { ScriptParser } from '../../services/scriptParser';
import { ExportService } from '../../resultsPanel/exportService';
import { getResultsPageHtml } from '../../resultsPanel/templates/resultsTemplate';

const connection: DatabaseConnection = { id: 'test', host: 'localhost', port: 3050, database: '/test.fdb', user: 'SYSDBA' };
const block = `SET TERM ^ ;
EXECUTE BLOCK
RETURNS (updated_clients INTEGER, skipped_clients INTEGER)
AS
BEGIN
    updated_clients = 0;
    skipped_clients = 1;
    SUSPEND;
END^
SET TERM ; ^`;

function fixture() {
    const service = ExecutionService.getInstance('test');
    const events: ExecutionDataEvent[] = [];
    service.onData(event => events.push(event));
    return { service, events };
}

async function runTests() {
    let failed = 0;
    let passed = 0;
    async function test(name: string, fn: () => Promise<void>) {
        calls.length = 0;
        hasTransaction = true;
        rollbackCount = 0;
        exported = undefined;
        ExecutionService.instances.clear();
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (err) {
            console.error(`❌ ${name}`, err);
            failed++;
        }
    }

    await test('SET TERM wrapped single block shows returned rows instead of a script summary', async () => {
        const { service, events } = fixture();
        execute = async () => ({ rows: [{ UPDATED_CLIENTS: 0, SKIPPED_CLIENTS: 1 }], hasMore: false });
        await service.executeScript(ScriptParser.split(block), connection);
        assert.deepStrictEqual(events[0].results, [{ UPDATED_CLIENTS: 0, SKIPPED_CLIENTS: 1 }]);
        assert.notStrictEqual(events[0].resultKind, 'scriptSummary');
        assert.strictEqual(calls.length, 1);
        assert.ok(!calls[0].query.includes('SET TERM'));
    });

    await test('single-statement scripts retain cursor pagination', async () => {
        const { service, events } = fixture();
        execute = async (_query, options) => ({ rows: [{ VALUE: options?.offset ? 2 : 1 }], hasMore: !options?.offset });
        await service.executeScript(['select value from p'], connection);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(events[0].hasMore, true);
        await service.loadMore();
        assert.strictEqual(events[1].append, true);
        assert.deepStrictEqual(events[1].results, [{ VALUE: 2 }]);
        assert.strictEqual(events[1].hasMore, false);
        assert.strictEqual(calls[1].options?.offset, 1);
    });

    await test('multi-statement scripts drain to EOF before continuing and retain separate results', async () => {
        const { service, events } = fixture();
        execute = async (query, options) => {
            if (query === 'block') return options?.offset
                ? { rows: [], columns: ['A'], hasMore: false, affectedRows: 3 }
                : { rows: [{ A: 1 }], columns: ['A'], hasMore: true };
            return { rows: [{ B: 2 }], columns: ['B'], hasMore: false };
        };
        await service.executeScript(['block', 'select'], connection);
        assert.deepStrictEqual(calls.map(call => [call.query, call.options?.offset]), [['block', 0], ['block', 1], ['select', 0]]);
        assert.strictEqual(events[0].resultKind, 'scriptSummary');
        assert.strictEqual(events[0].results[0].Rows, 1);
        assert.strictEqual(events[0].results[0]['Affected Rows'], 3);
        assert.deepStrictEqual(events[0].scriptResults?.map(result => result.index), [1, 2]);
        service.selectScriptResult(1);
        assert.deepStrictEqual(events[1].results, [{ A: 1 }]);
        assert.strictEqual(events[1].viewOnly, true);
        assert.strictEqual(events[1].query, undefined);
        assert.strictEqual(events[1].resultKind, 'scriptResult');
        hasTransaction = false;
        service.selectScriptResult(2);
        assert.deepStrictEqual(events[2].results, [{ B: 2 }]);
        assert.strictEqual(events[2].hasTransaction, false);
        service.selectScriptResult(0);
        assert.strictEqual(events[3].resultKind, 'scriptSummary');
        assert.strictEqual(events[3].hasTransaction, false);
        assert.strictEqual(calls.length, 3, 'Switching results must not execute SQL');
        await service.loadMore();
        assert.strictEqual(calls.length, 3);
    });

    await test('empty result sets remain selectable while statements without output do not', async () => {
        const { service, events } = fixture();
        execute = async query => query === 'empty' ? { rows: [], columns: ['VALUE'], hasMore: false } : { rows: [], affectedRows: 2 };
        await service.executeScript(['empty', 'update'], connection);
        assert.deepStrictEqual(events[0].scriptResults, [{ index: 1, label: 'Statement 1: 0 rows' }]);
        service.selectScriptResult(1);
        assert.deepStrictEqual(events[1].results, []);
        assert.strictEqual(events[1].resultKind, 'scriptResult');
    });

    await test('failure during pagination stops the script and marks partial output incomplete', async () => {
        const { service, events } = fixture();
        execute = async (_query, options) => {
            if (options?.offset) throw new Error('Cancelled by user');
            return { rows: [{ VALUE: 1 }], columns: ['VALUE'], hasMore: true };
        };
        await service.executeScript(['block', 'must not execute'], connection);
        assert.strictEqual(calls.length, 2);
        assert.ok(calls.every(call => call.query === 'block'));
        assert.strictEqual(events[0].results[0].Status, 'ERROR');
        assert.strictEqual(events[0].results[0].Error, 'Cancelled by user');
        assert.strictEqual(events[0].results[0].Rows, 1);
        assert.ok(events[0].scriptResults?.[0].label.includes('incomplete'));
        service.selectScriptResult(1);
        assert.deepStrictEqual(events[1].results, [{ VALUE: 1 }]);
    });

    await test('a new query clears previous script navigation and invalid selections are ignored', async () => {
        const { service, events } = fixture();
        execute = async () => ({ rows: [{ VALUE: 1 }], hasMore: false });
        await service.executeScript(['one', 'two'], connection);
        service.selectScriptResult(99);
        assert.strictEqual(events.length, 1);
        await service.executeNewQuery('new', connection);
        assert.strictEqual(events[1].scriptResults, undefined);
        service.selectScriptResult(1);
        assert.strictEqual(events.length, 2);
    });

    await test('script navigation is escaped and renders one active result table', async () => {
        const html = getResultsPageHtml({ fsPath: process.cwd() } as any, {
            results: [{ VALUE: '<result>' }], message: undefined, showButtons: true, isError: false,
            context: 'Test', hasMore: false, transactionAction: undefined, affectedRows: undefined,
            currentQuery: undefined, displayQuery: 'block', currentConnection: connection,
            lastExecutionTime: 1, autoRollbackAt: 0, locale: 'en-US', resultKind: 'scriptResult',
            scriptResults: [{ index: 1, label: 'Statement <1>' }], selectedScriptResult: 1
        });
        assert.ok(html.includes('id="scriptResultSelect"'));
        assert.ok(html.includes('value="1" selected>Statement &lt;1&gt;'));
        assert.ok(html.includes('&lt;result&gt;'));
        assert.strictEqual((html.match(/<table>/g) || []).length, 1);
        assert.ok(html.includes('data-editable-table=""'));
        assert.ok(!html.includes('id="loadMoreBtn"'));
    });

    await test('CSV export of script results uses cached data without SQL or transaction changes', async () => {
        execute = async () => { throw new Error('Must not execute SQL'); };
        await ExportService.exportCsv(undefined, undefined, connection, {}, [{ VALUE: 42 }]);
        assert.ok(exported?.toString('utf8').includes('42'));
        assert.strictEqual(calls.length, 0);
        assert.strictEqual(rollbackCount, 0);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed) process.exit(1);
}

void runTests();
