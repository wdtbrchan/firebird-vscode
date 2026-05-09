import * as Firebird from 'node-firebird';
import { DatabaseConnection } from './types';

/**
 * Builds node-firebird options from a DatabaseConnection.
 * Centralizes the mapping so callers can't drift on encoding / lowercase_keys.
 */
export function toFirebirdOptions(conn: DatabaseConnection): Firebird.Options {
    // Cast through `unknown` because node-firebird's typings don't include
    // every option we set (e.g. lowercase_keys, encoding string variants).
    return {
        host: conn.host,
        port: conn.port,
        database: conn.database,
        user: conn.user,
        password: conn.password,
        role: conn.role,
        encoding: 'NONE',
        lowercase_keys: false
    } as unknown as Firebird.Options;
}
