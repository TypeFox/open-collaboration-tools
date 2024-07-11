// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable, postConstruct } from 'inversify';
import { nanoid } from 'nanoid';
import * as protocol from 'open-collaboration-protocol';
import { Channel } from './channel';
import { MessageRelay } from './message-relay';
import { RoomManager } from './room-manager';
import { Peer, PeerInfo, Room, User } from './types';
import { CredentialsManager } from './credentials-manager';
import { Logger, LoggerSymbol } from './utils/logging';
import { parse } from 'semver';

export const PeerFactory = Symbol('PeerFactory');
export type PeerFactory = (info: PeerInfo) => Peer;

@injectable()
export class PeerImpl implements Peer {

    @inject(LoggerSymbol) protected logger: Logger;

    readonly id = nanoid(24);

    get jwt(): string {
        return this.peerInfo.jwt;
    }

    get publicKey(): string {
        return this.peerInfo.publicKey;
    }

    get client(): string {
        return this.peerInfo.client;
    }

    get supportedCompression(): string[] {
        return this.peerInfo.supportedCompression;
    }

    get user(): User {
        return this.peerInfo.user;
    }

    get host(): boolean {
        return this.peerInfo.host;
    }

    get room(): Room {
        const value = this.roomManager.getRoomByPeerId(this.id);
        if (!value) {
            throw this.logger.createErrorAndLog(`Peer '${this.id}' does not belong to any room`);
        }
        return value;
    }

    @inject(MessageRelay)
    private readonly messageRelay: MessageRelay;

    @inject(PeerInfo)
    private readonly peerInfo: PeerInfo;

    @inject(RoomManager)
    private readonly roomManager: RoomManager;

    @inject(CredentialsManager)
    private readonly credentials: CredentialsManager;

    private _channel?: Channel;
    private readonly onDisposeEmitter = new protocol.Emitter<void>();

    get onDispose(): protocol.Event<void> {
        return this.onDisposeEmitter.event;
    }

    get channel(): Channel {
        if (!this._channel) {
            throw new Error('Not initialized');
        }
        return this._channel;
    }

    @postConstruct()
    protected initialize(): void {
        this._channel = new Channel(this.peerInfo.channel);
        this._channel.onMessage(message => this.receiveMessage(message));
        this._channel.onClose(() => this.dispose());
    }

    private async receiveMessage(message: protocol.Message): Promise<void> {
        const messageVersion = parse(message.version);
        if (!messageVersion) {
            this.logger.warn(`Received message with invalid version: ${message.version}. Ignoring message.`);
            return;
        }
        if (!protocol.compatibleVersions(messageVersion)) {
            this.logger.warn(`Received message with incompatible version: ${message.version}; expected: ${protocol.VERSION}. Ignoring message.`);
            return;
        }
        if (protocol.ResponseMessage.isBinary(message) || protocol.ResponseErrorMessage.isBinary(message)) {
            this.messageRelay.pushResponse(this, message);
        } else if (protocol.RequestMessage.isBinary(message)) {
            // Override whatever we know about the origin of the message
            message.origin = this.id;
            try {
                const response = await this.messageRelay.sendRequest(this.getTargetPeer(message.target), message);
                // Adjust the response to the original message id
                response.id = message.id;
                this.channel.sendMessage(response);
            } catch (err) {
                const errorResponseMessage = protocol.ResponseErrorMessage.create(message.id, 'Failed to retrieve the requested data.');
                const symmetricKey = await this.credentials.getSymmetricKey();
                const encryptedError = await protocol.Encryption.encrypt(errorResponseMessage, { symmetricKey }, this.toEncryptionKey());
                this.channel.sendMessage(encryptedError);
            }
        } else if (protocol.NotificationMessage.isBinary(message)) {
            message.origin = this.id;
            if (message.target === '') {
                this.handleServerMessage(message);
                return;
            }
            try {
                this.messageRelay.sendNotification(this.getTargetPeer(message.target), message);
            } catch (error) {
                this.logger.error(`Failed sending notification to: ${message.target || '<empty>'}`);
            }
        } else if (protocol.BroadcastMessage.isBinary(message)) {
            this.messageRelay.sendBroadcast(this, message);
        }
    }

    private async handleServerMessage(notification: protocol.BinaryNotificationMessage): Promise<void> {
        try {
            const privateKey = await this.credentials.getPrivateKey();
            const decrypted = await protocol.Encryption.decrypt(notification, { privateKey });
            if (decrypted.content.method === protocol.Messages.Room.Leave.method) {
                this.dispose();
            } else {
                throw new Error('Unknown server message method: ' + decrypted.content.method);
            }
        } catch (err) {
            this.logger.error('Failed to handle server message', err)
        }
    }

    private getTargetPeer(targetId: string | undefined): Peer {
        const peer = targetId ? this.room.getPeer(targetId) : undefined;
        if (!peer) {
            throw this.logger.createErrorAndLog(`Could not find the target peer: ${targetId || '<empty>'}`);
        }
        return peer;
    }

    toProtocol(): protocol.Peer {
        return {
            id: this.id,
            host: this.host,
            name: this.user.name,
            email: this.user.email,
            metadata: {
                compression: {
                    supported: this.peerInfo.supportedCompression
                },
                encryption: {
                    publicKey: this.publicKey
                }
            }
        };
    }

    toEncryptionKey(): protocol.Encryption.AsymmetricKey {
        return {
            publicKey: this.publicKey,
            peerId: this.id,
            supportedCompression: this.supportedCompression
        };
    }

    dispose(): void {
        this.onDisposeEmitter.fire(undefined);
        this.onDisposeEmitter.dispose();
        this.logger.info(`Peer '${this.id}' disposed`);
    }
}
