import * as vscode from 'vscode';
import { Database } from '../database';

export interface ExecutionDataEvent {
    results: any[];
    affectedRows?: number;
    hasMore: boolean;
    append: boolean;
    hasTransaction: boolean;
    context?: string;
    message?: string;
    isError?: boolean;
    query?: string;
    displayQuery?: string;
    connection?: any;
    executionTime?: number;
}

export class ExecutionService {
    private static _instance: ExecutionService;

    // Events
    private readonly _onStart = new vscode.EventEmitter<void>();
    public readonly onStart = this._onStart.event;

    private readonly _onError = new vscode.EventEmitter<{ message: string, hasTransaction: boolean }>();
    public readonly onError = this._onError.event;

    private readonly _onSuccessMessage = new vscode.EventEmitter<{ message: string, hasTransaction: boolean }>();
    public readonly onSuccessMessage = this._onSuccessMessage.event;

    private readonly _onData = new vscode.EventEmitter<ExecutionDataEvent>();
    public readonly onData = this._onData.event;

    private readonly _onMessage = new vscode.EventEmitter<{ text: string }>();
    public readonly onMessage = this._onMessage.event;

    // State
    private _currentConnection: any | undefined;
    private _currentContext: string | undefined;
    private _currentQuery: string | undefined;
    private _displayQuery: string | undefined;
    private _currentOffset: number = 0;
    private _limit: number = 1000;
    private _allResults: any[] = [];
    private _lastExecutionTime: number | undefined;

    private constructor() { }

    public static getInstance(): ExecutionService {
        if (!ExecutionService._instance) {
            ExecutionService._instance = new ExecutionService();
        }
        return ExecutionService._instance;
    }

    public get currentQuery(): string | undefined {
        return this._currentQuery;
    }

    public get currentConnection(): any | undefined {
        return this._currentConnection;
    }

    public async executeNewQuery(query: string, connection: any, context?: string) {
        this._currentQuery = query;
        this._displayQuery = query;
        this._currentConnection = connection;
        this._currentContext = context;
        this._currentOffset = 0;
        this._limit = vscode.workspace.getConfiguration('firebird').get<number>('maxRows', 1000);
        this._allResults = [];
        this._lastExecutionTime = undefined;

        this._onStart.fire();
        await this._fetchAndEmit(false);
    }

    public async executeScript(statements: string[], connection: any, context?: string) {
        this._currentConnection = connection;
        this._currentContext = context;
        this._limit = vscode.workspace.getConfiguration('firebird').get<number>('maxRows', 1000);
        this._allResults = [];

        this._onStart.fire();
        this._onMessage.fire({ text: 'Executing script...' });

        const total = statements.length;

        if (total === 0) {
            this._displayQuery = undefined;
        } else if (total === 1) {
            this._displayQuery = statements[0];
        } else {
            const getPrefix = (stmt: string) => {
                const trimmed = stmt.trim();
                const firstLine = trimmed.split(/\r?\n/)[0].trim();
                return firstLine.length > 40 ? firstLine.substring(0, 40) : firstLine;
            };
            this._displayQuery = `${getPrefix(statements[0])} ... ${getPrefix(statements[total - 1])}`;
        }

        let executedCount = 0;

        try {
            for (let i = 0; i < total; i++) {
                const stmt = statements[i];
                this._currentQuery = stmt;

                if (i === total - 1) {
                    this._currentOffset = 0;
                    await this._fetchAndEmit(false);
                } else {
                    await Database.executeQuery(stmt, connection, { limit: 1000, offset: 0 });
                }
                executedCount++;
            }
        } catch (err: any) {
            const hasTransaction = Database.hasActiveTransaction;
            this._onError.fire({ message: `Script error at statement ${executedCount + 1}: ${err.message}`, hasTransaction });
        }
    }

    public async loadMore() {
        if (!this._currentQuery) return;
        this._currentOffset += this._limit;
        try {
            await this._fetchAndEmit(true);
        } catch (e) {
            console.error('Load more failed', e);
        }
    }

    private async _fetchAndEmit(append: boolean) {
        if (!this._currentQuery) return;

        const start = performance.now();
        try {
            const queryResult = await Database.executeQuery(this._currentQuery, this._currentConnection, {
                limit: this._limit,
                offset: this._currentOffset
            });
            const end = performance.now();
            if (!append) {
                this._lastExecutionTime = (end - start) / 1000;
            }

            const results = queryResult.rows;
            const affectedRows = queryResult.affectedRows;
            const hasMore = queryResult.hasMore || false;
            const hasTransaction = Database.hasActiveTransaction;

            if (append) {
                this._allResults = [...this._allResults, ...results];
            } else {
                this._allResults = results;
            }

            this._onData.fire({
                results: append ? results : this._allResults,
                affectedRows,
                hasMore,
                append,
                hasTransaction,
                context: this._currentContext,
                query: this._currentQuery,
                displayQuery: this._displayQuery,
                connection: this._currentConnection,
                executionTime: this._lastExecutionTime
            });

        } catch (err: any) {
            const end = performance.now();
            if (!append) {
                this._lastExecutionTime = (end - start) / 1000;
            }
            const hasTransaction = Database.hasActiveTransaction;
            this._onError.fire({ message: err.message, hasTransaction });
            throw err;
        }
    }
}
