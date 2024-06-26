// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable } from 'inversify';
import { BroadcastMessage, Encryption, NotificationMessage, RequestMessage, isObject } from 'open-collaboration-rpc';
import { CredentialsManager } from './credentials-manager';
import { MessageRelay } from './message-relay';
import { Peer, Room, User, isUser } from './types';
import { JoinResponse, Messages } from 'open-collaboration-protocol';

export interface PreparedRoom {
    id: string
    jwt: string;
}

export interface RoomClaim {
    room: string
    user: User
    host?: boolean
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

    async closeRoom(id: string): Promise<void> {
        const room = this.rooms.get(id);
        if (room) {
            const broadcastMessage = BroadcastMessage.create(Messages.Room.Closed, room.host.id);
            const encryptedMessage = await Encryption.encrypt(broadcastMessage, room.host.publicKey);
            this.messageRelay.sendBroadcast(room.host, encryptedMessage);
            for (const peer of room.peers) {
                this.peers.delete(peer.id);
                peer.channel.close();
            }
            this.rooms.delete(id);
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
            host: true
        };
        const jwt = await this.credentials.generateJwt(claim);
        return {
            id,
            jwt
        };
    }

    async join(peer: Peer, roomId: string): Promise<Room> {
        let room: Room;
        if (peer.host) {
            room = new Room(roomId, peer, []);
            this.rooms.set(room.id, room);
            this.peers.set(peer.id, room);
            console.log('Created room with id', room.id);
            peer.channel.onClose(() => {
                this.closeRoom(room.id);
            });
        } else {
            room = this.rooms.get(roomId)!;
            if (!room) {
                throw new Error('Could not find room to join');
            }
            const broadcastMessage = BroadcastMessage.create(Messages.Room.Joined, '', [peer.toProtocol()]);
            const allKeys = [room.host, ...room.guests].map(peer => peer.publicKey);
            this.peers.set(peer.id, room);
            room.guests.push(peer);
            if (allKeys.length > 0) {
                try {
                    const encryptedMessage = await Encryption.encrypt(broadcastMessage, ...allKeys);
                    this.messageRelay.sendBroadcast(
                        peer,
                        encryptedMessage
                    );
                } catch (err) {
                    console.error('Failed to send join broadcast', err);
                }
            }
            peer.channel.onClose(async () => {
                const allPeerKeys = [room.host, ...room.guests].map(peer => peer.publicKey);
                if (allPeerKeys.length > 0) {
                    try {
                        const broadcastMessage = BroadcastMessage.create(Messages.Room.Left, '', [peer.toProtocol()]);
                        const encryptedMessage = await Encryption.encrypt(broadcastMessage, ...allPeerKeys);
                        this.messageRelay.sendBroadcast(
                            peer,
                            encryptedMessage
                        );
                    } catch (err) {
                        console.error('Failed to send leave broadcast', err);
                    }
                }
            });
        }
        const infoNotification = NotificationMessage.create(
            Messages.Peer.Info,
            '',
            peer.id,
            [peer.toProtocol()]
        );
        const encryptedInfo = await Encryption.encrypt(infoNotification, peer.publicKey);
        this.messageRelay.sendNotification(
            peer,
            encryptedInfo
        );
        return room;
    }

    getRoomById(id: string): Room | undefined {
        return this.rooms.get(id);
    }

    getRoomByPeerId(id: string): Room | undefined {
        return this.peers.get(id);
    }

    async requestJoin(room: Room, user: User): Promise<{ jwt: string, response: JoinResponse }> {
        try {
            const privateKey = await this.credentials.getPrivateKey();
            const requestMessage = RequestMessage.create(Messages.Peer.Join, this.credentials.secureId(), '', room.host.id, [user]);
            const encryptedRequest = await Encryption.encrypt(requestMessage, room.host.publicKey);
            const response = await this.messageRelay.sendRequest(
                room.host,
                encryptedRequest
            );
            const decryptedResponse = await Encryption.decrypt({ content: response }, privateKey);
            if (decryptedResponse.content) {
                const joinResponse = decryptedResponse.content as JoinResponse;
                const claim: RoomClaim = {
                    room: room.id,
                    user: { ...user }
                };
                return {
                    jwt: await this.credentials.generateJwt(claim),
                    response: joinResponse
                };
            } else {
                throw new Error('Join request has been rejected');
            }
        } catch {
            throw new Error('Join request has timed out');
        }
    }

}
