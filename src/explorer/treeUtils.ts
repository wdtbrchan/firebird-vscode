/**
 * Generic helpers for nested tree structures with optional `children` arrays.
 * Used to consolidate the recursive find/remove/insert logic in FavoritesManager
 * and any other tree-shaped state stored in the explorer.
 */

// Self-referential constraint so children are typed as the same node type.
interface TreeNode<Self> {
    children?: Self[];
}

/**
 * Returns the first node matching `predicate` in the tree (depth-first).
 */
export function findInTree<T extends TreeNode<T>>(list: T[], predicate: (node: T) => boolean): T | undefined {
    for (const node of list) {
        if (predicate(node)) return node;
        if (node.children && node.children.length > 0) {
            const found = findInTree<T>(node.children, predicate);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Removes the first node matching `predicate` from the tree (depth-first).
 * Returns the removed node, or undefined if no match.
 */
export function removeFromTree<T extends TreeNode<T>>(list: T[], predicate: (node: T) => boolean): T | undefined {
    const idx = list.findIndex(predicate);
    if (idx !== -1) {
        const [removed] = list.splice(idx, 1);
        return removed;
    }
    for (const node of list) {
        if (node.children && node.children.length > 0) {
            const removed = removeFromTree<T>(node.children, predicate);
            if (removed) return removed;
        }
    }
    return undefined;
}

/**
 * Inserts `node` into the tree. If `parentPredicate` is given, inserts under
 * the first matching parent (creating its `children` array if necessary).
 * If parent is not found, falls back to root.
 * `index` controls placement in the target list (default = append).
 */
export function insertIntoTree<T extends TreeNode<T>>(
    list: T[],
    node: T,
    parentPredicate?: (node: T) => boolean,
    index?: number
): void {
    if (parentPredicate) {
        const parent = findInTree<T>(list, parentPredicate);
        if (parent) {
            if (!parent.children) parent.children = [];
            insertAt(parent.children, node, index);
            return;
        }
    }
    insertAt(list, node, index);
}

function insertAt<T>(list: T[], node: T, index?: number): void {
    if (index !== undefined && index >= 0 && index <= list.length) {
        list.splice(index, 0, node);
    } else {
        list.push(node);
    }
}
