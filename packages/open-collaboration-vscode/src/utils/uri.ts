// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import * as vscode from 'vscode';

export namespace CollaborationUri {

    export const SCHEME = 'oct';

    export function create(workspace: string, path?: string): vscode.Uri {
        return vscode.Uri.parse(`${SCHEME}:///${workspace}${path ? '/' + path : ''}`);
    }

}
