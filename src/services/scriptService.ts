import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface ScriptItemData {
    id: string;
    name: string;
    type: 'folder' | 'file';
    fsPath?: string; // For files
    children?: ScriptItemData[]; // For folders
    isShared?: boolean;
    connectionId?: string; // For rapid lookup if needed, though structure defines it
    pending?: boolean; // True if not yet saved to disk
}

export interface ScriptsState {
    shared: ScriptItemData[];
    connections: { [id: string]: ScriptItemData[] };
}

export class ScriptService {
    private static instance: ScriptService;
    private context: vscode.ExtensionContext;
    private state: ScriptsState = { shared: [], connections: {} };
    private _onDidChangeScripts = new vscode.EventEmitter<void>();
    public readonly onDidChangeScripts = this._onDidChangeScripts.event;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.load();
    }

    public static initialize(context: vscode.ExtensionContext) {
        if (!ScriptService.instance) {
            ScriptService.instance = new ScriptService(context);
        }
    }

    public static getInstance(): ScriptService {
        return ScriptService.instance;
    }

    private load() {
        const stored = this.context.globalState.get<ScriptsState>('firebird.scripts');
        if (stored) {
            this.state = stored;
             // Ensure connections object exists if old state didn't have it
            if (!this.state.connections) this.state.connections = {};
            if (!this.state.shared) this.state.shared = [];
        }
    }

    private save() {
        this.context.globalState.update('firebird.scripts', this.state);
        this._onDidChangeScripts.fire();
    }

    public getScripts(connectionId?: string): ScriptItemData[] {
        if (connectionId) {
             if (!this.state.connections[connectionId]) {
                 this.state.connections[connectionId] = [];
             }
             return this.state.connections[connectionId];
        }
        return this.state.shared;
    }

    public addScript(name: string, fsPath: string, connectionId?: string, parentId?: string): ScriptItemData {
        const newItem: ScriptItemData = {
            id: uuidv4(),
            name,
            type: 'file',
            fsPath,
            isShared: !connectionId
        };
        this.addItemToTree(newItem, connectionId, parentId);
        this.save();
        return newItem;
    }

    public addFolder(name: string, connectionId?: string, parentId?: string): ScriptItemData {
        const newItem: ScriptItemData = {
             id: uuidv4(),
             name,
             type: 'folder',
             children: [],
             isShared: !connectionId
        };
        this.addItemToTree(newItem, connectionId, parentId);
        this.save();
        return newItem;
    }

    public createPendingScript(name: string, connectionId?: string, parentId?: string): ScriptItemData {
        const newItem: ScriptItemData = {
            id: uuidv4(),
            name,
            type: 'file',
            pending: true,
            isShared: !connectionId
        };
        this.addItemToTree(newItem, connectionId, parentId);
        // We do SAVE pending items, so they persist across reloads even if unsaved? 
        // Or maybe strictly they shouldn't persist if closed?
        // User request: "create new SQL file... added (italic)... after saving... normal font".
        // If we restart VS Code, the untitled file is usually restored by VS Code hot exit.
        // So we should persist the "pending" state.
        this.save(); 
        return newItem;
    }

    public resolvePendingScript(id: string, fsPath: string) {
        const item = this.findItem(id);
        if (item) {
            item.pending = false;
            item.fsPath = fsPath;
            // Update name to match filename if it was "Untitled" or generic? 
            // Usually good practice to keep the name user gave or filename.
            item.name = path.basename(fsPath);
            this.save();
        }
    }

    public removePendingScript(id: string) {
        this.removeItem(id);
    }

    private addItemToTree(item: ScriptItemData, connectionId?: string, parentId?: string, index?: number) {
        let collection: ScriptItemData[];
        
        if (connectionId) {
            if (!this.state.connections[connectionId]) {
                this.state.connections[connectionId] = [];
            }
            collection = this.state.connections[connectionId];
        } else {
            collection = this.state.shared;
        }

        if (parentId) {
            const parent = this.findInCollection(collection, parentId);
            if (parent && parent.type === 'folder') {
                if (!parent.children) parent.children = [];
                if (index !== undefined && index >= 0 && index <= parent.children.length) {
                    parent.children.splice(index, 0, item);
                } else {
                    parent.children.push(item);
                }
            } else {
                // Fallback to root if parent not found or is file
                // Should we respect index here? It's confusing if parent was wrong.
                // Let's just push to root safety.
                 collection.push(item);
            }
        } else {
            if (index !== undefined && index >= 0 && index <= collection.length) {
                collection.splice(index, 0, item);
            } else {
                collection.push(item);
            }
        }
    }

    public removeItem(id: string) {
        // Search everywhere
        this.removeFromCollection(this.state.shared, id);
        for (const key in this.state.connections) {
            this.removeFromCollection(this.state.connections[key], id);
        }
        this.save();
    }

    public renameItem(id: string, newName: string) {
        const item = this.findItem(id);
        if (item) {
            item.name = newName;
            this.save();
        }
    }

    private removeFromCollection(collection: ScriptItemData[], id: string): boolean {
        const index = collection.findIndex(i => i.id === id);
        if (index !== -1) {
            collection.splice(index, 1);
            return true;
        }
        for (const item of collection) {
            if (item.children) {
                if (this.removeFromCollection(item.children, id)) return true;
            }
        }
        return false;
    }

    private findItem(id: string): ScriptItemData | undefined {
        let found = this.findInCollection(this.state.shared, id);
        if (found) return found;
        
        for (const key in this.state.connections) {
            found = this.findInCollection(this.state.connections[key], id);
            if (found) return found;
        }
        return undefined;
    }

    private findInCollection(collection: ScriptItemData[], id: string): ScriptItemData | undefined {
        for (const item of collection) {
            if (item.id === id) return item;
            if (item.children) {
                const found = this.findInCollection(item.children, id);
                if (found) return found;
            }
        }
        return undefined;
    }
    
    // For Drag & Drop: Move item
    public moveItem(itemId: string, targetParentId?: string, targetConnectionId?: string, targetShared: boolean = false, targetIndex?: number) {
        const item = this.findItem(itemId);
        if (!item) return;

        // Create a copy of the item
        const itemCopy = { ...item };
        
        // Remove from old location
        this.removeItem(itemId);

        // Update properties for new location
        if (targetShared) {
            itemCopy.isShared = true;
            // itemCopy.connectionId is implicit
        } else {
            itemCopy.isShared = false;
        }

        // Add to new location
        this.addItemToTree(itemCopy, targetShared ? undefined : targetConnectionId, targetParentId, targetIndex);
        this.save();
    }
}
