import { DatabaseConnection } from '../database/types';

/**
 * Subset of vscode.SecretStorage we actually use, kept as an interface so
 * the helpers stay unit-testable without spinning up the vscode runtime.
 */
export interface SecretStorageLike {
    get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
    store(key: string, value: string): Thenable<void> | Promise<void>;
    delete(key: string): Thenable<void> | Promise<void>;
}

const KEY_PREFIX = 'firebird.password:';

/**
 * Returns the secret-storage key used to persist a connection's password.
 */
export function passwordKey(connectionId: string): string {
    return `${KEY_PREFIX}${connectionId}`;
}

export async function getConnectionPassword(secrets: SecretStorageLike, connectionId: string): Promise<string | undefined> {
    return await secrets.get(passwordKey(connectionId));
}

export async function setConnectionPassword(secrets: SecretStorageLike, connectionId: string, password: string): Promise<void> {
    await secrets.store(passwordKey(connectionId), password);
}

export async function deleteConnectionPassword(secrets: SecretStorageLike, connectionId: string): Promise<void> {
    await secrets.delete(passwordKey(connectionId));
}

/**
 * Migrates plain-text passwords stored on connection objects (legacy
 * globalState) into SecretStorage. Mutates `connections` in place: clears
 * the `password` field on each migrated entry. Returns the number of
 * migrated entries.
 *
 * Idempotent: a second call with already-migrated connections is a no-op.
 */
export async function migratePasswordsToSecrets(secrets: SecretStorageLike, connections: DatabaseConnection[]): Promise<number> {
    let migrated = 0;
    for (const conn of connections) {
        if (typeof conn.password === 'string' && conn.password.length > 0) {
            await setConnectionPassword(secrets, conn.id, conn.password);
            conn.password = undefined;
            migrated++;
        }
    }
    return migrated;
}

/**
 * Reads passwords from SecretStorage and assigns them to in-memory
 * connection objects. Existing non-empty `password` values are preserved
 * (so callers can pre-load freshly entered passwords without overwriting
 * them with stale stored values).
 */
export async function hydratePasswordsFromSecrets(secrets: SecretStorageLike, connections: DatabaseConnection[]): Promise<void> {
    for (const conn of connections) {
        if (typeof conn.password === 'string' && conn.password.length > 0) continue;
        const stored = await getConnectionPassword(secrets, conn.id);
        if (stored !== undefined) {
            conn.password = stored;
        }
    }
}

/**
 * Returns a shallow copy of `connections` with each `password` field
 * stripped. Use before persisting to globalState so passwords never reach
 * non-secret storage.
 */
export function stripPasswords(connections: DatabaseConnection[]): DatabaseConnection[] {
    return connections.map(c => {
        const { password: _omit, ...rest } = c;
        return rest as DatabaseConnection;
    });
}
