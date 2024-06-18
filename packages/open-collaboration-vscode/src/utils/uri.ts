import * as vscode from 'vscode';

export namespace CollaborationUri {

    export const SCHEME = 'oct';

    export function create(workspace: string, path?: string): vscode.Uri {
        return vscode.Uri.parse(`${SCHEME}:///${workspace}${path ? '/' + path : ''}`);
    }

}
