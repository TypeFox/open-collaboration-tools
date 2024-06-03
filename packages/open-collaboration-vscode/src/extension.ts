import * as vscode from 'vscode';
import { ConnectionProvider } from 'open-collaboration-protocol';
import { JsonMessageEncoding, WebSocketTransportProvider } from 'open-collaboration-rpc';
import { WebSocket } from 'ws';
import { CollaborationInstance } from './collaboration-instance';
import fetch from 'node-fetch';

(global as any).WebSocket = WebSocket;

let connectionProvider: ConnectionProvider | undefined;
let instance: CollaborationInstance | undefined;
let userToken: string | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const serverUrl = vscode.workspace.getConfiguration().get<string>('oct.serverUrl');
    userToken = await context.secrets.get('oct.userToken');

    if (serverUrl) {
        connectionProvider = createConnectionProvider(serverUrl);
        const roomToken = await context.secrets.get('oct.roomToken');
        if (roomToken) {
            await context.secrets.delete('oct.roomToken');
            const connection = await connectionProvider.connect(roomToken);
            instance = new CollaborationInstance(connection, false);
            connection.onDisconnect(() => {
                instance?.dispose();
            });
            context.subscriptions.push(await instance.initialize());
            vscode.window.showInformationMessage(`Joined Room: ${roomToken}`);
        }
    } else {
        await context.secrets.delete('oct.roomToken');
        vscode.window.showInformationMessage('No OCT Server configured. Please set the server URL in the settings', 'Open Settings').then((selection) => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'oct.serverUrl');
            }
        });
    }

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('oct.serverUrl')) {
            const newUrl = vscode.workspace.getConfiguration().get<string>('oct.serverUrl')
            connectionProvider = newUrl ? createConnectionProvider(newUrl) : undefined;
        }
    }));


    context.subscriptions.push(
        vscode.commands.registerCommand('oct.login', () => {
            connectionProvider?.login();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('oct.create-room', async () => {
            if (!connectionProvider) {
                return;
            }
            const roomClaim = await connectionProvider.createRoom();
            if (roomClaim.loginToken) {
                userToken = roomClaim.loginToken;
                await context.secrets.store('oct.userToken', userToken);
            }
            const connection = await connectionProvider.connect(roomClaim.roomToken);
            instance = new CollaborationInstance(connection, true);
            vscode.window.showInformationMessage(`Created Room: ${roomClaim.roomId}`);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('oct.join-room', async () => {
            const roomId = await vscode.window.showInputBox({ placeHolder: 'Enter the room ID' })
            if (roomId && connectionProvider) {
                const roomClaim = await connectionProvider.joinRoom(roomId);
                if (roomClaim.loginToken) {
                    userToken = roomClaim.loginToken;
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
        })
    );
}

export function deactivate() {
}

function createConnectionProvider(url: string): ConnectionProvider {
    return new ConnectionProvider({
        url,
        opener: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
        transports: [WebSocketTransportProvider],
        encodings: [JsonMessageEncoding],
        userToken,
        fetch
    });
}