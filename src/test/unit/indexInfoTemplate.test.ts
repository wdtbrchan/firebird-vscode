import * as assert from 'assert';
import { renderIndexInfoHtml } from '../../editors/indexInfoTemplate';

async function runTests() {
    console.log('Running IndexInfoTemplate tests...');

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

    test('Renders index name in title and heading', () => {
        const html = renderIndexInfoHtml('IDX_USERS_NAME', {
            relation: 'USERS',
            unique: false,
            descending: false,
            definition: 'NAME',
            status: 'ACTIVE'
        });
        assert.ok(html.includes('<title>IDX_USERS_NAME</title>'));
        assert.ok(html.includes('<h1>INDEX: IDX_USERS_NAME</h1>'));
    });

    test('Status ACTIVE renders the active tag', () => {
        const html = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE'
        });
        assert.ok(html.includes('<span class="tag tag-active">Active</span>'), 'Expected active span');
        assert.ok(!html.includes('<span class="tag tag-inactive">'), 'Inactive span should not appear when status is ACTIVE');
    });

    test('Status INACTIVE renders the inactive tag', () => {
        const html = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'INACTIVE'
        });
        assert.ok(html.includes('<span class="tag tag-inactive">Inactive</span>'), 'Expected inactive span');
        assert.ok(!html.includes('<span class="tag tag-active">'), 'Active span should not appear when status is INACTIVE');
    });

    test('Unique flag renders UNIQUE / NON-UNIQUE', () => {
        const uniqueHtml = renderIndexInfoHtml('IDX_U', {
            relation: 'T', unique: true, descending: false, definition: 'C', status: 'ACTIVE'
        });
        assert.ok(uniqueHtml.includes('>UNIQUE<'));

        const nonUniqueHtml = renderIndexInfoHtml('IDX_N', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE'
        });
        assert.ok(nonUniqueHtml.includes('>NON-UNIQUE<'));
    });

    test('Descending flag renders DESCENDING / ASCENDING', () => {
        const descHtml = renderIndexInfoHtml('IDX_D', {
            relation: 'T', unique: false, descending: true, definition: 'C', status: 'ACTIVE'
        });
        assert.ok(descHtml.includes('>DESCENDING<'));

        const ascHtml = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE'
        });
        assert.ok(ascHtml.includes('>ASCENDING<'));
    });

    test('Statistics undefined renders N/A', () => {
        const html = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE'
        });
        assert.ok(html.includes('>N/A<'));
    });

    test('Statistics number is rendered', () => {
        const html = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE', statistics: 0.0123
        });
        assert.ok(html.includes('>0.0123<'));
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
