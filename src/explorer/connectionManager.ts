import * as vscode from 'vscode';
import * as path from 'path';

import { ConnectionEditor } from '../editors/connectionEditor';
import { Database } from '../database';
import { ConnectionGroup } from './treeItems/databaseItems';
import { DatabaseConnection } from '../database/types';
import {
    SecretStorageLike,
    deleteConnectionPassword,
    hydratePasswordsFromSecrets,
    migratePasswordsToSecrets,
    setConnectionPassword,
    stripPasswords
} from './passwordStore';
import { FirebirdLog } from '../logger';

/**
 * Manages database connections – add, edit, remove, activate, move.
 */
export class ConnectionManager {
    private connections: DatabaseConnection[] = [];
    private activeConnectionId: string | undefined;
    public failedConnectionIds: Map<string, string> = new Map(); // id -> error message
    public connectingConnectionIds = new Set<string>();

    constructor(
        private context: vscode.ExtensionContext,
        private getGroups: () => ConnectionGroup[],
        private onSave: () => void
    ) {}

    private get secrets(): SecretStorageLike {
        return this.context.secrets;
    }

    private describeConnection(conn: DatabaseConnection): string {
        return `${conn.name || path.basename(conn.database)} | ${conn.host || 'localhost'}:${conn.port || 3050} | ${conn.database}`;
    }

    /** Load connections from global state. */
    public loadConnections() {
        const storedConns = this.context.globalState.get<DatabaseConnection[]>('firebird.connections');
        this.connections = storedConns || [];
        this.activeConnectionId = undefined;
        FirebirdLog.info(`[FB] Connections loaded | count=${this.connections.length}`);
    }

    /**
     * Migrates any legacy plain-text passwords from globalState into SecretStorage,
     * then hydrates in-memory connections from SecretStorage. Idempotent.
     * Caller should fire a tree refresh after this resolves.
     */
    public async initializePasswordStore(): Promise<void> {
        const migrated = await migratePasswordsToSecrets(this.secrets, this.connections);
        if (migrated > 0) {
            // Persist the now-stripped connections so plain passwords leave globalState.
            this.context.globalState.update('firebird.connections', stripPasswords(this.connections));
            FirebirdLog.info(`[FB] Migrated connection passwords to SecretStorage | count=${migrated}`);
        }
        await hydratePasswordsFromSecrets(this.secrets, this.connections);
        FirebirdLog.info(`[FB] Connection passwords hydrated from SecretStorage`);
    }

    /**
     * Save connections to global state and fire change event. Passwords are
     * stripped before persistence — secrets are managed via setConnectionPassword.
     */
    public saveConnections() {
        this.context.globalState.update('firebird.connections', stripPasswords(this.connections));
        this.context.globalState.update('firebird.groups', this.getGroups());
        this.context.globalState.update('firebird.activeConnectionId', this.activeConnectionId);
        this.onSave();
    }

    /**
     * Writes (or clears) a connection's password in SecretStorage based on the
     * value currently held in memory.
     */
    private async persistPassword(connectionId: string, password: string | undefined): Promise<void> {
        if (typeof password === 'string' && password.length > 0) {
            await setConnectionPassword(this.secrets, connectionId, password);
        } else {
            await deleteConnectionPassword(this.secrets, connectionId);
        }
    }

    /** Get all connections. */
    public getConnections(): DatabaseConnection[] {
        return this.connections;
    }

    /** Set connections array directly (used during restore). */
    public setConnections(connections: DatabaseConnection[]) {
        this.connections = connections;
    }

    public getConnectionById(id: string): DatabaseConnection | undefined {
        return this.connections.find(c => c.id === id);
    }

    public getConnectionsInGroup(groupId: string | undefined): DatabaseConnection[] {
        const groups = this.getGroups();
        if (groupId) {
            return this.connections.filter(c => c.groupId === groupId);
        }
        return this.connections.filter(c => !c.groupId || !groups.find(g => g.id === c.groupId));
    }

    public getActiveConnectionId(): string | undefined {
        return this.activeConnectionId;
    }

    public setActiveConnectionId(id: string | undefined) {
        this.activeConnectionId = id;
    }

    async addDatabase() {
        ConnectionEditor.createOrShow(
            this.context.extensionUri,
            () => ({ groups: this.getGroups(), connection: undefined }),
            async (conn) => {
                await this.persistPassword(conn.id, conn.password);
                this.connections.push(conn);
                if (this.connections.length === 1) {
                    this.activeConnectionId = conn.id;
                }
                this.saveConnections();
                FirebirdLog.info(`[FB] Connection added | ${this.describeConnection(conn)}`);
            }
        );
    }

