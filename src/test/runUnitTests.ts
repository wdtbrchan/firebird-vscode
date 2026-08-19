import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const unitDirectory = path.join(__dirname, 'unit');
const testFiles = fs.readdirSync(unitDirectory)
    .filter(file => file.endsWith('.test.js'))
    .sort();

for (const testFile of testFiles) {
    const result = spawnSync(process.execPath, [path.join(unitDirectory, testFile)], {
        stdio: 'inherit'
    });
    if (result.error) {
        console.error(`Unable to start ${testFile}:`, result.error);
        process.exit(1);
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

console.log(`\nAll ${testFiles.length} unit test files passed.`);
