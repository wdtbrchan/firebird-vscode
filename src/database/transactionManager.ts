import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import { FirebirdLog } from '../logger';

type StateChangeHandler = (hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void;

/**
 * Manages database transactions, auto-rollback timer, and connection lifecycle.
 * All members are static – singleton pattern matching the original Database class.
 */
export class TransactionManager {
    public static instances: Map<string, TransactionManager> = new Map();
    private static globalStateChangeHandlers: ((id: string, hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void)[] = [];

    public static onGlobalTransactionChange(handler: (id: string, hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void) {
        this.globalStateChangeHandlers.push(handler);
    }

    public static getInstance(id: string): TransactionManager {
        if (!this.instances.has(id)) {
            this.instances.set(id, new TransactionManager(id));
        }
        return this.instances.get(id)!;
    }

    public static cleanupAll() {
        FirebirdLog.info(`[FB] Cleaning up all transaction managers | count=${this.instances.size}`);
        this.instances.forEach(instance => instance.cleanupConnection());
        this.instances.clear();
    }

    public db: Firebird.Database | undefined;
    public transaction: Firebird.Transaction | undefined;
    public autoRollbackTimer: NodeJS.Timeout | undefined;
    public autoRollbackDeadline: number | undefined;
    public currentOptions: Firebird.Options | undefined;
    public activeStatement: unknown;
    public activeQuery: string | undefined;
    public activeConnectionInfo: string | undefined;
    public currentReject: ((err: Error) => void) | undefined;

    private onStateChangeHandlers: StateChangeHandler[] = [];
    
    private constructor(private id: string) {}

    public onTransactionChange(handler: StateChangeHandler) {
        this.onStateChangeHandlers.push(handler);
    }

    public notifyStateChange(lastAction?: string) {
        const isActive = this.hasActiveTransaction;
        this.onStateChangeHandlers.forEach(h => h(isActive, this.autoRollbackDeadline, lastAction));
        TransactionManager.globalStateChangeHandlers.forEach(h => h(this.id, isActive, this.autoRollbackDeadline, lastAction));
    }

    public async commit(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.transaction) {
                FirebirdLog.info(`[FB] Transaction commit calling | id=${this.id}`);
                this.transaction.commit((err) => {
                    this.transaction = undefined;
                    this.notifyStateChange('Committed'); 
                    this.cleanupConnection();
                    if (err) {
                        FirebirdLog.error(`[FB] Transaction commit failed | id=${this.id} | message=${err.message}`);
                        reject(err);
                    } else {
                        FirebirdLog.info(`[FB] Transaction commit OK | id=${this.id}`);
                        resolve();
                    }
                });
            } else {
                FirebirdLog.info(`[FB] Transaction commit skipped; no active transaction | id=${this.id}`);
                resolve();
            }
        });
    }

    public async rollback(reason: string = 'Rolled back'): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.transaction) {
                FirebirdLog.info(`[FB] Transaction rollback calling | id=${this.id} | reason=${reason}`);
                this.transaction.rollback((err) => {
                    this.transaction = undefined;
                    this.notifyStateChange(reason); 
                    this.cleanupConnection();
                    if (err) {
                        FirebirdLog.error(`[FB] Transaction rollback failed | id=${this.id} | message=${err.message}`);
                        reject(err);
                    } else {
                        FirebirdLog.info(`[FB] Transaction rollback OK | id=${this.id} | reason=${reason}`);
                        resolve();
                    }
                });
            } else {
                FirebirdLog.info(`[FB] Transaction rollback skipped; no active transaction | id=${this.id} | reason=${reason}`);
                this.cleanupConnection(); 
                resolve();
            }
        });
    }

    public cleanupConnection() {
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
            this.autoRollbackTimer = undefined;
        }
        if (this.activeStatement) {
            try { (this.activeStatement as { close(): void }).close(); } catch { /* ignore */ }
            this.activeStatement = undefined;
            FirebirdLog.info(`[FB] Active statement closed | id=${this.id}`);
        }
        this.activeQuery = undefined;
        this.activeConnectionInfo = undefined;
        if (this.db) {
            try {
                this.db.detach();
                FirebirdLog.info(`[FB] Database connection detached | id=${this.id}`);
            } catch { /* ignore */ }
            this.db = undefined;
            this.currentOptions = undefined;
        }
        this.autoRollbackDeadline = undefined;
    }

    public cancelConnection() {
        FirebirdLog.info(`[FB] Query cancel requested | id=${this.id}`, true);
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
            this.autoRollbackTimer = undefined;
        }
        this.autoRollbackDeadline = undefined;
        
        // This will kill the running query immediately and break the connection
        if (this.db) {
            try {
                this.db.detach();
                FirebirdLog.info(`[FB] Database connection detached by cancel | id=${this.id}`);
            } catch { /* ignore */ }
            this.db = undefined;
        }
        this.transaction = undefined;
        this.currentOptions = undefined;
        this.activeStatement = undefined;
        
        if (this.currentReject) {
            this.currentReject(new Error('Cancelled by user'));
            this.currentReject = undefined;
        }

        this.notifyStateChange('Cancelled');
    }

    public killConnection() {
        FirebirdLog.info(`[FB] Query kill requested | id=${this.id}`, true);
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
            this.autoRollbackTimer = undefined;
        }
        this.autoRollbackDeadline = undefined;

        if (this.db) {
            try {
                // Forcefully destroy the socket connection if available in node-firebird.
                // node-firebird does not export typings for these internals.
                interface InternalSocket { destroy?(): void }
                interface InternalDbConnection { _socket?: InternalSocket; destroy?(): void }
                interface InternalDb { connection?: InternalDbConnection; destroy?(): void }
                const dbInternal = this.db as unknown as InternalDb;
                const conn = dbInternal.connection;
                if (conn?._socket?.destroy) {
                    conn._socket.destroy();
                } else if (conn?.destroy) {
                    conn.destroy();
                } else if (dbInternal.destroy) {
                    dbInternal.destroy();
                } else {
                    this.db.detach();
                }
                FirebirdLog.info(`[FB] Database connection killed/detached | id=${this.id}`);
            } catch (e) {
                FirebirdLog.error(`[FB] Error forcefully killing connection | id=${this.id}`, e, true);
            }
            this.db = undefined;
        }
        this.transaction = undefined;
        this.currentOptions = undefined;
        this.activeStatement = undefined;

        if (this.currentReject) {
            this.currentReject(new Error('Killed by user'));
            this.currentReject = undefined;
        }

        this.notifyStateChange('Killed');
    }

    public resetAutoRollback() {
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
        }
        
        const config = vscode.workspace.getConfiguration('firebird');
        let timeoutSeconds = config.get<number>('autoRollbackTimeout', 60);
        if (!timeoutSeconds || typeof timeoutSeconds !== 'number' || isNaN(timeoutSeconds)) {
             timeoutSeconds = 60;
        }

        if (timeoutSeconds <= 0) {
            this.autoRollbackDeadline = undefined;
            if (this.transaction) {
                 this.notifyStateChange();
            }
            return;
        }

        this.autoRollbackDeadline = Date.now() + (timeoutSeconds * 1000);

        this.autoRollbackTimer = setTimeout(() => {
            FirebirdLog.info(`[FB] Auto rollback timeout reached | id=${this.id}`);
            vscode.window.showInformationMessage('Firebird transaction auto-rolled back due to inactivity.');
            this.rollback('Auto-rolled back');
        }, timeoutSeconds * 1000);

        if (this.transaction) {
            this.notifyStateChange();
        }
    }

    public get hasActiveTransaction(): boolean {
        return !!this.transaction;
    }
}
