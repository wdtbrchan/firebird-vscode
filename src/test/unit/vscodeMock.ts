
export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2
}

export class ThemeIcon {
    constructor(public readonly id: string, public readonly color?: any) {}
}

export class TreeItem {
    public label?: string;
    public collapsibleState?: TreeItemCollapsibleState;
    public contextValue?: string;
    public iconPath?: ThemeIcon | any;
    public description?: string;
    public tooltip?: string;
    public id?: string;
    public command?: any;

    constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

export const EventEmitter = class {
    fire() {}
    event = () => {};
};

export const Uri = {
    parse: (val: string) => ({ path: val }),
    file: (val: string) => ({ path: val })
};

export const window = {
    showErrorMessage: () => {},
    showInformationMessage: () => {},
    showInputBox: () => Promise.resolve(''),
    showQuickPick: () => Promise.resolve(undefined)
};
