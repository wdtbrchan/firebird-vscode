import * as vscode from 'vscode';
import { TreeRenderingContext } from '../treeRendering';
import { ObjectItem } from '../treeItems/databaseItems';
import { IndexItem, TableIndexesItem, CreateNewIndexItem, IndexOperationItem } from '../treeItems/indexItems';
import { TableTriggersItem, TriggerItem, TriggerGroupItem, TriggerOperationItem, TriggerFolderItem } from '../treeItems/triggerItems';
import { OperationItem } from '../treeItems/operationItems';
import { MetadataService } from '../../services/metadataService';
import { getTriggerList, getGroupedTriggers } from '../triggerRendering';

export async function getTableIndexesChildren(element: TableIndexesItem, ctx: TreeRenderingContext): Promise<vscode.TreeItem[]> {
    const indexes = await MetadataService.getIndexes(element.connection, element.tableName);
    const items: vscode.TreeItem[] = [];
    items.push(new CreateNewIndexItem(element.connection, element.tableName));
    
    indexes.forEach(idx => {
        items.push(new IndexItem(element.connection, element.tableName, idx.name, idx.unique, idx.inactive));
    });
    return items;
}

export function getIndexOperationChildren(element: IndexItem, ctx: TreeRenderingContext): IndexOperationItem[] {
    const ops: IndexOperationItem[] = [];
    ops.push(new IndexOperationItem('Drop index', 'drop', element.connection, element.indexName));
    if (element.inactive) {
        ops.push(new IndexOperationItem('Make index active', 'activate', element.connection, element.indexName));
    } else {
        ops.push(new IndexOperationItem('Make index inactive', 'deactivate', element.connection, element.indexName));
    }
    ops.push(new IndexOperationItem('Recompute statistics for index', 'recompute', element.connection, element.indexName));
    return ops;
}

export function getTriggerOperationChildren(element: TriggerItem, ctx: TreeRenderingContext): (TriggerOperationItem | OperationItem)[] {
    const ops: (TriggerOperationItem | OperationItem)[] = [];
    ops.push(new OperationItem('DDL Script', 'alter', new ObjectItem(element.triggerName, 'trigger', element.connection)));

    ops.push(new TriggerOperationItem('Drop trigger', 'drop', element.connection, element.triggerName));
    if (element.inactive) {
        ops.push(new TriggerOperationItem('Activate trigger', 'activate', element.connection, element.triggerName));
    } else {
        ops.push(new TriggerOperationItem('Deactivate trigger', 'deactivate', element.connection, element.triggerName));
    }
    return ops;
}

export function getTriggerGroupChildren(element: TriggerGroupItem, ctx: TreeRenderingContext): (TriggerItem | TriggerGroupItem)[] {
    if (element.triggers.length > 0) {
        const first = element.triggers[0];
        if (first instanceof TriggerGroupItem || first instanceof TriggerItem) {
            return element.triggers;
        }
    }

    const sorted = element.triggers.sort((a, b) => {
        const pa = a.sequence || 0;
        const pb = b.sequence || 0;
        return pa - pb;
    });
    return sorted.map(t => {
            const isFav = !!ctx.getFavorite(element.connection.id, t.name, 'trigger');
            return new TriggerItem(element.connection, t.name, t.sequence, t.inactive, isFav);
    });
}
