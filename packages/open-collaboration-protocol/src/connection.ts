// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { AbstractBroadcastConnection, BroadcastConnection, Handler, MessageTarget, MessageTransport, Encryption } from 'open-collaboration-rpc';
import type * as types from './types';
import { Messages } from './messages';

export interface RoomHandler {
    onJoin(handler: Handler<[types.Peer]>): void;
    onLeave(handler: Handler<[types.Peer]>): void;
    onClose(handler: Handler<[]>): void;
    onPermissions(handler: Handler<[types.Permissions]>): void;
    updatePermissions(permissions: types.Permissions): void;
}

export interface PeerHandler {
    onJoinRequest(handler: Handler<[types.User], types.JoinResponse | undefined>): void;
    onInfo(handler: Handler<[types.Peer]>): void;
    onInit(handler: Handler<[types.InitData]>): void;
    init(target: MessageTarget, data: types.InitData): void;
}

export interface EditorHandler {
    onOpen(handler: Handler<[string]>): void;
    open(target: MessageTarget, path: types.Path): void;
    onClose(handler: Handler<[types.Path]>): void;
    close(path: types.Path): void;
}

export interface FileSystemHandler {
    onReadFile(handler: Handler<[types.Path], types.FileData>): void;
    readFile(target: MessageTarget, path: types.Path): Promise<types.FileData>;
    onWriteFile(handler: Handler<[types.Path, string]>): void;
    writeFile(target: MessageTarget, path: types.Path, content: string): Promise<void>;
    onStat(handler: Handler<[types.Path], types.FileSystemStat>): void;
    stat(target: MessageTarget, path: types.Path): Promise<types.FileSystemStat>;
    onMkdir(handler: Handler<[types.Path]>): void;
    mkdir(target: MessageTarget, path: types.Path): Promise<void>;
    onReaddir(handler: Handler<[types.Path], types.FileSystemDirectory>): void;
    readdir(target: MessageTarget, path: types.Path): Promise<types.FileSystemDirectory>;
    onDelete(handler: Handler<[types.Path]>): void;
    delete(target: MessageTarget, path: types.Path): Promise<void>;
    onRename(handler: Handler<[types.Path, types.Path]>): void;
    rename(target: MessageTarget, from: types.Path, to: types.Path): Promise<void>;
    onChange(handler: Handler<[types.FileChangeEvent]>): void;
    change(event: types.FileChangeEvent): void;
}

export interface SyncHandler {
    onDataUpdate(handler: Handler<[types.Binary]>): void;
    dataUpdate(data: types.Binary): void;
    dataUpdate(target: MessageTarget, data: types.Binary): void;
    onAwarenessUpdate(handler: Handler<[types.Binary]>): void;
    awarenessUpdate(data: types.Binary): void;
    awarenessUpdate(target: MessageTarget, data: types.Binary): void;
    onAwarenessQuery(handler: Handler<[]>): void;
    awarenessQuery(): void;
}

export interface ProtocolBroadcastConnection extends BroadcastConnection {
    room: RoomHandler;
    peer: PeerHandler;
    fs: FileSystemHandler;
    editor: EditorHandler;
    sync: SyncHandler;
}

export interface ProtocolBroadcastConnectionOptions {
    privateKey: string;
    publicServerKey: string;
    host?: types.Peer;
    transport: MessageTransport;
}

export function createConnection(options: ProtocolBroadcastConnectionOptions): ProtocolBroadcastConnection {
    return new ProtocolBroadcastConnectionImpl(options);
}

const EMTPY_HANDLER = () => { };

export class ProtocolBroadcastConnectionImpl extends AbstractBroadcastConnection {

    room: RoomHandler = {
        onJoin: handler => this.onBroadcast(Messages.Room.Joined, (origin, peer) => {
            this.onDidJoinRoom(peer);
            handler(origin, peer);
        }),
        onLeave: handler => this.onBroadcast(Messages.Room.Left, (origin, peer) => {
            this.onDidLeaveRoom(peer);
            handler(origin, peer);
        }),
        onClose: handler => this.onBroadcast(Messages.Room.Closed, (origin) => {
            this.onDidClose();
            handler(origin);
        }),
        onPermissions: handler => this.onBroadcast(Messages.Room.PermissionsUpdated, handler),
        updatePermissions: permissions => this.sendBroadcast(Messages.Room.PermissionsUpdated, permissions)
    };

    peer: PeerHandler = {
        onJoinRequest: handler => this.onRequest(Messages.Peer.Join, handler),
        onInfo: handler => this.onNotification(Messages.Peer.Info, handler),
        onInit: handler => this.onNotification(Messages.Peer.Init, async (origin, response) => {
            this.onDidInit(response);
            handler(origin, response);
        }),
        init: (target, request) => this.sendNotification(Messages.Peer.Init, target, request)
    };

