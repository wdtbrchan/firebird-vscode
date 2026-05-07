import * as assert from 'assert';
import { MetadataQueries } from '../../services/metadataQueries';

async function runTests() {
    console.log('Running MetadataQueries tests...');

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

    /**
     * Counts apostrophes outside of string literals as a crude proxy for
     * "is this query parseable". A well-escaped query has only paired or
     * doubled apostrophes – we just assert nothing leaks raw.
     */
    function literalSegments(sql: string): string[] {
        const result: string[] = [];
        let i = 0;
        let inString = false;
        let buffer = '';
        while (i < sql.length) {
            const c = sql[i];
            if (c === "'") {
                if (inString && sql[i + 1] === "'") {
                    buffer += "''";
                    i += 2;
                    continue;
                }
                if (inString) {
                    result.push(buffer);
                    buffer = '';
                    inString = false;
                } else {
                    inString = true;
                }
                i++;
                continue;
            }
            if (inString) buffer += c;
            i++;
        }
        if (inString) {
            throw new Error(`Unbalanced apostrophe in query: ${sql}`);
        }
        return result;
    }

    // --- Apostrophe-in-name should not break queries ---

    test('getViewSource: apostrophe in name is escaped', () => {
        const q = MetadataQueries.getViewSource("MY'VIEW");
        const literals = literalSegments(q);
        assert.deepStrictEqual(literals, ["MY''VIEW"]);
    });

    test('getTriggerSource: apostrophe in name is escaped', () => {
        const q = MetadataQueries.getTriggerSource("X'Y");
        assert.deepStrictEqual(literalSegments(q), ["X''Y"]);
    });

    test('getProcedureSource: apostrophe in name is escaped', () => {
        const q = MetadataQueries.getProcedureSource("P'");
        assert.deepStrictEqual(literalSegments(q), ["P''"]);
    });

    test('getTriggers with table filter escapes apostrophe', () => {
        const q = MetadataQueries.getTriggers("T'");
        assert.deepStrictEqual(literalSegments(q), ["T''"]);
    });

    test('getProcedureParameters: escapes name and inlines numeric type', () => {
        const q = MetadataQueries.getProcedureParameters("P'", 0);
        assert.deepStrictEqual(literalSegments(q), ["P''"]);
        assert.ok(q.includes('RDB$PARAMETER_TYPE = 0'));
    });

    test('getTableFields / getTableColumnsDetailed: escapes apostrophe', () => {
        const q1 = MetadataQueries.getTableFields("T'");
        const q2 = MetadataQueries.getTableColumnsDetailed("T'");
        assert.deepStrictEqual(literalSegments(q1), ["T''"]);
        assert.deepStrictEqual(literalSegments(q2), ["T''"]);
    });

    test('getPrimaryKeyColumns: escapes apostrophe; literal "PRIMARY KEY" still present', () => {
        const q = MetadataQueries.getPrimaryKeyColumns("T'");
        const literals = literalSegments(q);
        assert.ok(literals.includes("T''"));
        assert.ok(literals.includes('PRIMARY KEY'));
    });

    test('getForeignKeyColumns: escapes apostrophe; literal "FOREIGN KEY" still present', () => {
        const q = MetadataQueries.getForeignKeyColumns("T'");
        const literals = literalSegments(q);
        assert.ok(literals.includes("T''"));
        assert.ok(literals.includes('FOREIGN KEY'));
    });

    test('getIndexes: escapes apostrophe', () => {
        const q = MetadataQueries.getIndexes("T'");
        assert.deepStrictEqual(literalSegments(q), ["T''"]);
    });

    test('getIndexInfo / getIndexSegments: escape apostrophe', () => {
        const q1 = MetadataQueries.getIndexInfo("I'");
        const q2 = MetadataQueries.getIndexSegments("I'");
        assert.deepStrictEqual(literalSegments(q1), ["I''"]);
        assert.deepStrictEqual(literalSegments(q2), ["I''"]);
    });

    test('getTableDependencies: escapes apostrophe', () => {
        const q = MetadataQueries.getTableDependencies("T'");
        assert.deepStrictEqual(literalSegments(q), ["T''"]);
    });

    test('getObjectPermissions: escapes apostrophe and inlines numeric type', () => {
        const q = MetadataQueries.getObjectPermissions("T'", 0);
        assert.deepStrictEqual(literalSegments(q), ["T''"]);
        assert.ok(q.includes('RDB$OBJECT_TYPE = 0'));
    });

    test('getGeneratorValue: name is double-quoted (identifier, not literal)', () => {
        const q = MetadataQueries.getGeneratorValue('MY_GEN');
        assert.ok(q.includes('GEN_ID("MY_GEN", 0)'), `got: ${q}`);
    });

    test('getGeneratorValue: name with embedded double quote is escaped', () => {
        const q = MetadataQueries.getGeneratorValue('GEN"WEIRD');
        assert.ok(q.includes('GEN_ID("GEN""WEIRD", 0)'), `got: ${q}`);
    });

    test('Static queries (no name) are returned as-is', () => {
        assert.ok(MetadataQueries.getTables.includes('FROM RDB$RELATIONS'));
        assert.ok(MetadataQueries.getProcedures.includes('FROM RDB$PROCEDURES'));
        assert.ok(MetadataQueries.getGenerators.includes('FROM RDB$GENERATORS'));
        // Triggers without a table filter shouldn't include the AND clause.
        assert.ok(!MetadataQueries.getTriggers().includes('AND RDB$RELATION_NAME ='));
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
