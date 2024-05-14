// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable, postConstruct } from 'inversify';
import { nanoid } from 'nanoid';
import * as protocol from 'open-collaboration-protocol';
import { BroadcastMessage, Message, NotificationMessage, RequestMessage, ResponseErrorMessage, ResponseMessage } from 'open-collaboration-rpc';
import { Channel } from './channel';
import { MessageRelay } from './message-relay';
import { RoomManager } from './room-manager';
import { Peer, PeerInfo, Room, User } from './types';

export const PeerFactory = Symbol('PeerFactory');
export type PeerFactory = (info: PeerInfo) => Peer;

@injectable()
export class PeerImpl implements Peer {

    readonly id = nanoid(24);

    get user(): User {
        return this.peerInfo.user;
    }

    get host(): boolean {
        return this.peerInfo.host;
    }

    get channel(): Channel {
        return this.peerInfo.channel;
    }

    get room(): Room {
        const value = this.roomManager.getRoomByPeerId(this.id);
        if (!value) {
            throw new Error("This peer doesn't belong to any room");
        }
        return value;
    }

    @inject(MessageRelay)
    private readonly messageRelay: MessageRelay;

    @inject(PeerInfo)
    private readonly peerInfo: PeerInfo;

    @inject(RoomManager)
    private readonly roomManager: RoomManager;

    @postConstruct()
    protected init(): void {
        this.channel.onMessage(message => this.receiveMessage(message));
    }

    private async receiveMessage(message: Message): Promise<void> {
        if (ResponseMessage.is(message) || ResponseErrorMessage.is(message)) {
            this.messageRelay.pushResponse(this, message);
        } else if (RequestMessage.is(message)) {
            // Override whatever we know about the origin of the message
            message.origin = this.id;
            try {
                // If no target is specified, the host is the default target
                const peer = message.target ? this.room.getPeer(message.target) : this.room.host;
                if (!peer) {
                    throw new Error('Could not find the target peer: ' + message.target);
                }
                const response = await this.messageRelay.sendRequest(peer, message);
                const responseMessage: ResponseMessage = {
                    id: message.id,
                    version: message.version,
                    kind: 'response',
                    response
                };
                this.channel.sendMessage(responseMessage);
            } catch (err) {
                const errorResponseMessage = ResponseErrorMessage.create(message.id, 'err.message');
                this.channel.sendMessage(errorResponseMessage);
            }
        } else if (NotificationMessage.is(message)) {
            message.origin = this.id;
            const target = message.target ? this.room.getPeer(message.target) : this.room.host;
            if (!target) {
                throw new Error('Could not find the target peer: ' + message.target);
            }
            this.messageRelay.sendNotification(target, message);
        } else if (BroadcastMessage.is(message)) {
            this.messageRelay.sendBroadcast(this, message);
        }
    }

    toProtocol(): protocol.Peer {
        return {
            id: this.id,
            host: this.host,
            name: this.user.name,
            email: this.user.email
        };
    }
}
