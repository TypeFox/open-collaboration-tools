// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { AbstractBroadcastConnection, BroadcastConnection, Handler, MessageEncoding, MessageTarget, MessageTransport } from 'open-collaboration-rpc';
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
    onJoinRequest(handler: Handler<[types.User], boolean>): void;
    onInfo(handler: Handler<[types.Peer]>): void;
    onInit(handler: Handler<[types.InitRequest], types.InitResponse>): void;
    init(target: MessageTarget, request: types.InitRequest): Promise<types.InitResponse>;
}

export interface EditorHandler {
    onOpen(handler: Handler<[string]>): void;
    open(target: MessageTarget, path: types.Path): void;
    onClose(handler: Handler<[types.Path]>): void;
    close(path: types.Path): void;
}

export interface FileSystemHandler {
    onReadFile(handler: Handler<[string], string>): void;
    readFile(target: MessageTarget, path: string): Promise<string>;
    onWriteFile(handler: Handler<[string, string]>): void;
    writeFile(target: MessageTarget, path: string, content: string): Promise<void>;
    onStat(handler: Handler<[string], types.FileSystemStat>): void;
    stat(target: MessageTarget, path: string): Promise<types.FileSystemStat>;
    onMkdir(handler: Handler<[string]>): void;
    mkdir(target: MessageTarget, path: string): Promise<void>;
    onReaddir(handler: Handler<[string], types.FileSystemDirectory>): void;
    readdir(target: MessageTarget, path: string): Promise<types.FileSystemDirectory>;
    onDelete(handler: Handler<[string]>): void;
    delete(target: MessageTarget, path: string): Promise<void>;
    onRename(handler: Handler<[string, string]>): void;
    rename(target: MessageTarget, from: string, to: string): Promise<void>;
    onChange(handler: Handler<[types.FileChangeEvent]>): void;
    change(event: types.FileChangeEvent): void;
}

export interface SyncHandler {
    onDataUpdate(handler: Handler<[string]>): void;
    dataUpdate(data: string): void;
    dataUpdate(target: MessageTarget, data: string): void;
    onAwarenessUpdate(handler: Handler<[string]>): void;
    awarenessUpdate(data: string): void;
    awarenessUpdate(target: MessageTarget, data: string): void;
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

export function createConnection(transport: MessageTransport, encoding: MessageEncoding): ProtocolBroadcastConnection {
    return new ProtocolBroadcastConnectionImpl(encoding, transport);
}

export class ProtocolBroadcastConnectionImpl extends AbstractBroadcastConnection {

    room: RoomHandler = {
        onJoin: handler => this.onBroadcast(Messages.Room.Joined, handler),
        onLeave: handler => this.onBroadcast(Messages.Room.Left, handler),
        onClose: handler => this.onBroadcast(Messages.Room.Closed, handler),
        onPermissions: handler => this.onBroadcast(Messages.Room.PermissionsUpdated, handler),
        updatePermissions: permissions => this.sendBroadcast(Messages.Room.PermissionsUpdated, permissions)
    };

    peer: PeerHandler = {
        onJoinRequest: handler => this.onRequest(Messages.Peer.Join, handler),
        onInfo: handler => this.onNotification(Messages.Peer.Info, handler),
        onInit: handler => this.onRequest(Messages.Peer.Init, handler),
        init: (target, request) => this.sendRequest(Messages.Peer.Init, target, request)
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
        dataUpdate: (target: string, data?: string) => {
            if (data === undefined) {
                this.sendBroadcast(Messages.Sync.DataUpdate, target);
            } else {
                this.sendNotification(Messages.Sync.DataNotify, target, data);
            }
        },
        onAwarenessUpdate: handler => {
            this.onBroadcast(Messages.Sync.AwarenessUpdate, handler);
            this.onNotification(Messages.Sync.AwarenessNotify, handler);
        },
        awarenessUpdate: (target: string, data?: string) => {
            if (data === undefined) {
                this.sendBroadcast(Messages.Sync.AwarenessUpdate, target);
            } else {
                this.sendNotification(Messages.Sync.AwarenessNotify, target, data);
            }
        },
        onAwarenessQuery: handler => this.onBroadcast(Messages.Sync.AwarenessQuery, handler),
        awarenessQuery: () => this.sendBroadcast(Messages.Sync.AwarenessQuery)
    };
}
