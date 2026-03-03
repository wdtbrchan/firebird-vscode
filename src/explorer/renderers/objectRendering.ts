import * as vscode from 'vscode';
import { TreeRenderingContext } from '../treeRendering';
import { ObjectItem } from '../treeItems/databaseItems';
import { OperationItem } from '../treeItems/operationItems';
import { TableIndexesItem } from '../treeItems/indexItems';
import { TableTriggersItem } from '../treeItems/triggerItems';
import { MetadataService } from '../../services/metadataService';

export async function getObjectOperationChildren(element: ObjectItem, ctx: TreeRenderingContext): Promise<(OperationItem | TableTriggersItem | TableIndexesItem)[]> {
    const ops: (OperationItem | TableTriggersItem | TableIndexesItem)[] = [];
    
    if (element.type === 'table') {
        ops.push(new OperationItem('Create Script', 'create', element));
        ops.push(new OperationItem('Alter Script', 'alter', element));
        ops.push(new OperationItem('Drop table', 'drop', element));
        ops.push(new TableIndexesItem(element.connection, element.objectName));
        ops.push(new TableTriggersItem(element.connection, element.objectName, ctx.getTriggerViewMode(element.connection.id, element.objectName)));
    } else if (['view', 'trigger', 'procedure'].includes(element.type)) {
        ops.push(new OperationItem('DDL Script', 'alter', element));
        
        if (element.type === 'view') {
                ops.push(new OperationItem('Recreate Script', 'recreate', element));
                ops.push(new OperationItem('Drop view', 'drop', element));
        } else if (element.type === 'procedure') {
                ops.push(new OperationItem('Drop procedure', 'drop', element));
        }
    } else {
        ops.push(new OperationItem('Create Script', 'create', element));
        ops.push(new OperationItem('Alter Script', 'alter', element));
    }

    if (element.type === 'generator') {
            ops.push(new OperationItem('Drop generator', 'drop', element));
            try {
                const val = await MetadataService.getGeneratorValue(element.connection, element.label);
                ops.push(new OperationItem(`Value: ${val}`, 'info', element));
            } catch(e) {
                ops.push(new OperationItem(`Value: Error`, 'info', element));
            }
    }

    return ops;
}
