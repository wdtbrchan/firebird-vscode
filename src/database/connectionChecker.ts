import * as Firebird from 'node-firebird';
import { DatabaseConnection } from './types';
import { toFirebirdOptions } from './connectionOptions';
import { FirebirdLog } from '../logger';

export class ConnectionChecker {
    /**
     * Tests that a connection can be established.
     */
    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        const options = toFirebirdOptions(connection);
        const label = `${connection.name || connection.database} | ${options.host}:${options.port || 3050} | ${options.database}`;
        FirebirdLog.info(`[FB] Connection check START | ${label}`);

        return new Promise((resolve, reject) => {
            Firebird.attach(options, (err, db) => {
                if (err) {
                    FirebirdLog.error(`[FB] Connection check FAILED | ${label} | message=${err.message}`);
                    return reject(err);
                }
                try {
                    db.detach();
                    FirebirdLog.info(`[FB] Connection check detached probe connection | ${label}`);
                } catch (_e) { /* ignore */ }
                FirebirdLog.info(`[FB] Connection check OK | ${label}`);
                resolve();
            });
        });
    }
}
