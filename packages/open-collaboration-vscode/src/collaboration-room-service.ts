// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import * as vscode from 'vscode';
import { ConnectionProvider, Peer, stringifyError } from 'open-collaboration-protocol';
import { CollaborationInstance, CollaborationInstanceFactory } from './collaboration-instance';
import { CollaborationUri } from './utils/uri';
import { inject, injectable } from 'inversify';
import { ExtensionContext } from './inversify';
import { CollaborationConnectionProvider, OCT_USER_TOKEN } from './collaboration-connection-provider';
import { localizeInfo } from './utils/l10n';

export const OCT_ROOM_DATA = 'oct.roomData';

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

    private tokenSource = new vscode.CancellationTokenSource();

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
            this.onDidJoinRoomEmitter.fire(instance);
            return instance;
        }
        return undefined;
    }

    async createRoom(connectionProvider: ConnectionProvider): Promise<void> {
        this.tokenSource.cancel();
        this.tokenSource = new vscode.CancellationTokenSource();
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Creating Session'), cancellable: true }, async (progress, cancelToken) => {
            const outerToken = this.tokenSource.token;
            try {
                const roomClaim = await connectionProvider.createRoom({
                    abortSignal: this.toAbortSignal(this.tokenSource.token, cancelToken),
                    reporter: info => progress.report({ message: localizeInfo(info) })
                });
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
                const copyToClipboard = vscode.l10n.t('Copy to Clipboard');
                const message = vscode.l10n.t('Created session {0}. Invitation code was automatically written to clipboard.', roomClaim.roomId);
                vscode.window.showInformationMessage(message, copyToClipboard).then(value => {
                    if (value === copyToClipboard) {
                        vscode.env.clipboard.writeText(roomClaim.roomId);
                    }
                });
                this.onDidJoinRoomEmitter.fire(instance);
            } catch (error) {
                this.showError(true, error, outerToken, cancelToken);
            }
        });
    }

    async joinRoom(connectionProvider: ConnectionProvider, roomId?: string): Promise<void> {
        if (!roomId) {
            roomId = await vscode.window.showInputBox({ placeHolder: vscode.l10n.t('Enter the invitation code') });
            if (!roomId) {
                return;
            }
        }
        this.tokenSource.cancel();
        this.tokenSource = new vscode.CancellationTokenSource();
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Joining Session'), cancellable: true }, async (progress, cancelToken) => {
            if (roomId) {
                const outerToken = this.tokenSource.token;
                try {
                    const roomClaim = await connectionProvider.joinRoom({
                        roomId,
                        reporter: info => progress.report({ message: localizeInfo(info) }),
                        abortSignal: this.toAbortSignal(outerToken, cancelToken)
                    });
                    if (roomClaim.loginToken) {
                        const userToken = roomClaim.loginToken;
                        await this.context.secrets.store(OCT_USER_TOKEN, userToken);
                    }
                    const roomData: RoomData = {
                        roomToken: roomClaim.roomToken,
                        roomId: roomClaim.roomId,
                        host: roomClaim.host
                    };
                    const roomDataJson = JSON.stringify(roomData);
                    await this.context.secrets.store(OCT_ROOM_DATA, roomDataJson);
                    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []);
                    const workspace = roomClaim.workspace;
                    const newFolders = workspace.folders.map(folder => ({
                        name: folder,
                        uri: CollaborationUri.create(workspace.name, folder)
                    }));
                    vscode.workspace.updateWorkspaceFolders(0, workspaceFolders.length, ...newFolders);
                } catch (error) {
                    this.showError(false, error, outerToken, cancelToken);
                }
            }
        });
    }

    private showError(create: boolean, error: unknown, outerToken: vscode.CancellationToken, innerToken: vscode.CancellationToken): void {
        if (outerToken.isCancellationRequested) {
            // The user already attempts to join another room
            // Simply ignore the error
            return;
        } else if (innerToken.isCancellationRequested) {
            // The user cancelled the operation
            // We simply show a notification
            vscode.window.showInformationMessage(vscode.l10n.t('Action was cancelled by the user'));
        } else if (create) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to create session: {0}', stringifyError(error, localizeInfo)));
        } else {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to join session: {0}', stringifyError(error, localizeInfo)));
        }
    }

    private toAbortSignal(...tokens: vscode.CancellationToken[]): AbortSignal {
        const controller = new AbortController();
        tokens.forEach(token => token.onCancellationRequested(() => controller.abort()));
        return controller.signal;
    }
}
