import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';

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
        this.instances.forEach(instance => instance.cleanupConnection());
        this.instances.clear();
    }

    public db: Firebird.Database | undefined;
    public transaction: Firebird.Transaction | undefined;
    public autoRollbackTimer: NodeJS.Timeout | undefined;
    public autoRollbackDeadline: number | undefined;
    public currentOptions: Firebird.Options | undefined;
    public activeStatement: any | undefined;
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
                this.transaction.commit((err) => {
                    this.transaction = undefined;
                    this.notifyStateChange('Committed'); 
                    this.cleanupConnection();
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public async rollback(reason: string = 'Rolled back'): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.transaction) {
                this.transaction.rollback((err) => {
                    this.transaction = undefined;
                    this.notifyStateChange(reason); 
                    this.cleanupConnection();
                    if (err) reject(err);
                    else resolve();
                });
            } else {
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
            try { this.activeStatement.close(); } catch (e) { /* ignore */ }
            this.activeStatement = undefined;
        }
        this.activeQuery = undefined;
        this.activeConnectionInfo = undefined;
        if (this.db) {
            try {
                this.db.detach();
            } catch (e) { /* ignore */ }
            this.db = undefined;
            this.currentOptions = undefined;
        }
        this.autoRollbackDeadline = undefined;
    }

    public cancelConnection() {
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
            this.autoRollbackTimer = undefined;
        }
        this.autoRollbackDeadline = undefined;
        
        // This will kill the running query immediately and break the connection
        if (this.db) {
            try {
                this.db.detach();
            } catch (e) { /* ignore */ }
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
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
            this.autoRollbackTimer = undefined;
        }
        this.autoRollbackDeadline = undefined;

        if (this.db) {
            try {
                // Forcefully destroy the socket connection if available in node-firebird
                const dbAny = this.db as any;
                if (dbAny.connection && dbAny.connection._socket && typeof dbAny.connection._socket.destroy === 'function') {
                    dbAny.connection._socket.destroy();
                } else if (dbAny.connection && typeof dbAny.connection.destroy === 'function') {
                    dbAny.connection.destroy();
                } else if (typeof dbAny.destroy === 'function') {
                    dbAny.destroy();
                } else {
                    this.db.detach();
                }
            } catch (e) {
                console.error('Error forcefully killing connection', e);
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
