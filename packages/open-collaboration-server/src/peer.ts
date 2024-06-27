// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable, postConstruct } from 'inversify';
import { nanoid } from 'nanoid';
import * as protocol from 'open-collaboration-protocol';
import { BroadcastMessage, EncryptedResponseMessage, Encryption, Message, NotificationMessage, RequestMessage, ResponseErrorMessage, ResponseMessage } from 'open-collaboration-rpc';
import { Channel } from './channel';
import { MessageRelay } from './message-relay';
import { RoomManager } from './room-manager';
import { Peer, PeerInfo, Room, User } from './types';

export const PeerFactory = Symbol('PeerFactory');
export type PeerFactory = (info: PeerInfo) => Peer;

@injectable()
export class PeerImpl implements Peer {

    readonly id = nanoid(24);

    get publicKey(): string {
        return this.peerInfo.publicKey;
    }

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
        if (ResponseMessage.isEncrypted(message) || ResponseErrorMessage.isEncrypted(message)) {
            this.messageRelay.pushResponse(this, message);
        } else if (RequestMessage.isEncrypted(message)) {
            // Override whatever we know about the origin of the message
            message.origin = this.id;
            try {
                const response = await this.messageRelay.sendRequest(this.getTargetPeer(message.target), message);
                const responseMessage: EncryptedResponseMessage = {
                    id: message.id,
                    version: message.version,
                    kind: 'response',
                    content: response
                };
                this.channel.sendMessage(responseMessage);
            } catch (err) {
                const errorResponseMessage = ResponseErrorMessage.create(message.id, 'Failed to retrieve the requested data.');
                const encryptedError = await Encryption.encrypt(errorResponseMessage, this.publicKey);
                this.channel.sendMessage(encryptedError);
            }
        } else if (NotificationMessage.isEncrypted(message)) {
            message.origin = this.id;
            try {
                this.messageRelay.sendNotification(this.getTargetPeer(message.target), message);
            } catch (err) {
                console.error(`Failed sending notification to: ${message.target}`, err);
            }
        } else if (BroadcastMessage.isEncrypted(message)) {
            this.messageRelay.sendBroadcast(this, message);
        }
    }

    private getTargetPeer(targetId: string | undefined): Peer {
        const peer = targetId ? this.room.getPeer(targetId) : undefined;
        if (!peer) {
            throw new Error(`Could not find the target peer: ${targetId}`);
        }
        return peer;
    }

    toProtocol(): protocol.Peer {
        return {
            id: this.id,
            host: this.host,
            name: this.user.name,
            publicKey: this.publicKey,
            email: this.user.email
        };
    }
}
