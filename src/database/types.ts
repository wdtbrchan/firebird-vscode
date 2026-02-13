/**
 * Shared types for the database module.
 */

export interface QueryOptions {
    limit?: number;
    offset?: number;
}

export interface QueryResult {
    rows: any[];
    affectedRows?: number;
}
