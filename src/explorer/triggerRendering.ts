import * as vscode from 'vscode';
import { MetadataService } from '../services/metadataService';
import { DatabaseConnection } from './treeItems/databaseItems';
import { TriggerGroupItem, TriggerItem } from './treeItems/triggerItems';
import { TreeRenderingContext } from './treeRendering';

/**
 * Groups triggers by Event then Time.
 */
export async function getGroupedTriggers(
    connection: DatabaseConnection, 
    ctx: TreeRenderingContext, 
    context: string,
    tableName?: string, 
    filter?: string, 
    forceGroup?: boolean
): Promise<TriggerGroupItem[]> {
    try {
        const allTriggers = await MetadataService.getTriggers(connection, tableName);
        const hierarchy: { [event: string]: { [time: string]: any[] } } = {};
        
        for (const t of allTriggers) {
            if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) {
                continue;
            }

            const typeName = MetadataService.decodeTriggerType(t.type);
            
            let time = 'OTHER';
            let event = typeName;

            if (typeName.startsWith('BEFORE ')) {
                time = 'BEFORE';
                event = typeName.substring(7);
            } else if (typeName.startsWith('AFTER ')) {
                time = 'AFTER';
                event = typeName.substring(6);
            } else if (typeName.startsWith('ON ')) {
                time = 'ON';
                event = typeName.substring(3);
            }

            // Capitalize event for consistency
            event = event.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

            if (!hierarchy[event]) hierarchy[event] = {};
            if (!hierarchy[event][time]) hierarchy[event][time] = [];
            
            hierarchy[event][time].push(t);
        }

        // Ordered events
        const eventOrder = ['Insert', 'Update', 'Insert Or Update', 'Delete', 'Insert Or Delete', 'Update Or Delete', 'Insert Or Update Or Delete', 'Transaction Start', 'Transaction Commit', 'Transaction Rollback', 'Connect', 'Disconnect'];
        
        const sortedEvents = Object.keys(hierarchy).sort((a, b) => {
             const ia = eventOrder.indexOf(a);
             const ib = eventOrder.indexOf(b);
             if (ia !== -1 && ib !== -1) return ia - ib;
             if (ia !== -1) return -1;
             if (ib !== -1) return 1;
             return a.localeCompare(b);
        });

        const result: TriggerGroupItem[] = [];

        for (const event of sortedEvents) {
            const timeGroups = hierarchy[event];
            const timeKeys = Object.keys(timeGroups);
            
            const children: (TriggerGroupItem | TriggerItem)[] = [];
            
            // Order times: BEFORE, AFTER
            const sortedTimes = timeKeys.sort((a, b) => {
                if (a === 'BEFORE') return -1;
                if (b === 'BEFORE') return 1;
                if (a === 'AFTER') return -1;
                if (b === 'AFTER') return 1;
                return a.localeCompare(b);
            });

            for (const time of sortedTimes) {
                 const triggers = timeGroups[time];
                 triggers.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
                 
                 const triggerItems = triggers.map(t => {
                     const isFav = !!ctx.getFavorite(connection.id, t.name, 'trigger');
                     return new TriggerItem(connection, t.name, t.sequence, t.inactive, isFav);
                 });

                 // Create a group for the time (e.g. "Before")
                 const timeGroup = new TriggerGroupItem(
                     time, 
                     triggerItems, 
                     connection,
                     vscode.TreeItemCollapsibleState.Collapsed,
                     `${context}-${event}-${time}` // Unique path for ID
                 );
                 children.push(timeGroup);
            }

            // Now create the Event group
             const eventGroup = new TriggerGroupItem(
                 event,
                 children, 
                 connection,
                 vscode.TreeItemCollapsibleState.Collapsed,
                 `${context}-${event}` // Unique path
             );
             result.push(eventGroup);
        }
        
        return result;
    } catch (err: any) {
        console.error('Error getting grouped triggers:', err);
        vscode.window.showErrorMessage(`Error loading grouped triggers: ${err.message}`);
        return [];
    }
}

/**
 * Gets a flat list of all triggers.
 */
export async function getTriggerList(
    connection: DatabaseConnection,
    ctx: TreeRenderingContext,
    tableName?: string
): Promise<TriggerItem[]> {
    try {
        const allTriggers = await MetadataService.getTriggers(connection, tableName);
        
        allTriggers.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        return allTriggers.map(t => {
            const isFav = !!ctx.getFavorite(connection.id, t.name, 'trigger');
            return new TriggerItem(connection, t.name, t.sequence, t.inactive, isFav);
        });
    } catch (err) {
        console.error('Error getting trigger list:', err);
        return [];
    }
}
