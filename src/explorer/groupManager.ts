import * as vscode from 'vscode';

import { ConnectionGroup } from './treeItems/databaseItems';

/**
 * Manages connection groups (folders in the explorer tree).
 */
export class GroupManager {
    private groups: ConnectionGroup[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private getConnections: () => { groupId?: string }[],
        private onSave: () => void
    ) {}

    /** Load groups from global state. Called by parent during initialization. */
    public load(groups: ConnectionGroup[]) {
        this.groups = groups;
    }

    /** Get all groups. */
    public getGroups(): ConnectionGroup[] {
        return this.groups;
    }

    /** Set groups array directly (used during restore). */
    public setGroups(groups: ConnectionGroup[]) {
        this.groups = groups;
    }

    /** Get internal reference for serialization. */
    public getGroupsRef(): ConnectionGroup[] {
        return this.groups;
    }

    async createGroup() {
        const name = await vscode.window.showInputBox({ prompt: 'Group Name' });
        if (!name) return;
        
        const newGroup: ConnectionGroup = {
            id: Date.now().toString(),
            name
        };
        this.groups.push(newGroup);
        this.onSave();
    }

    async renameGroup(group?: ConnectionGroup) {
        if (!group) {
            const items = this.groups.map(g => ({ label: g.name, description: g.id }));
            const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select group to rename' });
            if (!selected) return;
            group = this.groups.find(g => g.id === selected.description);
            if (!group) return;
        }

        const name = await vscode.window.showInputBox({ 
            prompt: 'New Group Name',
            value: group.name 
        });
        if (!name || name === group.name) return;
        
        const targetGroup = this.groups.find(g => g.id === group!.id);
        if (targetGroup) {
            targetGroup.name = name;
            this.onSave();
        }
    }

    async deleteGroup(group: ConnectionGroup) {
        // Move children to root (ungroup)
        this.getConnections().forEach(c => {
            if (c.groupId === group.id) {
                c.groupId = undefined;
            }
        });
         
        this.groups = this.groups.filter(g => g.id !== group.id);
        this.onSave();
    }

    moveGroup(groupId: string, targetIndex: number) {
        const index = this.groups.findIndex(g => g.id === groupId);
        if (index === -1) return;

        const [removed] = this.groups.splice(index, 1);
        const clampedIndex = Math.min(targetIndex, this.groups.length);
        this.groups.splice(clampedIndex, 0, removed);
        this.onSave();
    }
}
