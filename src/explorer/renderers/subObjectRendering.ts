import * as vscode from 'vscode';
import { TreeRenderingContext } from '../treeRendering';
import { ObjectItem } from '../treeItems/databaseItems';
import { IndexItem, TableIndexesItem, CreateNewIndexItem, IndexOperationItem, IndexColumnsItem, IndexColumnItem } from '../treeItems/indexItems';
import { TriggerItem, TriggerGroupItem, TriggerOperationItem } from '../treeItems/triggerItems';
import { OperationItem } from '../treeItems/operationItems';
import { MetadataService } from '../../services/metadataService';

export async function getTableIndexesChildren(element: TableIndexesItem, _ctx: TreeRenderingContext): Promise<vscode.TreeItem[]> {
    const indexes = await MetadataService.getIndexes(element.connection, element.tableName);
    const items: vscode.TreeItem[] = [];
    items.push(new CreateNewIndexItem(element.connection, element.tableName));

    indexes.forEach(idx => {
        items.push(new IndexItem(
            element.connection,
            element.tableName,
            idx.name,
            idx.unique,
            idx.inactive,
            idx.columns,
            idx.expression
        ));
    });
    return items;
}

export function getIndexChildren(element: IndexItem, _ctx: TreeRenderingContext): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];
    items.push(new IndexColumnsItem(element.connection, element.indexName, element.columns, element.expression));

    items.push(new IndexOperationItem('Drop index', 'drop', element.connection, element.indexName));
    if (element.inactive) {
        items.push(new IndexOperationItem('Make index active', 'activate', element.connection, element.indexName));
    } else {
        items.push(new IndexOperationItem('Make index inactive', 'deactivate', element.connection, element.indexName));
    }
    items.push(new IndexOperationItem('Recompute statistics for index', 'recompute', element.connection, element.indexName));
    return items;
}

export function getIndexColumnsChildren(element: IndexColumnsItem, _ctx: TreeRenderingContext): IndexColumnItem[] {
    if (element.expression) {
        return [new IndexColumnItem(element.connection, element.indexName, element.expression, 'computed')];
    }
    return element.columns.map((col, idx) =>
        new IndexColumnItem(element.connection, element.indexName, col, 'column', idx)
    );
}

export function getTriggerOperationChildren(element: TriggerItem, _ctx: TreeRenderingContext): (TriggerOperationItem | OperationItem)[] {
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
            return element.triggers as (TriggerItem | TriggerGroupItem)[];
        }
    }

    const triggers = element.triggers as Array<{ name: string; sequence: number; inactive: boolean }>;
    const sorted = triggers.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    return sorted.map(t => {
        const isFav = !!ctx.getFavorite(element.connection.id, t.name, 'trigger');
        return new TriggerItem(element.connection, t.name, t.sequence, t.inactive, isFav);
    });
}
