export interface TableColumn {
    name: string;
    type: string;
    length: number;
    precision?: number;
    scale?: number;
    notNull: boolean;
    defaultValue?: string;
    computedSource?: string;
    pk?: boolean; // Primary Key
    fk?: string;  // Foreign Key target table
}

export interface TableIndex {
    name: string;
    unique: boolean;
    inactive: boolean;
    columns: string[];
}

export interface TableDependency {
    name: string;
    type: string; // 'View', 'Trigger', etc.
}

export interface TablePermission {
    user: string;
    privilege: string;
    grantor: string;
    grantOption: boolean;
}
