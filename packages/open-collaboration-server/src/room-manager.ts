// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable } from 'inversify';
import { BroadcastMessage, NotificationMessage, RequestMessage, isObject } from 'open-collaboration-rpc';
import { CredentialsManager } from './credentials-manager';
import { MessageRelay } from './message-relay';
import { Peer, Room, User, isUser } from './types';
import { JoinResponse, Messages } from 'open-collaboration-protocol';
import { Logger } from './utils/logging';

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

    @inject(MessageRelay)
    private readonly messageRelay: MessageRelay;

    @inject(CredentialsManager)
    protected readonly credentials: CredentialsManager;

    @inject(Symbol('Logger')) protected logger: Logger;

    protected rooms = new Map<string, Room>();
    protected peers = new Map<string, Room>();

    closeRoom(id: string): void {
        const room = this.rooms.get(id);
        if (room) {
            this.messageRelay.sendBroadcast(room.host, BroadcastMessage.create(Messages.Room.Closed, room.host.id));
            for (const peer of room.peers) {
                this.peers.delete(peer.id);
                peer.channel.close();
            }
            this.rooms.delete(id);
            this.logger.info(`Delete room with id: ${room.id}`);
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
        this.logger.info(`Prepared room [id: ${claim.room}] for user [id: ${user.id} | name: ${user.name} | email: ${user.email}]`)
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
            this.logger.info(`Created room with id: ${room.id}`);
            peer.channel.onClose(() => {
                this.closeRoom(room.id);
            });
        } else {
            room = this.rooms.get(roomId)!;
            if (!room) {
                throw this.logger.createErrorAndLog(`Could not find room to join from id: ${roomId}`);
            }
            this.peers.set(peer.id, room);
            room.guests.push(peer);
            this.logger.info(`From peer [id: ${peer.id}] peer user [id: ${peer.user.id} | name: ${peer.user.name} | email: ${peer.user.email}] joined room [id: ${room.id}]`)
            this.messageRelay.sendBroadcast(
                peer,
                BroadcastMessage.create(
                    Messages.Room.Joined,
                    peer.id,
                    [peer.toProtocol()]
                )
            );
            peer.channel.onClose(() => {
                this.messageRelay.sendBroadcast(
                    peer,
                    BroadcastMessage.create(
                        Messages.Room.Left,
                        peer.id,
                        [peer.toProtocol()]
                    )
                );
            });
        }
        this.messageRelay.sendNotification(
            peer,
            NotificationMessage.create(
                Messages.Peer.Info,
                '',
                peer.id,
                [peer.toProtocol()]
            )
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
            this.logger.info(`Request to join room [id: ${room.id}] by user [id: ${user.id} | name: ${user.name} | email: ${user.email}]`);
            const response = await this.messageRelay.sendRequest(
                room.host,
                RequestMessage.create(Messages.Peer.Join, this.credentials.secureId(), '', room.host.id, [user])
            ) as JoinResponse | undefined;
            if (response) {
                const claim: RoomClaim = {
                    room: room.id,
                    user: { ...user }
                };
                return {
                    jwt: await this.credentials.generateJwt(claim),
                    response
                };
            } else {
                throw this.logger.createErrorAndLog('Join request has been rejected');
            }
        } catch {
            throw this.logger.createErrorAndLog('Join request has timed out');
        }
    }

}
