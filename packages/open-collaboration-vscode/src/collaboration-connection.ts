import { ConnectionProvider } from "open-collaboration-protocol";
import * as vscode from 'vscode';
import { CollaborationInstance } from "./collaboration-instance";

export async function createRoom(context: vscode.ExtensionContext, connectionProvider: ConnectionProvider): Promise<CollaborationInstance | undefined> {
    if (!connectionProvider) {
        return undefined;
    }
    const roomClaim = await connectionProvider.createRoom();
    if (roomClaim.loginToken) {
        const userToken = roomClaim.loginToken;
        await context.secrets.store('oct.userToken', userToken);
    }
    const connection = await connectionProvider.connect(roomClaim.roomToken);
    const instance = new CollaborationInstance(connection, true);
    connection.onDisconnect(() => {
        instance?.dispose();
    });
    return instance;
}

export async function joinRoom(context: vscode.ExtensionContext, connectionProvider: ConnectionProvider, roomId?: string): Promise<void> {
    if (!roomId) {
        roomId = await vscode.window.showInputBox({ placeHolder: 'Enter the room ID' })
    }
    if (roomId && connectionProvider) {
        const roomClaim = await connectionProvider.joinRoom(roomId);
        if (roomClaim.loginToken) {
            const userToken = roomClaim.loginToken;
            await context.secrets.store('oct.userToken', userToken);
        }
        await context.secrets.store('oct.roomToken', roomClaim.roomToken);
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []);
        const workspace = roomClaim.workspace;
        const newFolders = workspace.folders.map(folder => ({
            name: folder,
            uri: vscode.Uri.parse(`collab:/${workspace.name}/${folder}`)
        }));
        vscode.workspace.updateWorkspaceFolders(0, workspaceFolders.length, ...newFolders);
    }
}
