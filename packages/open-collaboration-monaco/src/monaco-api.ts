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
    joinRoom: (roomToken: string) => Promise<void>
}

export function monacoCollab(editor: monaco.editor.IStandaloneCodeEditor, options: MonacoCollabOptions): MonacoCollabApi {
    initializeConnection(options, editor).then(value => {
        if (value) {
            instance = value;
            enter();
        } else {
            // removeWorkspaceFolders();
        }
    });

    const _createRoom = async () => {
        console.log('Creating room');

        if (!connectionProvider) {
            console.log('No OCT Server configured.');
            return;
        }

        return createRoom(connectionProvider, options.callbacks, editor);
    }

    const _joinRoom = async (roomToken: string) => {
        console.log('Joining room', roomToken);

        if (!connectionProvider) {
            console.log('No OCT Server configured.');
            return;
        }

        return joinRoom(connectionProvider, roomToken);
    }

    return {
        createRoom: _createRoom,
        joinRoom: _joinRoom
    }

}


export function deactivate() {
    instance?.dispose();
}

function enter () {
    if (!connectionProvider) {
        console.log('No OCT Server configured.');
    } else if (instance) {
        // const quickPick = vscode.window.createQuickPick();
        // quickPick.placeholder = 'Select collaboration option';
        // const items: vscode.QuickPickItem[] = [
        //     { label: '$(close) Close Current Session' },
        // ];
        // if (instance.host) {
        //     items.push({ label: '$(copy) Copy Room Token' });
        // }
        // quickPick.items = items;
        // const index = await showQuickPick(quickPick);
        // if(index === 0) {
        //     instance.dispose();
        //     statusBarItem.text = '$(live-share) OCT';
        //     instance = undefined;
        //     vscode.workspace.updateWorkspaceFolders(0, vscode.workspace.workspaceFolders?.length ?? 0);
        // } else if(index === 1) {
            // vscode.env.clipboard.writeText(instance.roomToken ?? '');
            // vscode.window.showInformationMessage(`Room Token ${instance.roomToken} copied to clipboard`);
        // }
    } else {
        // const quickPick = vscode.window.createQuickPick();
        // quickPick.placeholder = 'Select collaboration option';
        // quickPick.items = [
        //     { label: '$(add) Create New Collaboration Session' },
        //     { label: '$(vm-connect) Join Collaboration Session' }
        // ];
        // const index = await showQuickPick(quickPick);
        // if (index === 0) {
        //     if (instance = await createRoom(context, connectionProvider)) {
        //         statusBarItem.text = '$(broadcast) OCT Shared';
        //     }
        // } else if (index === 1) {
        //     await joinRoom(context, connectionProvider);
        // }
    }
}

async function initializeConnection(options: MonacoCollabOptions, editor: monaco.editor.IStandaloneCodeEditor): Promise<CollaborationInstance | undefined> {
    const serverUrl = options.serverUrl;
    userToken = options.userToken;
    if (serverUrl) {
        connectionProvider = createConnectionProvider(serverUrl);
        const roomToken = options.roomToken;
        if (roomToken) {
            const connection = await connectionProvider.connect(roomToken);
            const instance = new CollaborationInstance(connection, false, options.callbacks, editor);
            connection.onDisconnect(() => {
                instance?.dispose();
            });
            await instance.initialize();
            return instance;
        }
    }
    return undefined;
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