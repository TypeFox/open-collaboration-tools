// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Channel } from './channel';
import * as protocol from 'open-collaboration-protocol';
import { isObject } from 'open-collaboration-rpc';

export interface Room {
    id: string;
    host: Peer;
    guests: Peer[];
    readonly peers: readonly Peer[];
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
    channel: Channel;
}

export interface Peer {
    id: string;
    user: User;
    channel: Channel;
    room: Room;
    toProtocol(): protocol.Peer
}

export type Permissions = Record<string, string>;
