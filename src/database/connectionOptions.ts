import * as Firebird from 'node-firebird';
import { DatabaseConnection } from './types';

/**
 * Builds node-firebird options from a DatabaseConnection.
 * Centralizes the mapping so callers can't drift on encoding / lowercase_keys.
 */
export function toFirebirdOptions(conn: DatabaseConnection): Firebird.Options {
    return {
        host: conn.host,
        port: conn.port,
        database: conn.database,
        user: conn.user,
        password: conn.password,
        role: conn.role,
        encoding: 'NONE',
        lowercase_keys: false
    } as any;
}
