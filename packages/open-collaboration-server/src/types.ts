// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Channel } from './channel';
import * as protocol from 'open-collaboration-protocol';
import { Encryption, isObject } from 'open-collaboration-rpc';

export class Room {
    constructor(public id: string, public host: Peer, public guests: Peer[]) {
    }

    get peers(): Peer[] {
        return [this.host, ...this.guests];
    }

    getPeer(id: string): Peer | undefined {
        return this.peers.find(peer => peer.id === id);
    }

    removeGuest(id: string): void {
        this.guests = this.guests.filter(peer => peer.id !== id);
    }
}

export interface User {
    id: string;
    name: string;
    email?: string;
}

export function isUser(obj: unknown): obj is User {
    return isObject<User>(obj) && typeof obj.id === 'string' && typeof obj.name === 'string';
}

export const PeerInfo = Symbol('PeerInfo');

export interface PeerInfo {
    user: User;
    host: boolean;
    publicKey: string;
    supportedCompression: string[];
    channel: Channel;
}

export interface Peer {
    id: string;
    host: boolean;
    user: User;
    channel: Channel;
    room: Room;
    toProtocol(): protocol.Peer
    toEncryptionKey(): Encryption.AsymmetricKey
}

export type Permissions = Record<string, string>;
