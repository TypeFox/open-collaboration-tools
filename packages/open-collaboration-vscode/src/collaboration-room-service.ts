import { ConnectionProvider, Peer } from "open-collaboration-protocol";
import * as vscode from 'vscode';
import { CollaborationInstance, CollaborationInstanceFactory } from "./collaboration-instance";
import { CollaborationUri } from "./utils/uri";
import { inject, injectable } from "inversify";
import { ExtensionContext } from "./inversify";
import { CollaborationConnectionProvider } from "./collaboration-connection-provider";

export const OCT_ROOM_DATA = 'oct.roomData';
export const OCT_USER_TOKEN = 'oct.userToken';

interface RoomData {
    roomToken: string;
    roomId: string;
    host: Peer;
}

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
        const roomDataJson = await this.context.secrets.get(OCT_ROOM_DATA);
        // Instantly delete the room token - it will become invalid after the first connection attempt
        await this.context.secrets.delete(OCT_ROOM_DATA);
        const connectionProvider = await this.connectionProvider.createConnection();

        if (connectionProvider && roomDataJson) {
            const roomData: RoomData = JSON.parse(roomDataJson);
            const connection = await connectionProvider.connect(roomData.roomToken, roomData.host);
            const instance = this.instanceFactory({
                connection,
                host: false,
                roomId: roomData.roomId,
                hostId: roomData.host.id
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
        await vscode.env.clipboard.writeText(roomClaim.roomId);
        vscode.window.showInformationMessage(`Joined room '${roomClaim.roomId}'. ID was automatically written to clipboard.`, 'Copy to Clipboard').then(value => {
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
        vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Joining Room' }, async () => {
            if (roomId && connectionProvider) {
                const roomClaim = await connectionProvider.joinRoom(roomId);
                if (roomClaim.loginToken) {
                    const userToken = roomClaim.loginToken;
                    await this.context.secrets.store(OCT_USER_TOKEN, userToken);
                }
                const roomData: RoomData = {
                    roomToken: roomClaim.roomToken,
                    roomId: roomClaim.roomId,
                    host: roomClaim.host
                }
                const roomDataJson = JSON.stringify(roomData);
                await this.context.secrets.store(OCT_ROOM_DATA, roomDataJson);
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
