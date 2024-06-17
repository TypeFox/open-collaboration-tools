import { ConnectionProvider } from "open-collaboration-protocol";
import { CollaborationInstance } from "./collaboration-instance";
import { MonacoCollabCallbacks } from "./monaco-api";
import * as monaco from 'monaco-editor';

export async function createRoom(connectionProvider: ConnectionProvider, callbacks: MonacoCollabCallbacks, editor: monaco.editor.IStandaloneCodeEditor): Promise<CollaborationInstance | undefined> {
    if (!connectionProvider) {
        return undefined;
    }
    const roomClaim = await connectionProvider.createRoom();
    if (roomClaim.loginToken) {
        const userToken = roomClaim.loginToken;
        console.log('User Token:', userToken);
        // TODO store user token somewhere
        // await context.secrets.store('oct.userToken', userToken);
    }
    const connection = await connectionProvider.connect(roomClaim.roomToken);
    const instance = new CollaborationInstance(connection, true, callbacks, editor, roomClaim.roomId);
    connection.onDisconnect(() => {
        instance?.dispose();
    });

    console.log('Room ID:', roomClaim.roomId);
    // TODO show room ID in a notification and offer possibility to copy it to clipboard
    // vscode.window.showInformationMessage(`Room ID: ${roomClaim.roomId}`, 'Copy to Clipboard').then(value => { 
    //     if (value === 'Copy to Clipboard') {
    //         vscode.env.clipboard.writeText(roomClaim.roomId);
    //     }
    // });

    return instance;
}

export async function joinRoom(connectionProvider: ConnectionProvider, roomId?: string): Promise<void> {
    if (!roomId) {
        console.log('No room ID provided');
        // TODO show input box to enter the room ID
        // roomId = await vscode.window.showInputBox({ placeHolder: 'Enter the room ID' })
    }
    // vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title: 'Joining Room'}, async () => {
        if (roomId && connectionProvider) {
            const roomClaim = await connectionProvider.joinRoom(roomId);
            if (roomClaim.loginToken) {
                const userToken = roomClaim.loginToken;
                console.log('joinRoom -> User Token:', userToken);
                // TODO store user token somewhere
                // await context.secrets.store('oct.userToken', userToken);
            }
            // TODO store room token somewhere
            // await context.secrets.store('oct.roomToken', roomClaim.roomToken);
            // const workspaceFolders = (vscode.workspace.workspaceFolders ?? []);
            const workspace = roomClaim.workspace;
            // const newFolders = workspace.folders.map(folder => ({
            //     name: folder,
            //     uri: URL.parse(workspace.name, folder)
            // }));
            console.log('Workspace:', workspace);
            // vscode.workspace.updateWorkspaceFolders(0, workspaceFolders.length, ...newFolders);
        }
    // });
}
