import { ConnectionProvider } from "open-collaboration-protocol";
import * as vscode from 'vscode';
import { CollaborationInstance, CollaborationInstanceFactory } from "./collaboration-instance";
import { CollaborationUri } from "./utils/uri";
import { inject, injectable } from "inversify";
import { ExtensionContext } from "./inversify";
import { CollaborationConnectionProvider } from "./collaboration-connection-provider";

export const OCT_ROOM_ID = 'oct.roomId';
export const OCT_USER_TOKEN = 'oct.userToken';

@injectable()
export class CollaborationRoomService {

    @inject(ExtensionContext)
    private context: vscode.ExtensionContext;

    @inject(CollaborationConnectionProvider)
    private connectionProvider: CollaborationConnectionProvider;

    @inject(CollaborationInstanceFactory)
    private instanceFactory: CollaborationInstanceFactory;

    private readonly onDidJoinRoomEmitter = new vscode.EventEmitter<CollaborationInstance>();
    readonly onDidJoinRoom = this.onDidJoinRoomEmitter.event;

    async tryConnect(): Promise<CollaborationInstance | undefined> {
        const roomId = await this.context.secrets.get(OCT_ROOM_ID);
        // Instantly delete the room token - it will become invalid after the first connection attempt
        await this.context.secrets.delete(OCT_ROOM_ID);
        const connectionProvider = await this.connectionProvider.createConnection();

        if (connectionProvider && roomId) {
            const connection = await connectionProvider.connect(roomId);
            const instance = this.instanceFactory({
                connection,
                host: false,
                roomId: ''
            });
            await instance.initialize();
            this.onDidJoinRoomEmitter.fire(instance);
            return instance;
        }
        return undefined;
    }

    async createRoom(connectionProvider: ConnectionProvider): Promise<CollaborationInstance | undefined> {
        if (!connectionProvider) {
            return undefined;
        }
        const roomClaim = await connectionProvider.createRoom();
        if (roomClaim.loginToken) {
            const userToken = roomClaim.loginToken;
            await this.context.secrets.store(OCT_USER_TOKEN, userToken);
        }
        const connection = await connectionProvider.connect(roomClaim.roomToken);
        const instance = this.instanceFactory({
            connection,
            host: true,
            roomId: roomClaim.roomId
        });
        await instance.initialize();
        vscode.window.showInformationMessage(`Room ID: ${roomClaim.roomId}`, 'Copy to Clipboard').then(value => { 
            if (value === 'Copy to Clipboard') {
                vscode.env.clipboard.writeText(roomClaim.roomId);
            }
        });
        this.onDidJoinRoomEmitter.fire(instance);
        return instance;
    }
    
    async joinRoom(connectionProvider: ConnectionProvider, roomId?: string): Promise<void> {
        if (!roomId) {
            roomId = await vscode.window.showInputBox({ placeHolder: 'Enter the room ID' })
        }
        vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title: 'Joining Room'}, async () => {
            if (roomId && connectionProvider) {
                const roomClaim = await connectionProvider.joinRoom(roomId);
                if (roomClaim.loginToken) {
                    const userToken = roomClaim.loginToken;
                    await this.context.secrets.store(OCT_USER_TOKEN, userToken);
                }
                await this.context.secrets.store(OCT_ROOM_ID, roomClaim.roomToken);
                const workspaceFolders = (vscode.workspace.workspaceFolders ?? []);
                const workspace = roomClaim.workspace;
                const newFolders = workspace.folders.map(folder => ({
                    name: folder,
                    uri: CollaborationUri.create(workspace.name, folder)
                }));
                vscode.workspace.updateWorkspaceFolders(0, workspaceFolders.length, ...newFolders);
            }
        });
    }

}
