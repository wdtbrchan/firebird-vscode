import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import { Database } from '../database';
import { DatabaseConnection } from '../database/types';
import { TransactionManager } from '../database/transactionManager';

export interface ExecutionDataEvent {
    results: Record<string, unknown>[];
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
    public static instances: Map<string, ExecutionService> = new Map();

    // Events
    private readonly _onStart = new vscode.EventEmitter<{ connection: DatabaseConnection, context?: string }>();
    public readonly onStart = this._onStart.event;

    private readonly _onError = new vscode.EventEmitter<{ message: string, hasTransaction: boolean }>();
    public readonly onError = this._onError.event;

    private readonly _onSuccessMessage = new vscode.EventEmitter<{ message: string, hasTransaction: boolean }>();
    public readonly onSuccessMessage = this._onSuccessMessage.event;

    private readonly _onData = new vscode.EventEmitter<ExecutionDataEvent>();
    public readonly onData = this._onData.event;

    private readonly _onMessage = new vscode.EventEmitter<{ text: string }>();
    public readonly onMessage = this._onMessage.event;

    private readonly _onPlan = new vscode.EventEmitter<{ plan: string, context?: string, query?: string, connection?: DatabaseConnection, executionTime?: number }>();
    public readonly onPlan = this._onPlan.event;

    // State
    private _currentConnection: DatabaseConnection | undefined;
    private _currentContext: string | undefined;
    private _currentQuery: string | undefined;
    private _displayQuery: string | undefined;
    private _currentOffset: number = 0;
    private _limit: number = 1000;
    private _allResults: Record<string, unknown>[] = [];
    private _lastExecutionTime: number | undefined;
    private _isExecuting: boolean = false;

    private constructor(private id: string) { }

    public static getInstance(id: string): ExecutionService {
        if (!ExecutionService.instances.has(id)) {
            ExecutionService.instances.set(id, new ExecutionService(id));
        }
        return ExecutionService.instances.get(id)!;
    }

    public cancelCurrentQuery() {
        TransactionManager.getInstance(this.id).cancelConnection();
    }

    public killCurrentProcess() {
        TransactionManager.getInstance(this.id).killConnection();
    }

    public get currentQuery(): string | undefined {
        return this._currentQuery;
    }

    public get currentConnection(): DatabaseConnection | undefined {
        return this._currentConnection;
    }

    public async executeNewQuery(query: string, connection: DatabaseConnection, context?: string) {
        if (this._isExecuting) {
            vscode.window.showWarningMessage('A query is already running in this editor. Please wait or cancel the current execution.');
            return;
        }

        this._isExecuting = true;
        this._currentQuery = query;
        this._displayQuery = query;
        this._currentConnection = connection;
        this._currentContext = context;
        this._currentOffset = 0;
        this._limit = vscode.workspace.getConfiguration('firebird').get<number>('maxRows', 1000);
        this._allResults = [];
        this._lastExecutionTime = undefined;

        const qPreview = query.trim().replace(/\s+/g, ' ').substring(0, 80);
        console.log(`[FB] executeNewQuery START | id=${this.id} | db=${context || 'unknown'} | query="${qPreview}"`);

        this._onStart.fire({ connection, context });
        console.log(`[FB] onStart fired`);
        const start = performance.now();
        try {
            await this._fetchAndEmit(false);
        } finally {
            this._isExecuting = false;
            const elapsed = ((performance.now() - start) / 1000).toFixed(3);
            console.log(`[FB] executeNewQuery END | id=${this.id} | total=${elapsed}s`);
            this._checkAndPlayAudioCue(parseFloat(elapsed));
        }
    }

    public async explainQuery(query: string, connection: DatabaseConnection, context?: string) {
        if (this._isExecuting) {
            vscode.window.showWarningMessage('A query is already running in this editor. Please wait or cancel the current execution.');
            return;
        }

        this._isExecuting = true;
        this._currentQuery = query;
        this._displayQuery = query;
        this._currentConnection = connection;
        this._currentContext = context;
        this._lastExecutionTime = undefined;

        this._onStart.fire({ connection, context });
        const start = performance.now();
        try {
            const plan = await Database.getPlan(this.id, query, connection);
            const end = performance.now();
            this._lastExecutionTime = (end - start) / 1000;
            
            this._onPlan.fire({
                plan,
                context,
                query,
                connection: this._currentConnection,
                executionTime: this._lastExecutionTime
            });
        } catch (err) {
            const hasTransaction = Database.hasActiveTransaction(this.id);
            this._onError.fire({ message: (err as Error).message, hasTransaction });
        } finally {
            this._isExecuting = false;
            const end = performance.now();
            this._checkAndPlayAudioCue((end - start) / 1000);
        }
    }

    public async executeScript(statements: string[], connection: DatabaseConnection, context?: string) {
        if (this._isExecuting) {
            vscode.window.showWarningMessage('A script or query is already running in this editor. Please wait or cancel the current execution.');
            return;
        }

        this._isExecuting = true;
        this._currentConnection = connection;
        this._currentContext = context;
        this._limit = vscode.workspace.getConfiguration('firebird').get<number>('maxRows', 1000);
        this._allResults = [];

        this._onStart.fire({ connection, context });
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
                    await Database.executeQuery(this.id, stmt, connection, { limit: 1000, offset: 0 });
                }
                executedCount++;
            }
        } catch (err) {
            const hasTransaction = Database.hasActiveTransaction(this.id);
            this._onError.fire({ message: `Script error at statement ${executedCount + 1}: ${(err as Error).message}`, hasTransaction });
        } finally {
            this._isExecuting = false;
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

        console.log(`[FB] _fetchAndEmit START | append=${append} | offset=${this._currentOffset} | limit=${this._limit}`);
        const start = performance.now();
        try {
            console.log(`[FB] Database.executeQuery calling...`);
            const queryResult = await Database.executeQuery(this.id, this._currentQuery, this._currentConnection, {
                limit: this._limit,
                offset: this._currentOffset
            });
            const elapsed = ((performance.now() - start) / 1000).toFixed(3);
            console.log(`[FB] Database.executeQuery returned | rows=${queryResult.rows.length} | affectedRows=${queryResult.affectedRows} | hasMore=${queryResult.hasMore} | elapsed=${elapsed}s`);

            if (!append) {
                this._lastExecutionTime = parseFloat(elapsed);
            }

            const results = queryResult.rows;
            const affectedRows = queryResult.affectedRows;
            const hasMore = queryResult.hasMore || false;
            const hasTransaction = Database.hasActiveTransaction(this.id);

            if (append) {
                this._allResults = [...this._allResults, ...results];
            } else {
                this._allResults = results;
            }

            console.log(`[FB] _onData firing | rows=${results.length} | hasTransaction=${hasTransaction}`);
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
            console.log(`[FB] _onData fired`);

        } catch (err) {
            const elapsed = ((performance.now() - start) / 1000).toFixed(3);
            console.log(`[FB] _fetchAndEmit ERROR | elapsed=${elapsed}s | message=${(err as Error).message}`);
            if (!append) {
                this._lastExecutionTime = parseFloat(elapsed);
            }
            const hasTransaction = Database.hasActiveTransaction(this.id);
            this._onError.fire({ message: (err as Error).message, hasTransaction });
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