    async editDatabase(conn: DatabaseConnection, refresh: () => void) {
        ConnectionEditor.createOrShow(
            this.context.extensionUri,
            () => ({ groups: this.getGroups(), connection: conn }),
            async (updatedConn) => {
                const index = this.connections.findIndex(c => c.id === conn.id);
                if (index !== -1) {
                    if (updatedConn.color) updatedConn.color = updatedConn.color.toLowerCase();

                    await this.persistPassword(updatedConn.id, updatedConn.password);
                    this.connections[index] = updatedConn;
                    this.saveConnections();
                    FirebirdLog.info(`[FB] Connection updated | ${this.describeConnection(updatedConn)}`);

                    refresh();
                }
            },
            async (connToDelete) => {
                this.removeDatabase(connToDelete);
            }
        );
    }

    moveConnection(conn: DatabaseConnection, targetGroupId: string | undefined, targetIndex?: number) {
        const groups = this.getGroups();
        const index = this.connections.findIndex(c => c.id === conn.id);
        if (index === -1) return;

        const [removed] = this.connections.splice(index, 1);
        removed.groupId = targetGroupId;

        if (targetIndex !== undefined) {
            const groupConns = this.connections.filter(c => 
                targetGroupId ? c.groupId === targetGroupId : (!c.groupId || !groups.find(g => g.id === c.groupId))
            );
            
            const clampedIndex = Math.min(targetIndex, groupConns.length);
            if (clampedIndex < groupConns.length) {
                const refConn = groupConns[clampedIndex];
                const absIndex = this.connections.indexOf(refConn);
                this.connections.splice(absIndex, 0, removed);
            } else {
                if (groupConns.length > 0) {
                    const lastConn = groupConns[groupConns.length - 1];
                    const absIndex = this.connections.indexOf(lastConn);
                    this.connections.splice(absIndex + 1, 0, removed);
                } else {
                    this.connections.push(removed);
                }
            }
        } else {
            this.connections.push(removed);
        }
        this.saveConnections();
        FirebirdLog.info(`[FB] Connection moved | ${this.describeConnection(removed)} | targetGroupId=${targetGroupId || 'root'}`);
    }

    refreshDatabase(conn: DatabaseConnection, fireChange: (element: DatabaseConnection) => void) {
        FirebirdLog.info(`[FB] Connection refresh requested | ${this.describeConnection(conn)}`);
        fireChange(conn);
    }

    removeDatabase(conn: DatabaseConnection) {
        this.connections = this.connections.filter(c => c.id !== conn.id);
        if (this.activeConnectionId === conn.id) {
            this.activeConnectionId = undefined;
        }
        // Fire-and-forget; failure to delete a stored secret should not block UI.
        deleteConnectionPassword(this.secrets, conn.id).catch(() => { /* ignore */ });
        this.saveConnections();
        FirebirdLog.info(`[FB] Connection removed | ${this.describeConnection(conn)}`);
    }

    disconnect(conn: DatabaseConnection) {
        if (this.activeConnectionId === conn.id) {
            this.activeConnectionId = undefined;
            this.saveConnections();
            FirebirdLog.info(`[FB] Connection deactivated | ${this.describeConnection(conn)}`);
        } else {
            FirebirdLog.info(`[FB] Disconnect requested for inactive connection | ${this.describeConnection(conn)}`);
        }
    }

    async setActive(conn: DatabaseConnection, treeView?: vscode.TreeView<unknown>) {
        FirebirdLog.info(`[FB] Connection activation requested | ${this.describeConnection(conn)}`, true);
        this.connectingConnectionIds.add(conn.id);
        this.saveConnections(); // Fire update to show spinner

        try {
            await Database.checkConnection(conn);
            this.failedConnectionIds.delete(conn.id);
        } catch (err) {
            this.failedConnectionIds.set(conn.id, (err as Error).message);
            FirebirdLog.error(`[FB] Connection activation failed | ${this.describeConnection(conn)} | message=${(err as Error).message}`, err, true);
            vscode.window.showErrorMessage(`Failed to connect to ${conn.name || conn.database}: ${(err as Error).message}`);
            this.connectingConnectionIds.delete(conn.id);
            this.saveConnections(); 
            return; 
        }

        // Connection success
        this.connectingConnectionIds.delete(conn.id);
        this.activeConnectionId = conn.id;
        this.saveConnections();
        FirebirdLog.info(`[FB] Connection activated | ${this.describeConnection(conn)}`, true);
        
        // Force expand the active connection
        if (treeView) {
            try {
                await treeView.reveal(conn, { expand: true, select: true, focus: true });
            } catch (err) {
                FirebirdLog.error('[FB] Failed to reveal active connection in tree', err);
            }
        }
    }

    public getConnectionBySlot(slot: number): DatabaseConnection | undefined {
        return this.connections.find(c => c.shortcutSlot === slot);
    }

    getActiveConnectionDetails(): { name: string, group: string } | undefined {
        const conn = this.getActiveConnection();
        if (!conn) return undefined;
        
        const group = conn.groupId ? this.getGroups().find(g => g.id === conn.groupId)?.name : undefined;
        return {
            name: conn.name || path.basename(conn.database),
            group: group || 'Root'
        };
    }

    getActiveConnection(): DatabaseConnection | undefined {
        return this.connections.find(c => c.id === this.activeConnectionId);
    }
}
