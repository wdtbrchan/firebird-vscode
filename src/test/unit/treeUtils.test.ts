import * as assert from 'assert';
import { findInTree, removeFromTree, insertIntoTree } from '../../explorer/treeUtils';

interface Node {
    id: string;
    label: string;
    children?: Node[];
}

async function runTests() {
    console.log('Running TreeUtils tests...');

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

    function makeTree(): Node[] {
        return [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B', children: [
                { id: 'b1', label: 'B1' },
                { id: 'b2', label: 'B2', children: [
                    { id: 'b2a', label: 'B2A' }
                ]}
            ]},
            { id: 'c', label: 'C' }
        ];
    }

    // --- findInTree ---

    test('findInTree finds top-level node', () => {
        const t = makeTree();
        const found = findInTree<Node>(t, n => n.id === 'a');
        assert.strictEqual(found?.label, 'A');
    });

    test('findInTree finds nested node', () => {
        const t = makeTree();
        const found = findInTree<Node>(t, n => n.id === 'b2a');
        assert.strictEqual(found?.label, 'B2A');
    });

    test('findInTree returns undefined when not found', () => {
        const t = makeTree();
        const found = findInTree<Node>(t, n => n.id === 'zzz');
        assert.strictEqual(found, undefined);
    });

    // --- removeFromTree ---

    test('removeFromTree removes top-level node', () => {
        const t = makeTree();
        const removed = removeFromTree<Node>(t, n => n.id === 'a');
        assert.strictEqual(removed?.id, 'a');
        assert.strictEqual(t.length, 2);
        assert.strictEqual(t[0].id, 'b');
    });

    test('removeFromTree removes nested node', () => {
        const t = makeTree();
        const removed = removeFromTree<Node>(t, n => n.id === 'b2a');
        assert.strictEqual(removed?.id, 'b2a');
        const b2 = findInTree<Node>(t, n => n.id === 'b2');
        assert.strictEqual(b2?.children?.length, 0);
    });

    test('removeFromTree returns undefined when not found', () => {
        const t = makeTree();
        const removed = removeFromTree<Node>(t, n => n.id === 'zzz');
        assert.strictEqual(removed, undefined);
        assert.strictEqual(t.length, 3);
    });

    test('removeFromTree only removes the first match', () => {
        const t: Node[] = [
            { id: 'x', label: 'first' },
            { id: 'x', label: 'second' }
        ];
        const removed = removeFromTree<Node>(t, n => n.id === 'x');
        assert.strictEqual(removed?.label, 'first');
        assert.strictEqual(t.length, 1);
        assert.strictEqual(t[0].label, 'second');
    });

    // --- insertIntoTree ---

    test('insertIntoTree appends to root when no parent', () => {
        const t = makeTree();
        const newNode: Node = { id: 'z', label: 'Z' };
        insertIntoTree<Node>(t, newNode);
        assert.strictEqual(t[t.length - 1].id, 'z');
    });

    test('insertIntoTree inserts at index in root', () => {
        const t = makeTree();
        insertIntoTree<Node>(t, { id: 'z', label: 'Z' }, undefined, 1);
        assert.strictEqual(t[1].id, 'z');
        assert.strictEqual(t[2].id, 'b');
    });

    test('insertIntoTree appends to parent children', () => {
        const t = makeTree();
        insertIntoTree<Node>(t, { id: 'b3', label: 'B3' }, n => n.id === 'b');
        const b = findInTree<Node>(t, n => n.id === 'b');
        assert.strictEqual(b?.children?.length, 3);
        assert.strictEqual(b?.children?.[2].id, 'b3');
    });

    test('insertIntoTree creates children array if missing', () => {
        const t: Node[] = [{ id: 'a', label: 'A' }];
        insertIntoTree<Node>(t, { id: 'a1', label: 'A1' }, n => n.id === 'a');
        assert.strictEqual(t[0].children?.length, 1);
        assert.strictEqual(t[0].children?.[0].id, 'a1');
    });

    test('insertIntoTree falls back to root when parent not found', () => {
        const t = makeTree();
        insertIntoTree<Node>(t, { id: 'z', label: 'Z' }, n => n.id === 'nonexistent');
        assert.strictEqual(t[t.length - 1].id, 'z');
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
