import * as Firebird from 'node-firebird';
import * as vscode from 'vscode';
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
            let settled = false;
            const configuredSeconds = vscode.workspace.getConfiguration('firebird').get<number>('connectionTimeout', 15);
            const timeoutMs = typeof configuredSeconds === 'number' && Number.isFinite(configuredSeconds) && configuredSeconds > 0
                ? configuredSeconds * 1000
                : 0;
            const timer = timeoutMs > 0
                ? setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    const timeoutError = new Error(`Connection attempt timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
                    FirebirdLog.error(`[FB] Connection check FAILED | ${label} | message=${timeoutError.message}`);
                    reject(timeoutError);
                }, timeoutMs)
                : undefined;

            const finish = (err?: Error) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                if (err) {
                    FirebirdLog.error(`[FB] Connection check FAILED | ${label} | message=${err.message}`);
                    reject(err);
                } else {
                    FirebirdLog.info(`[FB] Connection check OK | ${label}`);
                    resolve();
                }
            };

            try {
                Firebird.attach(options, (err, db) => {
                    if (settled) {
                        if (db) {
                            try { db.detach(); } catch (_e) { /* ignore late cleanup errors */ }
                        }
                        return;
                    }
                    if (err) return finish(err);
                    try {
                        db.detach();
                        FirebirdLog.info(`[FB] Connection check detached probe connection | ${label}`);
                    } catch (detachErr) {
                        return finish(detachErr instanceof Error ? detachErr : new Error(String(detachErr)));
                    }
                    finish();
                });
            } catch (attachErr) {
                finish(attachErr instanceof Error ? attachErr : new Error(String(attachErr)));
            }
        });
    }
}
