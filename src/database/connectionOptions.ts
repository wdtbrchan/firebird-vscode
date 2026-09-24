import * as Firebird from 'node-firebird';
import { DatabaseConnection } from './types';

export const DRIVER_TEXT_ENCODING = 'UTF8';

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
        // node-firebird decodes text columns as UTF-8. Firebird converts
        // declared legacy charsets (such as WIN1250) to this client charset.
        // Preserve explicit NONE for databases that intentionally use it.
        encoding: conn.charset?.toUpperCase() === 'NONE' ? 'NONE' : DRIVER_TEXT_ENCODING,
        lowercase_keys: false
    } as unknown as Firebird.Options;
}