    fs: FileSystemHandler = {
        onReadFile: handler => this.onRequest(Messages.FileSystem.ReadFile, handler),
        readFile: (target, path) => this.sendRequest(Messages.FileSystem.ReadFile, target, path),
        onWriteFile: handler => this.onRequest(Messages.FileSystem.WriteFile, handler),
        writeFile: (target, path, content) => this.sendRequest(Messages.FileSystem.WriteFile, target, path, content),
        onReaddir: handler => this.onRequest(Messages.FileSystem.ReadDir, handler),
        readdir: (target, path) => this.sendRequest(Messages.FileSystem.ReadDir, target, path),
        onStat: handler => this.onRequest(Messages.FileSystem.Stat, handler),
        stat: (target, path) => this.sendRequest(Messages.FileSystem.Stat, target, path),
        onMkdir: handler => this.onRequest(Messages.FileSystem.Mkdir, handler),
        mkdir: (target, path) => this.sendRequest(Messages.FileSystem.Mkdir, target, path),
        onDelete: handler => this.onRequest(Messages.FileSystem.Delete, handler),
        delete: (target, path) => this.sendRequest(Messages.FileSystem.Delete, target, path),
        onRename: handler => this.onRequest(Messages.FileSystem.Rename, handler),
        rename: (target, from, to) => this.sendRequest(Messages.FileSystem.Rename, target, from, to),
        onChange: handler => this.onBroadcast(Messages.FileSystem.Change, handler),
        change: event => this.sendBroadcast(Messages.FileSystem.Change, event)
    };

    editor: EditorHandler = {
        onOpen: handler => this.onNotification(Messages.Editor.Open, handler),
        open: (target, path) => this.sendNotification(Messages.Editor.Open, target, path),
        onClose: handler => this.onBroadcast(Messages.Editor.Close, handler),
        close: path => this.sendBroadcast(Messages.Editor.Close, path)
    };

    sync: SyncHandler = {
        onDataUpdate: handler => {
            this.onBroadcast(Messages.Sync.DataUpdate, handler);
            this.onNotification(Messages.Sync.DataNotify, handler);
        },
        dataUpdate: (target: string | undefined | types.Binary, data?: types.Binary) => {
            if (typeof target === 'object') {
                this.sendBroadcast(Messages.Sync.DataUpdate, target);
            } else {
                this.sendNotification(Messages.Sync.DataNotify, target, data);
            }
        },
        onAwarenessUpdate: handler => {
            this.onBroadcast(Messages.Sync.AwarenessUpdate, handler);
            this.onNotification(Messages.Sync.AwarenessNotify, handler);
        },
        awarenessUpdate: (target: string | undefined | types.Binary, data?: types.Binary) => {
            if (typeof target === 'object') {
                this.sendBroadcast(Messages.Sync.AwarenessUpdate, target);
            } else {
                this.sendNotification(Messages.Sync.AwarenessNotify, target, data);
            }
        },
        onAwarenessQuery: handler => this.onBroadcast(Messages.Sync.AwarenessQuery, handler),
        awarenessQuery: () => this.sendBroadcast(Messages.Sync.AwarenessQuery)
    };

    // Track peers manually for their public encryption keys
    private peers = new Map<string, types.Peer>();

    constructor(options: ProtocolBroadcastConnectionOptions) {
        super({
            privateKey: options.privateKey,
            publicKey: options.publicServerKey
        }, options.transport);
        if (options.host) {
            this.onDidJoinRoom(options.host);
        } else {
            this.ready();
        }
        // Ensure that the peer handlers are called
        this.room.onJoin(EMTPY_HANDLER);
        this.room.onLeave(EMTPY_HANDLER);
        this.room.onClose(EMTPY_HANDLER);
        this.peer.onInit(EMTPY_HANDLER);
    }

    protected override getPublicKey(origin: string): Encryption.AsymmetricKey {
        if (origin === '') {
            return {
                peerId: '',
                publicKey: this.keys.publicKey,
                supportedCompression: ['none']
            };
        }
        const peer = this.peers.get(origin);
        if (peer) {
            return {
                peerId: peer.id,
                publicKey: peer.metadata.encryption.publicKey,
                supportedCompression: peer.metadata.compression.supported
            };
        } else {
            throw new Error('No public key found for origin ' + origin);
        }
    }

    private onDidJoinRoom(peer: types.Peer): void {
        this.peers.set(peer.id, peer);
    }

    private onDidLeaveRoom(peer: types.Peer): void {
        this.peers.delete(peer.id);
    }

    private onDidClose(): void {
        this.peers.clear();
    }

    private onDidInit(response: types.InitData): void {
        for (const peer of [response.host, ...response.guests]) {
            this.peers.set(peer.id, peer);
        }
        this.ready();
    }

    protected override getPublicKeys(): Encryption.AsymmetricKey[] {
        return Array.from(this.peers.values()).map(peer => ({
            peerId: peer.id,
            publicKey: peer.metadata.encryption.publicKey,
            supportedCompression: peer.metadata.compression.supported
        }));
    }
}
