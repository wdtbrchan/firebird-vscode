import * as vscode from 'vscode';
import * as path from 'path';

import { ConnectionEditor } from '../editors/connectionEditor';
import { Database } from '../db';
import { DatabaseConnection, ConnectionGroup } from './treeItems/databaseItems';

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
        private onSave: () => void
    ) {}

    /** Load connections from global state. */
    public loadConnections() {
        const storedConns = this.context.globalState.get<DatabaseConnection[]>('firebird.connections');
        this.connections = storedConns || [];
        this.activeConnectionId = undefined;
    }

    /** Save connections to global state and fire change event. */
    public saveConnections(groups: ConnectionGroup[]) {
        this.context.globalState.update('firebird.connections', this.connections);
        this.context.globalState.update('firebird.groups', groups);
        this.context.globalState.update('firebird.activeConnectionId', this.activeConnectionId);
        this.onSave();
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

    public getConnectionsInGroup(groupId: string | undefined, groups: ConnectionGroup[]): DatabaseConnection[] {
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

    async addDatabase(extensionUri: vscode.Uri, groups: ConnectionGroup[], saveConnections: () => void) {
        ConnectionEditor.createOrShow(
            extensionUri,
            () => ({ groups: groups, connection: undefined }),
            async (conn) => {
                this.connections.push(conn);
                if (this.connections.length === 1) {
                    this.activeConnectionId = conn.id;
                }
                saveConnections();
            }
        );
    }

    async editDatabase(conn: DatabaseConnection, extensionUri: vscode.Uri, groups: ConnectionGroup[], saveConnections: () => void, refresh: () => void) {
        ConnectionEditor.createOrShow(
            extensionUri,
            () => ({ groups: groups, connection: conn }),
            async (updatedConn) => {
                const index = this.connections.findIndex(c => c.id === conn.id);
                if (index !== -1) {
                    if (updatedConn.color) updatedConn.color = updatedConn.color.toLowerCase();
                    
                    this.connections[index] = updatedConn;
                    saveConnections();
                    
                    refresh();
                }
            },
            async (connToDelete) => {
                this.removeDatabase(connToDelete, saveConnections);
            }
        );
    }

    moveConnection(conn: DatabaseConnection, targetGroupId: string | undefined, groups: ConnectionGroup[], targetIndex?: number) {
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
    }

    refreshDatabase(conn: DatabaseConnection, fireChange: (element: any) => void) {
        fireChange(conn);
    }

    removeDatabase(conn: DatabaseConnection, saveConnections: () => void) {
        this.connections = this.connections.filter(c => c.id !== conn.id);
        if (this.activeConnectionId === conn.id) {
            this.activeConnectionId = undefined;
        }
        saveConnections();
    }

    disconnect(conn: DatabaseConnection, saveConnections: () => void) {
        if (this.activeConnectionId === conn.id) {
            this.activeConnectionId = undefined;
            saveConnections();
        }
    }

    async setActive(conn: DatabaseConnection, saveConnections: () => void, treeView?: vscode.TreeView<any>) {
        this.connectingConnectionIds.add(conn.id);
        saveConnections(); // Fire update to show spinner

        try {
            await Database.checkConnection(conn);
            this.failedConnectionIds.delete(conn.id);
        } catch (err: any) {
            this.failedConnectionIds.set(conn.id, err.message);
            vscode.window.showErrorMessage(`Failed to connect to ${conn.name || conn.database}: ${err.message}`);
            this.connectingConnectionIds.delete(conn.id);
            saveConnections(); 
            return; 
        }

        // Connection success
        this.connectingConnectionIds.delete(conn.id);
        this.activeConnectionId = conn.id;
        saveConnections();
        
        // Force expand the active connection
        if (treeView) {
            try {
                await treeView.reveal(conn, { expand: true, select: true, focus: true });
            } catch (err) {
                console.error('Failed to reveal connection:', err);
            }
        }
    }

    public getConnectionBySlot(slot: number): DatabaseConnection | undefined {
        return this.connections.find(c => c.shortcutSlot === slot);
    }

    getActiveConnectionDetails(groups: ConnectionGroup[]): { name: string, group: string } | undefined {
        const conn = this.getActiveConnection();
        if (!conn) return undefined;
        
        const group = conn.groupId ? groups.find(g => g.id === conn.groupId)?.name : undefined;
        return {
            name: conn.name || path.basename(conn.database),
            group: group || 'Root'
        };
    }

    getActiveConnection(): DatabaseConnection | undefined {
        return this.connections.find(c => c.id === this.activeConnectionId);
    }
}
