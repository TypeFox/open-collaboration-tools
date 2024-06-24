import * as vscode from 'vscode';
import { CollaborationUri } from './uri';

export function removeWorkspaceFolders() {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length > 0) {
        const newFolders: vscode.WorkspaceFolder[] = [];
        for (const folder of workspaceFolders) {
            if (folder.uri.scheme !== CollaborationUri.SCHEME) {
                newFolders.push(folder);
            }
        }
        if (newFolders.length !== workspaceFolders.length) {
            vscode.workspace.updateWorkspaceFolders(0, workspaceFolders.length, ...newFolders);
        }
    }
}

export async function closeSharedEditors(): Promise<void> {
    await vscode.window.tabGroups.close(
        vscode.window.tabGroups.all
            .flatMap(group => group.tabs)
            .filter(tab => (tab.input as { uri: vscode.Uri })?.uri?.scheme === CollaborationUri.SCHEME)
    )
}
