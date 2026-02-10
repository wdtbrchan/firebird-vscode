
import * as assert from 'assert';
import * as mock from './vscodeMock';

// Mocking vscode before importing the components
// @ts-ignore
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path: string) {
    if (path === 'vscode') {
        return mock;
    }
    return originalRequire.apply(this, arguments);
};
// @ts-ignore
global.vscode = mock;

// Now import the classes we want to test
import { 
    FolderItem, 
    ObjectItem, 
    TriggerItem, 
    IndexItem, 
    DatabaseConnection,
    FavoritesRootItem
} from '../../explorer/databaseTreeDataProvider';

async function runTests() {
    console.log('Running TreeItem tests...');
    
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

    const mockConn: DatabaseConnection = {
        id: 'test-id',
        host: 'localhost',
        port: 3050,
        database: 'test.fdb',
        user: 'sysdba'
    };

    // --- Tests ---

    test('FolderItem: should correctly set properties', () => {
        const item = new FolderItem('Tables', 'tables', mockConn);
        assert.strictEqual(item.label, 'Tables');
        assert.strictEqual(item.contextValue, 'tables');
        assert.strictEqual(item.collapsibleState, mock.TreeItemCollapsibleState.Collapsed);
        assert.ok(item.iconPath instanceof mock.ThemeIcon);
        assert.strictEqual((item.iconPath as mock.ThemeIcon).id, 'table');
    });

    test('ObjectItem: should correctly set properties for table', () => {
        const item = new ObjectItem('USERS', 'table', mockConn);
        assert.strictEqual(item.label, 'USERS');
        assert.strictEqual(item.contextValue, 'table');
        assert.strictEqual(item.objectName, 'USERS');
        assert.strictEqual((item.iconPath as mock.ThemeIcon).id, 'table');
    });

    test('TriggerItem: should correctly set properties and description', () => {
        const item = new TriggerItem(mockConn, 'TEST_TRG', 10, true); // inactive
        assert.strictEqual(item.label, 'TEST_TRG');
        assert.strictEqual(item.contextValue, 'trigger-item');
        const desc = item.description as string;
        assert.ok(desc?.includes('(10)'));
        assert.ok(desc?.includes('INACTIVE'));
    });

    test('IndexItem: should correctly set properties and description', () => {
        const item = new IndexItem(mockConn, 'MY_TABLE', 'IDX_NAME', true, false); // unique, active
        assert.strictEqual(item.label, 'IDX_NAME');
        assert.strictEqual(item.description as string, 'UNIQUE');
    });

    test('FavoritesRootItem: should have correct icon and context', () => {
        const item = new FavoritesRootItem(mockConn);
        assert.strictEqual(item.label, 'Favorites');
        assert.strictEqual(item.contextValue, 'favorites-root');
        assert.strictEqual((item.iconPath as mock.ThemeIcon).id, 'star-full');
    });

    // --- End Tests ---

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
});
