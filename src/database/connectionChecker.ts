import * as Firebird from 'node-firebird';
import { DatabaseConnection } from './types';
import { toFirebirdOptions } from './connectionOptions';

export class ConnectionChecker {
    /**
     * Tests that a connection can be established.
     */
    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        const options = toFirebirdOptions(connection);

        return new Promise((resolve, reject) => {
            Firebird.attach(options, (err, db) => {
                if (err) return reject(err);
                try {
                    db.detach();
                } catch (_e) { /* ignore */ }
                resolve();
            });
        });
    }
}
