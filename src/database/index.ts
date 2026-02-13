/**
 * Re-exports for backward compatibility.
 * All consumers can import from '../database' (or '../database/index').
 */

export { Database } from './database';
export { TransactionManager } from './transactionManager';
export { QueryExecutor } from './queryExecutor';
export { processResultRows, prepareQueryBuffer } from './encodingUtils';
export { QueryOptions, QueryResult } from './types';
