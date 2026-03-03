import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import { DatabaseConnection } from './types';

export class ConnectionChecker {
    /**
     * Tests that a connection can be established.
     */
    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        const options: Firebird.Options = {
            host: connection.host,
            port: connection.port,
            database: connection.database,
            user: connection.user,
            password: connection.password,
            role: connection.role,
            encoding: 'NONE',
            lowercase_keys: false
        } as any;

        return new Promise((resolve, reject) => {
            Firebird.attach(options, (err, db) => {
                if (err) return reject(err);
                try {
                    db.detach();
                } catch (e) { /* ignore */ }
                resolve();
            });
        });
    }
}
