import * as monaco from 'monaco-editor';
import { ConnectionProvider } from 'open-collaboration-protocol';
import { JsonMessageEncoding, WebSocketTransportProvider } from 'open-collaboration-rpc';
import { CollaborationInstance } from './collaboration-instance';
import * as types from 'open-collaboration-protocol';
import { createRoom, joinRoom } from './collaboration-connection';

let connectionProvider: ConnectionProvider | undefined;
let userToken: string | undefined;
let instance: CollaborationInstance | undefined;

export type MonacoCollabCallbacks = {
        onRoomCreated?: (roomToken: string) => void;
        onRoomJoined?: (roomToken: string) => void;
        onUserRequestsAccess: (user: types.User) => Promise<boolean>;
        onUsersChanged: () => void;
}

export type MonacoCollabOptions = {
    serverUrl: string;
    userToken?: string;
    roomToken?: string;
    callbacks: MonacoCollabCallbacks;
};

export type MonacoCollabApi = {
    createRoom: () => Promise<CollaborationInstance | undefined>
    joinRoom: (roomToken: string) => Promise<types.JoinResponse | undefined>
}

export function monacoCollab(editor: monaco.editor.IStandaloneCodeEditor, options: MonacoCollabOptions): MonacoCollabApi {
    initializeConnection(options);

    const _createRoom = async () => {
        console.log('Creating room');

        if (!connectionProvider) {
            console.log('No OCT Server configured.');
            return;
        }

        return await createRoom(connectionProvider, options.callbacks, editor);
    }

    const _joinRoom = async (roomToken: string) => {
        console.log('Joining room', roomToken);

        if (!connectionProvider) {
            console.log('No OCT Server configured.');
            return;
        }

        const res = await joinRoom(connectionProvider, options.callbacks, editor, roomToken);
        if(!res || res.accessGranted === false) {
            console.log('Access denied:', res?.reason ?? 'No reason provided');
            return res;
        }

        return res;
    }

    return {
        createRoom: _createRoom,
        joinRoom: _joinRoom
    }

}


export function deactivate() {
    instance?.dispose();
}

async function initializeConnection(options: MonacoCollabOptions) {
    const serverUrl = options.serverUrl;
    userToken = options.userToken;
    if (serverUrl) {
        connectionProvider = createConnectionProvider(serverUrl);
    }
}

function createConnectionProvider(url: string): ConnectionProvider {
    return new ConnectionProvider({
        url,
        opener: (url) => window.open(url, '_blank'), // vscode.env.openExternal(vscode.Uri.parse(url)),
        transports: [WebSocketTransportProvider],
        encodings: [JsonMessageEncoding],
        userToken,
        fetch: async (url, options) => {
            const response = await fetch(url, options);
            return {
                status: response.status,
                json: async () => response.json(),
                text: async () => response.text()
            };
        }
    });
}

// function removeWorkspaceFolders() {
//     const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
//     if (workspaceFolders.length > 0) {
//         const newFolders: vscode.WorkspaceFolder[] = [];
//         for (const folder of workspaceFolders) {
//             if (folder.uri.scheme !== CollaborationUri.SCHEME) {
//                 newFolders.push(folder);
//             }
//         }
//         vscode.workspace.updateWorkspaceFolders(0, workspaceFolders.length, ...newFolders);
//     }
// }
