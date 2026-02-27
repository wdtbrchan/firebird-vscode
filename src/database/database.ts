import { DatabaseConnection } from './types';
import { TransactionManager } from './transactionManager';
import { QueryExecutor } from './queryExecutor';
import { QueryOptions, QueryResult } from './types';

/**
 * Database singleton facade.
 * Delegates to TransactionManager (connection/transaction lifecycle)
 * and QueryExecutor (query execution, meta queries).
 */
export class Database {

    // --- Transaction events ---
    public static onTransactionChange(handler: (hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void) {
        TransactionManager.onTransactionChange(handler);
    }

    // --- Query execution ---
    public static async executeQuery(query: string, connection?: DatabaseConnection, queryOptions?: QueryOptions): Promise<QueryResult> {
        return QueryExecutor.executeQuery(query, connection, queryOptions);
    }

    public static async runMetaQuery(connection: DatabaseConnection, query: string): Promise<any[]> {
        return QueryExecutor.runMetaQuery(connection, query);
    }

    // --- Transaction management ---
    public static async commit(): Promise<void> {
        return TransactionManager.commit();
    }

    public static async rollback(reason: string = 'Rolled back'): Promise<void> {
        return TransactionManager.rollback(reason);
    }

    public static detach() {
        TransactionManager.rollback();
    }

    public static get hasActiveTransaction(): boolean {
        return TransactionManager.hasActiveTransaction;
    }

    // --- Connection check ---
    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        return QueryExecutor.checkConnection(connection);
    }
}
