import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';
import { FirebirdLog } from '../logger';

type StateChangeHandler = (hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void;

interface PendingOperation {
    id: number;
    reject: (err: Error) => void;
}

type TransactionAction = 'commit' | 'rollback';

/**
 * Manages a single editor's database connection, transaction, and in-flight
 * operation. Only one driver operation or transaction action may run at once.
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
        this.instances.forEach(instance => instance.dispose());
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

    private onStateChangeHandlers: StateChangeHandler[] = [];
    private operationSequence = 0;
    private pendingOperation: PendingOperation | undefined;
    private transactionAction: TransactionAction | undefined;

    private constructor(private id: string) {}

    public onTransactionChange(handler: StateChangeHandler) {
        this.onStateChangeHandlers.push(handler);
    }

    public notifyStateChange(lastAction?: string) {
        const isActive = this.hasActiveTransaction;
        this.onStateChangeHandlers.forEach(handler => {
            try {
                handler(isActive, this.autoRollbackDeadline, lastAction);
            } catch (err) {
                FirebirdLog.error(`[FB] Transaction state listener failed | id=${this.id}`, err);
            }
        });
        TransactionManager.globalStateChangeHandlers.forEach(handler => {
            try {
                handler(this.id, isActive, this.autoRollbackDeadline, lastAction);
            } catch (err) {
                FirebirdLog.error(`[FB] Global transaction state listener failed | id=${this.id}`, err);
            }
        });
    }

    /** Acquire the per-editor driver-operation slot synchronously. */
    public beginOperation(reject: (err: Error) => void): number {
        if (this.pendingOperation) {
            throw new Error('Another Firebird operation is already running for this editor.');
        }
        if (this.transactionAction) {
            throw new Error(`Cannot start a query while transaction ${this.transactionAction} is in progress.`);
        }

        const operationId = ++this.operationSequence;
        this.pendingOperation = { id: operationId, reject };
        return operationId;
    }

    public isOperationActive(operationId: number): boolean {
        return this.pendingOperation?.id === operationId;
    }

    public completeOperation(operationId: number): void {
        if (this.pendingOperation?.id === operationId) {
            this.pendingOperation = undefined;
        }
    }

    /**
     * Abort exactly one operation. Clearing the slot before rejecting makes
     * late driver callbacks stale and prevents them from reviving the session.
     */
    public abortOperation(operationId: number, error: Error, lastAction: string = 'Failed', force: boolean = true): boolean {
        if (this.pendingOperation?.id !== operationId) return false;

        const pending = this.pendingOperation;
        this.pendingOperation = undefined;
        this.cleanupConnection(force);
        pending.reject(error);
        this.notifyStateChange(lastAction);
        return true;
    }

    public handleConnectionError(db: Firebird.Database, error: Error): void {
        // An error from a connection that has already been replaced must not
        // reject a newer operation.
        if (this.db !== db) return;

        const pending = this.pendingOperation;
        this.pendingOperation = undefined;
        this.cleanupConnection(true);
        pending?.reject(error);
        this.notifyStateChange('Connection lost');
    }

    public async commit(): Promise<void> {
        return this.runTransactionAction('commit', 'Committed');
    }

    public async rollback(reason: string = 'Rolled back'): Promise<void> {
        return this.runTransactionAction('rollback', reason);
    }

    private async runTransactionAction(action: TransactionAction, successAction: string): Promise<void> {
        if (this.pendingOperation) {
            throw new Error(`Cannot ${action} while a database operation is still running.`);
        }
        if (this.transactionAction) {
            throw new Error(`Transaction ${this.transactionAction} is already in progress.`);
        }

        const transaction = this.transaction;
        if (!transaction) {
            FirebirdLog.info(`[FB] Transaction ${action} skipped; no active transaction | id=${this.id}`);
            this.cleanupConnection();
            return;
        }

        this.transactionAction = action;
        this.pauseAutoRollback();
        FirebirdLog.info(`[FB] Transaction ${action} calling | id=${this.id}`);

        return new Promise((resolve, reject) => {
            let settled = false;
            const timeoutMs = this.getTimeoutMs('transactionTimeout', 30_000);
            let timeout: NodeJS.Timeout | undefined;

            const finish = (err?: Error | null, force: boolean = false) => {
                if (settled) return;
                settled = true;
                if (timeout) clearTimeout(timeout);
                this.transactionAction = undefined;
                this.cleanupConnection(force || !!err);
                this.notifyStateChange(err ? `${action} failed` : successAction);

                if (err) {
                    FirebirdLog.error(`[FB] Transaction ${action} failed | id=${this.id} | message=${err.message}`);
                    reject(err);
                } else {
                    FirebirdLog.info(`[FB] Transaction ${action} OK | id=${this.id}`);
                    resolve();
                }
            };

            if (timeoutMs > 0) {
                timeout = setTimeout(() => {
                    finish(new Error(`Transaction ${action} timed out after ${Math.round(timeoutMs / 1000)} seconds.`), true);
                }, timeoutMs);
            }

            try {
                if (action === 'commit') {
                    transaction.commit(err => finish(err));
                } else {
                    transaction.rollback(err => finish(err));
                }
            } catch (err) {
                finish(this.asError(err), true);
            }
        });
    }

    public cleanupConnection(force: boolean = false) {
        this.pauseAutoRollback();
        this.closeActiveStatement();
        this.activeQuery = undefined;
        this.activeConnectionInfo = undefined;
        this.transaction = undefined;

        if (this.db) {
            const db = this.db;
            this.db = undefined;
            try {
                if (force) this.destroyDatabase(db);
                else db.detach();
                FirebirdLog.info(`[FB] Database connection ${force ? 'destroyed' : 'detached'} | id=${this.id}`);
            } catch (err) {
                FirebirdLog.error(`[FB] Database connection cleanup failed | id=${this.id}`, err);
            }
        }
        this.currentOptions = undefined;
    }

    public cancelConnection() {
        this.abortCurrentConnection(new Error('Cancelled by user'), 'Cancelled', false);
    }

    public killConnection() {
        this.abortCurrentConnection(new Error('Killed by user'), 'Killed', true);
    }

    private abortCurrentConnection(error: Error, lastAction: string, force: boolean): void {
        FirebirdLog.info(`[FB] Query ${lastAction.toLowerCase()} requested | id=${this.id}`, true);
        const pending = this.pendingOperation;
        this.pendingOperation = undefined;
        this.cleanupConnection(force);
        pending?.reject(error);
        this.notifyStateChange(lastAction);
    }

    public pauseAutoRollback(): void {
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
            this.autoRollbackTimer = undefined;
        }
        this.autoRollbackDeadline = undefined;
    }

    public resetAutoRollback() {
        this.pauseAutoRollback();

        // Never create a timer after attach failure, cancel, kill, or cleanup.
        if (!this.transaction || this.transactionAction) return;

        const config = vscode.workspace.getConfiguration('firebird');
        let timeoutSeconds = config.get<number>('autoRollbackTimeout', 60);
        if (!timeoutSeconds || typeof timeoutSeconds !== 'number' || isNaN(timeoutSeconds)) {
            timeoutSeconds = 60;
        }

        if (timeoutSeconds <= 0) {
            this.notifyStateChange();
            return;
        }

        this.autoRollbackDeadline = Date.now() + (timeoutSeconds * 1000);
        this.autoRollbackTimer = setTimeout(() => {
            FirebirdLog.info(`[FB] Auto rollback timeout reached | id=${this.id}`);
            void this.rollback('Auto-rolled back')
                .then(() => vscode.window.showInformationMessage('Firebird transaction auto-rolled back due to inactivity.'))
                .catch(err => FirebirdLog.error(`[FB] Auto rollback failed | id=${this.id}`, err, true));
        }, timeoutSeconds * 1000);

        this.notifyStateChange();
    }

    public get hasActiveTransaction(): boolean {
        return !!this.transaction;
    }

    private closeActiveStatement(): void {
        if (!this.activeStatement) return;
        try {
            (this.activeStatement as { close(): void }).close();
        } catch (err) {
            FirebirdLog.error(`[FB] Active statement close failed | id=${this.id}`, err);
        }
        this.activeStatement = undefined;
        FirebirdLog.info(`[FB] Active statement closed | id=${this.id}`);
    }

    private destroyDatabase(db: Firebird.Database): void {
        interface InternalSocket { destroy?(): void }
        interface InternalDbConnection { _socket?: InternalSocket; destroy?(): void }
        interface InternalDb { connection?: InternalDbConnection; destroy?(): void }

        const dbInternal = db as unknown as InternalDb;
        const connection = dbInternal.connection;
        if (connection?._socket?.destroy) connection._socket.destroy();
        else if (connection?.destroy) connection.destroy();
        else if (dbInternal.destroy) dbInternal.destroy();
        else db.detach();
    }

    private getTimeoutMs(key: string, fallbackMs: number): number {
        try {
            const seconds = vscode.workspace.getConfiguration('firebird').get<number>(key, fallbackMs / 1000);
            return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
                ? seconds * 1000
                : 0;
        } catch (err) {
            FirebirdLog.error(`[FB] Unable to read timeout setting ${key}; using default`, err);
            return fallbackMs;
        }
    }

    private asError(err: unknown): Error {
        return err instanceof Error ? err : new Error(String(err));
    }

    private dispose(): void {
        const pending = this.pendingOperation;
        this.pendingOperation = undefined;
        this.cleanupConnection(true);
        pending?.reject(new Error('Firebird extension deactivated.'));
        this.onStateChangeHandlers = [];
    }
}
