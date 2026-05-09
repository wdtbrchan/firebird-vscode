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
    public static onTransactionChange(handler: (id: string, hasTransaction: boolean, autoRollbackAt?: number, lastAction?: string) => void) {
        TransactionManager.onGlobalTransactionChange(handler);
    }

    // --- Query execution ---
    public static async executeQuery(id: string, query: string, connection?: DatabaseConnection, queryOptions?: QueryOptions): Promise<QueryResult> {
        return QueryExecutor.executeQuery(id, query, connection, queryOptions);
    }

    /**
     * Returns raw RDB$ rows. Typed as `any[]` so each metadata service can
     * read columns by name without casting every field — they map the rows
     * to their own typed result.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static async runMetaQuery(id: string, connection: DatabaseConnection, query: string): Promise<any[]> {
        return QueryExecutor.runMetaQuery(id, connection, query);
    }

    public static async getPlan(id: string, query: string, connection?: DatabaseConnection): Promise<string> {
        return QueryExecutor.getPlan(id, query, connection);
    }

    // --- Transaction management ---
    public static async commit(id: string): Promise<void> {
        return TransactionManager.getInstance(id).commit();
    }

    public static async rollback(id: string, reason: string = 'Rolled back'): Promise<void> {
        return TransactionManager.getInstance(id).rollback(reason);
    }

    public static detachAll() {
        TransactionManager.cleanupAll();
    }

    public static hasActiveTransaction(id: string): boolean {
        return TransactionManager.getInstance(id).hasActiveTransaction;
    }

    // --- Connection check ---
    public static async checkConnection(connection: DatabaseConnection): Promise<void> {
        return QueryExecutor.checkConnection(connection);
    }
}
