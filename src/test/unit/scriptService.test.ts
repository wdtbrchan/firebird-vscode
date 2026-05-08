import * as assert from 'assert';
import * as mock from './vscodeMock';

import * as Module from 'module';
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (path: string, ...args: any[]) {
    if (path === 'vscode') return mock;
    return originalRequire.apply(this, [path, ...args]);
};

import { ScriptService } from '../../services/scriptService';

interface MockGlobalState {
    get<T>(key: string, def?: T): T | undefined;
    update(key: string, value: any): Thenable<void>;
}

function makeContext(): { globalState: MockGlobalState; extensionUri: any; secrets: any } {
    const map = new Map<string, any>();
    return {
        globalState: {
            get<T>(key: string, def?: T): T | undefined {
                return map.has(key) ? (map.get(key) as T) : def;
            },
            update(key: string, value: any): Thenable<void> {
                map.set(key, value);
                return Promise.resolve();
            }
        },
        extensionUri: { fsPath: '/' },
        secrets: {}
    };
}

async function runTests() {
    console.log('Running ScriptService tests...');

    let passed = 0;
    let failed = 0;

    function test(name: string, fn: () => void | Promise<void>) {
        return Promise.resolve()
            .then(fn)
            .then(() => {
                console.log(`✅ ${name}`);
                passed++;
            })
            .catch((err: any) => {
                console.error(`❌ ${name}`);
                console.error(err.message);
                failed++;
            });
    }

    // --- DI: instances ---

    await test('Constructor builds an empty state when globalState is empty', () => {
        const ctx = makeContext() as any;
        const svc = new ScriptService(ctx);
        assert.deepStrictEqual(svc.getScripts(), []);
        assert.deepStrictEqual(svc.getScripts('connA'), []);
    });

    await test('Two instances are isolated (no shared singleton state)', () => {
        const a = new ScriptService(makeContext() as any);
        const b = new ScriptService(makeContext() as any);
        a.addScript('one.sql', '/one.sql', 'connA');
        assert.strictEqual(a.getScripts('connA').length, 1);
        assert.strictEqual(b.getScripts('connA').length, 0);
    });

    // --- CRUD ---

    await test('addScript appends to root for shared scripts (no connectionId)', () => {
        const svc = new ScriptService(makeContext() as any);
        const item = svc.addScript('foo.sql', '/foo.sql');
        assert.strictEqual(item.name, 'foo.sql');
        assert.strictEqual(item.fsPath, '/foo.sql');
        assert.strictEqual(item.type, 'file');
        assert.strictEqual(item.isShared, true);
        assert.deepStrictEqual(svc.getScripts(), [item]);
    });

    await test('addScript with connectionId stores under that connection', () => {
        const svc = new ScriptService(makeContext() as any);
        svc.addScript('a.sql', '/a.sql', 'connA');
        assert.strictEqual(svc.getScripts('connA').length, 1);
        assert.strictEqual(svc.getScripts().length, 0);
    });

    await test('addFolder under parent appends to parent.children', () => {
        const svc = new ScriptService(makeContext() as any);
        const parent = svc.addFolder('parent', undefined);
        const child = svc.addFolder('child', undefined, parent.id);
        const root = svc.getScripts();
        assert.strictEqual(root.length, 1);
        assert.strictEqual(root[0].children?.length, 1);
        assert.strictEqual(root[0].children![0].id, child.id);
    });

    await test('removeItem deletes nested item by id', () => {
        const svc = new ScriptService(makeContext() as any);
        const folder = svc.addFolder('f');
        const file = svc.addScript('a.sql', '/a.sql', undefined, folder.id);
        svc.removeItem(file.id);
        assert.strictEqual(svc.getScripts()[0].children?.length, 0);
    });

    await test('renameItem updates the name', () => {
        const svc = new ScriptService(makeContext() as any);
        const f = svc.addFolder('old');
        svc.renameItem(f.id, 'new');
        assert.strictEqual(svc.getScripts()[0].name, 'new');
    });

    await test('getScriptById finds nested items', () => {
        const svc = new ScriptService(makeContext() as any);
        const folder = svc.addFolder('f', 'connA');
        const file = svc.addScript('a.sql', '/a.sql', 'connA', folder.id);
        const found = svc.getScriptById(file.id);
        assert.strictEqual(found?.name, 'a.sql');
    });

    // --- pending scripts ---

    await test('createPendingScript marks pending=true', () => {
        const svc = new ScriptService(makeContext() as any);
        const item = svc.createPendingScript('untitled');
        assert.strictEqual(item.pending, true);
    });

    await test('resolvePendingScript clears pending and updates fsPath/name', () => {
        const svc = new ScriptService(makeContext() as any);
        const item = svc.createPendingScript('untitled');
        svc.resolvePendingScript(item.id, '/saved.sql');
        const after = svc.getScriptById(item.id);
        assert.strictEqual(after?.pending, false);
        assert.strictEqual(after?.fsPath, '/saved.sql');
        assert.strictEqual(after?.name, 'saved.sql');
    });

    // --- moveItem ---

    await test('moveItem moves a script from connection-A to connection-B', () => {
        const svc = new ScriptService(makeContext() as any);
        const item = svc.addScript('a.sql', '/a.sql', 'connA');
        svc.moveItem(item.id, undefined, 'connB');
        assert.strictEqual(svc.getScripts('connA').length, 0);
        assert.strictEqual(svc.getScripts('connB').length, 1);
    });

    await test('moveItem to shared root flips isShared=true', () => {
        const svc = new ScriptService(makeContext() as any);
        const item = svc.addScript('a.sql', '/a.sql', 'connA');
        svc.moveItem(item.id, undefined, undefined, true);
        const moved = svc.getScripts()[0];
        assert.strictEqual(moved.isShared, true);
    });

    // --- persistence ---

    await test('Mutations persist via globalState (re-instantiated service sees them)', () => {
        const ctx = makeContext() as any;
        const a = new ScriptService(ctx);
        a.addScript('x.sql', '/x.sql', 'connA');
        const b = new ScriptService(ctx);
        assert.strictEqual(b.getScripts('connA').length, 1);
        assert.strictEqual(b.getScripts('connA')[0].name, 'x.sql');
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
