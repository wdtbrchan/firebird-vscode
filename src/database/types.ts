/**
 * Shared types for the database module.
 */

export interface QueryOptions {
    limit?: number;
    offset?: number;
}

export interface QueryResult {
    rows: Record<string, unknown>[];
    affectedRows?: number;
    hasMore?: boolean;
}

export interface DatabaseConnection {
    id: string; // unique identifier
    host: string;
    port: number;
    database: string; // path
    user: string;
    password?: string; // Persisted in vscode.SecretStorage (see explorer/passwordStore); only present in memory after hydration.
    role?: string;
    charset?: string;
    resultLocale?: string;
    name?: string; // friendly name
    groupId?: string; // ID of parent group
    shortcutSlot?: number; // 1-9 for quick access
    color?: string; // Color identifier for the connection
}
