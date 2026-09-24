import * as assert from 'assert';
import * as iconv from 'iconv-lite';
import { processResultRows } from '../../database/encodingUtils';

async function runTests() {
    console.log('Running encoding utils tests...');

    const name = 'Brodský Tomáš';

    // node-firebird has already decoded ordinary text columns to a JS string.
    const rows = await processResultRows([[name]], 'WIN1250', ['NAME']);
    assert.strictEqual(rows[0].NAME, name);

    // Raw buffers still need decoding according to their byte encoding.
    const bufferRows = await processResultRows([[iconv.encode(name, 'WIN1250')]], 'WIN1250', ['NAME']);
    assert.strictEqual(bufferRows[0].NAME, name);

    const utf8Rows = await processResultRows([[Buffer.from(name, 'utf8')]], 'UTF8', ['NAME']);
    assert.strictEqual(utf8Rows[0].NAME, name);

    console.log('Encoding utils tests passed.');
}

void runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
