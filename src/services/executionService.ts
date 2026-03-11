import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import { Database } from '../database';
import { DatabaseConnection } from '../database/types';

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
    connection?: DatabaseConnection;
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
    private _currentConnection: DatabaseConnection | undefined;
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

    public get currentConnection(): DatabaseConnection | undefined {
        return this._currentConnection;
    }

    public async executeNewQuery(query: string, connection: DatabaseConnection, context?: string) {
        this._currentQuery = query;
        this._displayQuery = query;
        this._currentConnection = connection;
        this._currentContext = context;
        this._currentOffset = 0;
        this._limit = vscode.workspace.getConfiguration('firebird').get<number>('maxRows', 1000);
        this._allResults = [];
        this._lastExecutionTime = undefined;

        this._onStart.fire();
        const start = performance.now();
        try {
            await this._fetchAndEmit(false);
        } finally {
            const end = performance.now();
            this._checkAndPlayAudioCue((end - start) / 1000);
        }
    }

    public async executeScript(statements: string[], connection: DatabaseConnection, context?: string) {
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
        const start = performance.now();

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
        } finally {
            const end = performance.now();
            this._checkAndPlayAudioCue((end - start) / 1000);
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

    private _checkAndPlayAudioCue(executionTimeSeconds: number) {
        const config = vscode.workspace.getConfiguration('firebird');
        const audioEnabled = config.get<boolean>('queryAudioNotificationEnabled', true);
        if (!audioEnabled) return;

        const threshold = config.get<number>('queryAudioNotificationThreshold', 5);
        if (executionTimeSeconds >= threshold) {
            this._playSound();
        }
    }

    private _playSound() {
        const config = vscode.workspace.getConfiguration('firebird');
        const customCommand = config.get<string>('queryAudioNotificationCommand', '').trim();

        if (customCommand) {
             cp.exec(customCommand).on('error', (err) => {
                 console.error('Failed to execute custom audio command:', err);
             });
             return;
        }

        const platform = os.platform();
        if (platform === 'win32') {
            cp.exec('powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\notify.wav\').PlaySync();"').on('error', () => {});
        } else if (platform === 'darwin') {
            cp.exec('afplay /System/Library/Sounds/Glass.aiff').on('error', () => {});
        } else {
            cp.exec('paplay /usr/share/sounds/freedesktop/stereo/complete.oga || aplay /usr/share/sounds/alsa/Front_Center.wav').on('error', () => {});
        }
    }
}
