// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { ConnectionProvider, MaybePromise, ProtocolBroadcastConnection } from 'open-collaboration-protocol';
import { StdioCommunicationHandler } from './communication-handler';
import { FromDaeomonMessage, JoinRoomRequest, LoginResponse, SendBroadcast, SendNotification, SendRequest, SessionCreated, ToDaemonMessage } from './messages';

export class MessageHandler {

    protected handlers = new Map<string, (message: ToDaemonMessage) => MaybePromise<void | FromDaeomonMessage>>(
        [
            ['login', () => this.login()],
            ['join-room', message => this.joinRoom(message as JoinRoomRequest)],
            ['create-room', () => this.createRoom()],
            ['send-broadcast', message => this.currentConnection?.sendBroadcast((message as SendBroadcast).broadcast.type, (message as SendBroadcast).broadcast.parameters)],
            ['send-request', message => this.currentConnection?.sendRequest((message as SendRequest).request.type, (message as SendRequest).request.parameters)],
            ['send-notification', message => this.currentConnection?.sendNotification((message as SendNotification).notification.type, (message as SendNotification).notification.parameters)]
        ]
    );

    protected currentConnection?: ProtocolBroadcastConnection;

    constructor(private connectionProvider: ConnectionProvider, private communcationHandler: StdioCommunicationHandler) {
        communcationHandler.onMessage(async message => {
            const resp = await this.handlers.get(message.kind)?.(message);
            if (resp) {
                this.communcationHandler.sendMessage(resp);
            }
        });
    }

    async login(): Promise<LoginResponse> {
        const authToken = await this.connectionProvider.login({ });
        return {
            kind: 'login',
            authToken
        };
    }

    async joinRoom(message: JoinRoomRequest): Promise<SessionCreated> {
        const resp = await this.connectionProvider.joinRoom({ roomId: message.room});
        this.currentConnection = await this.connectionProvider.connect(resp.roomToken, resp.host);
        return {
            kind: 'session',
            info: {
                roomToken: resp.roomToken,
                roomId: resp.roomId
            }
        };
    }

    async createRoom(): Promise<SessionCreated> {
        const resp = await this.connectionProvider.createRoom({});
        this.currentConnection = await this.connectionProvider.connect(resp.roomToken);
        return {
            kind: 'session',
            info: {
                roomToken: resp.roomToken,
                roomId: resp.roomId
            }
        };
    }
}