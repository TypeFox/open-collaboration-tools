import * as vscode from 'vscode';

export function showQuickPick(quickPick: vscode.QuickPick<vscode.QuickPickItem>): Promise<number> {
    return new Promise((resolve) => {
        quickPick.show();
        quickPick.onDidAccept(() => {
            resolve(quickPick.items.indexOf(quickPick.activeItems[0]));
            quickPick.hide();
        });
        quickPick.onDidHide(() => {
            resolve(-1);
        });
    });
}
