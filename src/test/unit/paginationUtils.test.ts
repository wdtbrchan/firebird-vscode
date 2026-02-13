
import * as assert from 'assert';
import { applyPagination } from '../../database/paginationUtils';
import { QueryOptions } from '../../database/types';

// Simple test runner
async function runTests() {
    console.log('Running QueryExecutor tests...');
    
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
            console.error(`Expected: ${err.expected}`);
            console.error(`Actual:   ${err.actual}`);
            failed++;
        }
    }

    // --- Tests ---

    test('Pagination: Apply default limit/offset', () => {
        const query = 'SELECT * FROM table';
        const options: QueryOptions = { limit: 50, offset: 0 };
        const result = applyPagination(query, options);
        assert.strictEqual(result, 'SELECT FIRST 50 SKIP 0 * FROM table');
    });

    test('Pagination: Preserve existing FIRST/SKIP', () => {
        const query = 'SELECT FIRST 10 SKIP 5 * FROM table';
        const options: QueryOptions = { limit: 50, offset: 0 };
        const result = applyPagination(query, options);
        assert.strictEqual(result, 'SELECT FIRST 10 SKIP 5 * FROM table');
    });

    test('Pagination: Preserve existing FIRST', () => {
        const query = 'SELECT FIRST 10 * FROM table';
        const options: QueryOptions = { limit: 50, offset: 0 };
        const result = applyPagination(query, options);
        assert.strictEqual(result, 'SELECT FIRST 10 * FROM table');
    });

    test('Pagination: Respect ROWS clause (BUG REPRODUCTION)', () => {
        const query = 'SELECT * FROM table ROWS 10';
        const options: QueryOptions = { limit: 50, offset: 0 };
        const result = applyPagination(query, options);
        // This is expected to fail currently because the bug injects FIRST/SKIP
        // We want it to be unchanged: 'SELECT * FROM table ROWS 10'
        // But current logic will likely make it: 'SELECT FIRST 50 SKIP 0 * FROM table ROWS 10'
        assert.strictEqual(result, 'SELECT * FROM table ROWS 10');
    });

    test('Pagination: Respect ROWS TO clause', () => {
        const query = 'SELECT * FROM table ROWS 1 TO 10';
        const options: QueryOptions = { limit: 50, offset: 0 };
        const result = applyPagination(query, options);
        assert.strictEqual(result, 'SELECT * FROM table ROWS 1 TO 10');
    });

    test('Pagination: Respect ROWS clause with formatting', () => {
        const query = `
            SELECT * 
            FROM table 
            ROWS 10
        `;
        const options: QueryOptions = { limit: 50, offset: 0 };
        const result = applyPagination(query, options);
        // Should be trimmed but logically unchanged regarding pagination
        // Current implementation trims and replaces ; at end, so we expect trimmed input
        const expected = query.trim();
        assert.strictEqual(result, expected);
    });

    // --- End Tests ---

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    // Don't exit process with error yet, to allow the run_command to succeed and show output
    // if (failed > 0) process.exit(1);
}

runTests();
