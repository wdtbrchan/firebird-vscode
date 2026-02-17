import * as vscode from 'vscode';
import * as Firebird from 'node-firebird';

type StateChangeHandler = (hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void;

/**
 * Manages database transactions, auto-rollback timer, and connection lifecycle.
 * All members are static – singleton pattern matching the original Database class.
 */
export class TransactionManager {
    static db: Firebird.Database | undefined;
    static transaction: Firebird.Transaction | undefined;
    static autoRollbackTimer: NodeJS.Timeout | undefined;
    static autoRollbackDeadline: number | undefined;
    static currentOptions: Firebird.Options | undefined;
    static activeStatement: any | undefined;
    static activeQuery: string | undefined;
    static activeConnectionInfo: string | undefined;

    private static onStateChangeHandlers: StateChangeHandler[] = [];

    public static onTransactionChange(handler: StateChangeHandler) {
        this.onStateChangeHandlers.push(handler);
    }

    public static notifyStateChange(lastAction?: string) {
        const isActive = this.hasActiveTransaction;
        this.onStateChangeHandlers.forEach(h => h(isActive, this.autoRollbackDeadline, lastAction));
    }

    public static async commit(): Promise<void> {
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

    public static async rollback(reason: string = 'Rolled back'): Promise<void> {
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

    public static cleanupConnection() {
        if (this.autoRollbackTimer) {
            clearTimeout(this.autoRollbackTimer);
            this.autoRollbackTimer = undefined;
        }
        if (this.activeStatement) {
            try { this.activeStatement.close(); } catch (e) {}
            this.activeStatement = undefined;
        }
        this.activeQuery = undefined;
        this.activeConnectionInfo = undefined;
        if (this.db) {
            try {
                this.db.detach();
            } catch (e) {}
            this.db = undefined;
            this.currentOptions = undefined;
        }
        this.autoRollbackDeadline = undefined;
    }

    public static resetAutoRollback() {
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

    public static get hasActiveTransaction(): boolean {
        return !!this.transaction;
    }
}
