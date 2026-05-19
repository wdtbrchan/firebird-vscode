import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('Firebird SQL');
    }
    return channel;
}

function formatError(err: unknown): string {
    if (err instanceof Error) {
        return err.stack || err.message;
    }
    return String(err);
}

export const FirebirdLog = {
    info(message: string, _reveal: boolean = false): void {
        const out = getChannel();
        out.appendLine(`[${new Date().toISOString()}] ${message}`);
    },

    error(message: string, err?: unknown, _reveal: boolean = false): void {
        const out = getChannel();
        out.appendLine(`[${new Date().toISOString()}] ERROR ${message}`);
        if (err !== undefined) {
            out.appendLine(formatError(err));
        }
    },

    show(): void {
        getChannel().show(true);
    },

    dispose(): void {
        channel?.dispose();
        channel = undefined;
    }
};
