// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable } from 'inversify';
import { CredentialsManager } from './credentials-manager';
import { MessageRelay } from './message-relay';
import { Peer, Room, User, isUser } from './types';
import { JoinResponse, Messages, BroadcastMessage, Encryption, NotificationMessage, RequestMessage, ResponseMessage, isObject } from 'open-collaboration-protocol';
import { Logger, LoggerSymbol } from './utils/logging';

export interface PreparedRoom {
    id: string;
    jwt: string;
}

export interface RoomClaim {
    room: string;
    roomClock: number;
    user: User;
    host?: boolean;
}

export function isRoomClaim(obj: unknown): obj is RoomClaim {
    return isObject<RoomClaim>(obj) && typeof obj.room === 'string' && isUser(obj.user);
}

@injectable()
export class RoomManager {

    protected rooms = new Map<string, Room>();
    protected peers = new Map<string, Room>();

    @inject(MessageRelay)
    private readonly messageRelay: MessageRelay;

    @inject(CredentialsManager)
    protected readonly credentials: CredentialsManager;

    @inject(LoggerSymbol) protected logger: Logger;

    async closeRoom(id: string): Promise<void> {
        const room = this.getRoomById(id);
        if (room) {
            const symmetricKey = await this.credentials.getSymmetricKey();
            const broadcastMessage = BroadcastMessage.create(Messages.Room.Closed, '');
            const allKeys = room.peers.map(peer => peer.toEncryptionKey());
            const encryptedMessage = await Encryption.encrypt(broadcastMessage, { symmetricKey }, ...allKeys);
            this.messageRelay.sendBroadcast(room.host, encryptedMessage);
            for (const peer of room.peers) {
                this.peers.delete(peer.id);
                peer.channel.close();
            }
            this.rooms.delete(id);
            this.logger.info(`Deleted room '${room.id}'`);
        }
    }

    async prepareRoom(user: User): Promise<PreparedRoom> {
        const id = this.credentials.secureId();
        const claim: RoomClaim = {
            room: id,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            },
            host: true,
            roomClock: 0
        };
        this.logger.info(`Prepared room [id: '${claim.room}'] for user [provider: '${user.authProvider || '<none>'}' | id: '${user.id}' | name: '${user.name}' | email: '${user.email || '<none>'}']`)
        const jwt = await this.credentials.generateJwt(claim);
        return {
            id,
            jwt
        };
    }

    async join(peer: Peer, roomId: string): Promise<Room> {
        const symmetricKey = await this.credentials.getSymmetricKey();
        let room: Room;
        if (peer.host) {
            room = new Room(roomId, peer, []);
            this.rooms.set(room.id, room);
            this.peers.set(peer.id, room);
            peer.onDispose(() => {
                this.closeRoom(room.id);
            });
            this.logger.info(`Host [id: '${peer.id}' | client: '${peer.client}' | userId: '${peer.user.id}' | name: '${peer.user.name}' | email: '${peer.user.email || '<none>'}'] created room [id: '${room.id}']`);
        } else {
            room = this.rooms.get(roomId)!;
            if (!room) {
                throw this.logger.createErrorAndLog(`Could not find room to join from id: ${roomId}`);
            }
            const broadcastMessage = BroadcastMessage.create(Messages.Room.Joined, '', [peer.toProtocol()]);
            const allKeys = room.peers.map(peer => peer.toEncryptionKey());
            this.peers.set(peer.id, room);
            room.guests.push(peer);
            this.logger.info(`Peer [id: '${peer.id}' | client: '${peer.client}' | userId: '${peer.user.id}' | name: '${peer.user.name}' | email: '${peer.user.email || '<none>'}'] joined room [id: '${room.id}']`);
            if (allKeys.length > 0) {
                try {
                    const encryptedMessage = await Encryption.encrypt(broadcastMessage, { symmetricKey }, ...allKeys);
                    this.messageRelay.sendBroadcast(
                        peer,
                        encryptedMessage
                    );
                } catch (err) {
                    this.logger.error('Failed to send join broadcast', err);
                }
            }
            peer.onDispose(() => {
                this.leaveRoom(peer);
            });
        }
        // Send the identity info to the user (i.e. what the user needs to know about itself)
        const infoNotification = NotificationMessage.create(
            Messages.Peer.Info,
            '',
            peer.id,
            [peer.toProtocol()]
        );
        const encryptedInfo = await Encryption.encrypt(infoNotification, { symmetricKey }, peer.toEncryptionKey());
        this.messageRelay.sendNotification(
            peer,
            encryptedInfo
        );
        return room;
    }

    async leaveRoom(peer: Peer): Promise<void> {
        const room = this.getRoomByPeerId(peer.id);
        if (!room) {
            return;
        }
        if (peer.host) {
            this.closeRoom(room.id);
        } else {
            const symmetricKey = await this.credentials.getSymmetricKey();
            const otherPeerKeys = room.peers
                .filter(roomPeer => roomPeer.id !== peer.id)
                .map(roomPeer => roomPeer.toEncryptionKey());
            if (otherPeerKeys.length > 0) {
                try {
                    const broadcastMessage = BroadcastMessage.create(Messages.Room.Left, '', [peer.toProtocol()]);
                    const encryptedMessage = await Encryption.encrypt(broadcastMessage, { symmetricKey }, ...otherPeerKeys);
                    this.messageRelay.sendBroadcast(
                        peer,
                        encryptedMessage
                    );
                } catch (err) {
                    this.logger.error('Failed to send leave broadcast', err);
                }
            }
            // Remove the peer from the room as the last step
            this.peers.delete(peer.id);
            room.removeGuest(peer.id);
        }
    }

    getRoomById(id: string): Room | undefined {
        return this.rooms.get(id);
    }

    getRoomByPeerId(id: string): Room | undefined {
        return this.peers.get(id);
    }

    async requestJoin(room: Room, user: User): Promise<{ jwt: string, response: JoinResponse } | string> {
        try {
        	this.logger.info(`Request to join room [id: '${room.id}'] by user [id: '${user.id}' | name: '${user.name}' | email: '${user.email ?? '<none>'}']`);
            const symmetricKey = await this.credentials.getSymmetricKey();
            const privateKey = await this.credentials.getPrivateKey();
            const requestMessage = RequestMessage.create(Messages.Peer.Join, this.credentials.secureId(), '', room.host.id, [user]);
            const encryptedRequest = await Encryption.encrypt(requestMessage, { symmetricKey }, room.host.toEncryptionKey());
            const response = await this.messageRelay.sendRequest(
                room.host,
                encryptedRequest
            );
            const decryptedResponse = await Encryption.decrypt(response, { privateKey });
            if (ResponseMessage.is(decryptedResponse)) {
                const joinResponse = decryptedResponse.content as JoinResponse;
                if (joinResponse === undefined) {
                    return 'Join request has been rejected';
                }
                const claim: RoomClaim = {
                    room: room.id,
                    user: { ...user },
                    // Increment the clock to identify unique sessions
                    // If a user joins a room multiple times, the clock will be incremented
                    // This way, they get a new JWT for each session
                    // If a user reconnects using an old JWT, we can identify a reconnect attempt
                    roomClock: ++room.clock
                };
                return {
                    jwt: await this.credentials.generateJwt(claim),
                    response: joinResponse
                };
            } else {
                return 'Join request has failed';
            }
        } catch {
            return 'Join request has timed out';
        }
    }

}
