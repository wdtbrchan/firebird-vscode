import * as assert from 'assert';
import * as Module from 'module';
import * as mock from './vscodeMock';

const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (path: string, ...args: any[]) {
    if (path === 'vscode') return mock;
    return originalRequire.apply(this, [path, ...args]);
};

import { formatUdfDeclaration } from '../../services/metadata/udfService';

const ddl = formatUdfDeclaration('MY"UDF', {
    RDB$MODULE_NAME: "my'lib",
    RDB$ENTRYPOINT: "entry'point",
    RDB$RETURN_ARGUMENT: 0
}, [
    { RDB$ARGUMENT_POSITION: 0, RDB$MECHANISM: -1, RDB$FIELD_TYPE: 40, RDB$FIELD_LENGTH: 80 },
    { RDB$ARGUMENT_POSITION: 1, RDB$MECHANISM: 1, RDB$FIELD_TYPE: 8 },
    { RDB$ARGUMENT_POSITION: 2, RDB$MECHANISM: 2, RDB$FIELD_TYPE: 37, RDB$CHARACTER_LENGTH: 20 }
]);

assert.strictEqual(ddl, `DECLARE EXTERNAL FUNCTION "MY""UDF"
    INTEGER,
    VARCHAR(20) BY DESCRIPTOR
RETURNS CSTRING(80) FREE_IT
ENTRY_POINT 'entry''point' MODULE_NAME 'my''lib';`);

const parameterReturn = formatUdfDeclaration('BLOB_UDF', {
    RDB$MODULE_NAME: 'udf',
    RDB$ENTRYPOINT: 'blob_func',
    RDB$RETURN_ARGUMENT: 1
}, [
    { RDB$ARGUMENT_POSITION: 1, RDB$MECHANISM: 3, RDB$FIELD_TYPE: 261 }
]);
assert.ok(parameterReturn.includes('RETURNS PARAMETER 1'));

console.log('UDF declaration tests passed.');
