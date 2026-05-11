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
            status: 'ACTIVE',
            columns: ['NAME']
        });
        assert.ok(html.includes('<title>IDX_USERS_NAME</title>'));
        assert.ok(html.includes('<h1>INDEX: IDX_USERS_NAME</h1>'));
    });

    test('Status ACTIVE renders the active tag', () => {
        const html = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE', columns: ['C']
        });
        assert.ok(html.includes('<span class="tag tag-active">Active</span>'), 'Expected active span');
        assert.ok(!html.includes('<span class="tag tag-inactive">'), 'Inactive span should not appear when status is ACTIVE');
    });

    test('Status INACTIVE renders the inactive tag', () => {
        const html = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'INACTIVE', columns: ['C']
        });
        assert.ok(html.includes('<span class="tag tag-inactive">Inactive</span>'), 'Expected inactive span');
        assert.ok(!html.includes('<span class="tag tag-active">'), 'Active span should not appear when status is INACTIVE');
    });

    test('Unique flag renders UNIQUE / NON-UNIQUE', () => {
        const uniqueHtml = renderIndexInfoHtml('IDX_U', {
            relation: 'T', unique: true, descending: false, definition: 'C', status: 'ACTIVE', columns: ['C']
        });
        assert.ok(uniqueHtml.includes('>UNIQUE<'));

        const nonUniqueHtml = renderIndexInfoHtml('IDX_N', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE', columns: ['C']
        });
        assert.ok(nonUniqueHtml.includes('>NON-UNIQUE<'));
    });

    test('Descending flag renders DESCENDING / ASCENDING', () => {
        const descHtml = renderIndexInfoHtml('IDX_D', {
            relation: 'T', unique: false, descending: true, definition: 'C', status: 'ACTIVE', columns: ['C']
        });
        assert.ok(descHtml.includes('>DESCENDING<'));

        const ascHtml = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE', columns: ['C']
        });
        assert.ok(ascHtml.includes('>ASCENDING<'));
    });

    test('Statistics undefined renders N/A', () => {
        const html = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE', columns: ['C']
        });
        assert.ok(html.includes('>N/A<'));
    });

    test('Statistics number is rendered', () => {
        const html = renderIndexInfoHtml('IDX_A', {
            relation: 'T', unique: false, descending: false, definition: 'C', status: 'ACTIVE', statistics: 0.0123, columns: ['C']
        });
        assert.ok(html.includes('>0.0123<'));
    });

    test('Columns are rendered as a styled table with ordinal positions', () => {
        const html = renderIndexInfoHtml('IDX_MULTI', {
            relation: 'T',
            unique: false,
            descending: false,
            definition: 'A, B, C',
            status: 'ACTIVE',
            columns: ['A', 'B', 'C']
        });
        assert.ok(html.includes('<table class="columns">'), 'Expected columns table');
        assert.ok(html.includes('<h2>Columns'), 'Expected Columns heading');
        assert.ok(html.includes('>#1<'), 'Expected ordinal #1');
        assert.ok(html.includes('>#2<'), 'Expected ordinal #2');
        assert.ok(html.includes('>#3<'), 'Expected ordinal #3');
        assert.ok(html.includes('>A<') && html.includes('>B<') && html.includes('>C<'), 'Expected all column names');
        assert.ok(html.includes('(3)'), 'Expected column count badge');
    });

    test('Computed expression renders dedicated section with COMPUTED BY label', () => {
        const html = renderIndexInfoHtml('IDX_COMP', {
            relation: 'T',
            unique: false,
            descending: false,
            definition: 'COMPUTED BY (UPPER(NAME))',
            status: 'ACTIVE',
            columns: [],
            expression: 'UPPER(NAME)'
        });
        assert.ok(html.includes('<h2>Computed expression</h2>'));
        assert.ok(html.includes('class="computed-label">COMPUTED BY<'));
        assert.ok(html.includes('UPPER(NAME)'));
        assert.ok(!html.includes('<h2>Columns'), 'Should not render Columns heading for computed index');
    });

    test('HTML escapes special characters in index name and expression', () => {
        const html = renderIndexInfoHtml('IDX<X>', {
            relation: 'T',
            unique: false,
            descending: false,
            definition: 'X',
            status: 'ACTIVE',
            columns: [],
            expression: 'A < B'
        });
        assert.ok(html.includes('IDX&lt;X&gt;'), 'Expected escaped index name');
        assert.ok(html.includes('A &lt; B'), 'Expected escaped expression');
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
