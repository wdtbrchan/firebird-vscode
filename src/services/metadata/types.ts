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
    expression?: string;
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

export interface Trigger {
    name: string;
    relation: string;
    sequence: number;
    type: number;
    inactive: boolean;
}

export interface IndexDetails {
    relation: string;
    unique: boolean;
    status: 'ACTIVE' | 'INACTIVE';
    descending: boolean;
    statistics?: number;
    definition: string;
    columns: string[];
    expression?: string;
}
