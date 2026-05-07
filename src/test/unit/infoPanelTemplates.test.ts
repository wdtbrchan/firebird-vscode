import * as assert from 'assert';
import { renderInfoLoadingHtml, renderInfoErrorHtml } from '../../editors/infoPanelTemplates';

async function runTests() {
    console.log('Running infoPanelTemplates tests...');

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

    test('loadingHtml: title in <title> and heading', () => {
        const html = renderInfoLoadingHtml('USERS');
        assert.ok(html.includes('<title>USERS</title>'));
        assert.ok(html.includes('Loading USERS'));
    });

    test('loadingHtml: includes a spinner', () => {
        const html = renderInfoLoadingHtml('X');
        assert.ok(html.includes('class="spinner"'), 'expected a .spinner element');
    });

    test('loadingHtml: dataType prefix when provided', () => {
        const html = renderInfoLoadingHtml('FOO', 'TRIGGER');
        assert.ok(html.includes('Loading TRIGGER FOO'));
    });

    test('errorHtml: stringifies the error and shows the title', () => {
        const html = renderInfoErrorHtml('USERS', new Error('boom'));
        assert.ok(html.includes('<title>USERS</title>'));
        assert.ok(html.includes('Error loading info for USERS'));
        assert.ok(html.includes('boom'), 'expected error message to appear');
    });

    test('errorHtml: handles non-Error values', () => {
        const html = renderInfoErrorHtml('X', 'plain string');
        assert.ok(html.includes('plain string'));
    });

    test('errorHtml: contains <p class="error"> wrapper', () => {
        const html = renderInfoErrorHtml('X', 'msg');
        assert.ok(html.includes('class="error"'));
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
