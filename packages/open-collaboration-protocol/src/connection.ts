// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { AbstractBroadcastConnection, BroadcastConnection, BroadcastHandler, Handler, MessageEncoding, MessageTransport } from 'open-collaboration-rpc';
import type * as types from './types';
import { Messages } from './messages';

export interface RoomHandler {
    onJoin(handler: BroadcastHandler<[types.Peer]>): void;
    onLeave(handler: BroadcastHandler<[types.Peer]>): void;
    onClose(handler: BroadcastHandler<[]>): void;
    onPermissions(handler: BroadcastHandler<[types.Permissions]>): void;
    updatePermissions(permissions: types.Permissions): void;
}

export interface PeerHandler {
    onJoinRequest(handler: Handler<[types.User], boolean>): void;
    onInfo(handler: Handler<[types.Peer]>): void;
    onInit(handler: Handler<[types.InitRequest], types.InitResponse>): void;
    init(request: types.InitRequest): Promise<types.InitResponse>;
}

export interface EditorHandler {
    onOpen(handler: Handler<[string]>): void;
    open(uri: string): void;
    onTextChanged(handler: BroadcastHandler<[types.EditorChange]>): void;
    textChanged(update: types.EditorChange): void;
    onPresenceUpdated(handler: BroadcastHandler<[types.EditorPresenceUpdate]>): void;
    presenceUpdated(presense: types.EditorPresenceUpdate): void;
    onPresenceRequest(handler: Handler<[types.EditorPresenceRequestParams], types.EditorFilePresence>): void;
    presenceRequest(params: types.EditorPresenceRequestParams): Promise<types.EditorFilePresence>;
}

export interface FileSystemHandler {
    onReadFile(handler: Handler<[string], string>): void;
    readFile(uri: string): Promise<string>;
    onWriteFile(handler: Handler<[string, string]>): void;
    writeFile(uri: string, content: string): Promise<void>;
    onStat(handler: Handler<[string], types.FileSystemStat>): void;
    stat(uri: string): Promise<types.FileSystemStat>;
    onMkdir(handler: Handler<[string]>): void;
    mkdir(uri: string): Promise<void>;
    onReaddir(handler: Handler<[string], types.FileSystemDirectory>): void;
    readdir(uri: string): Promise<types.FileSystemDirectory>;
    onDelete(handler: Handler<[string]>): void;
    delete(uri: string): Promise<void>;
    onRename(handler: Handler<[string, string]>): void;
    rename(from: string, to: string): Promise<void>;
    onChange(handler: BroadcastHandler<[types.FileChangeEvent]>): void;
    change(event: types.FileChangeEvent): void;
}

export interface ProtocolBroadcastConnection extends BroadcastConnection {
    room: RoomHandler;
    peer: PeerHandler;
    fs: FileSystemHandler;
    editor: EditorHandler;
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
        init: request => this.sendRequest(Messages.Peer.Init, request)
    };

    fs: FileSystemHandler = {
        onReadFile: handler => this.onRequest(Messages.FileSystem.ReadFile, handler),
        readFile: uri => this.sendRequest(Messages.FileSystem.ReadFile, uri),
        onWriteFile: handler => this.onRequest(Messages.FileSystem.WriteFile, handler),
        writeFile: (uri, content) => this.sendRequest(Messages.FileSystem.WriteFile, uri, content),
        onReaddir: handler => this.onRequest(Messages.FileSystem.ReadDir, handler),
        readdir: uri => this.sendRequest(Messages.FileSystem.ReadDir, uri),
        onStat: handler => this.onRequest(Messages.FileSystem.Stat, handler),
        stat: uri => this.sendRequest(Messages.FileSystem.Stat, uri),
        onMkdir: handler => this.onRequest(Messages.FileSystem.Mkdir, handler),
        mkdir: uri => this.sendRequest(Messages.FileSystem.Mkdir, uri),
        onDelete: handler => this.onRequest(Messages.FileSystem.Delete, handler),
        delete: uri => this.sendRequest(Messages.FileSystem.Delete, uri),
        onRename: handler => this.onRequest(Messages.FileSystem.Rename, handler),
        rename: (from, to) => this.sendRequest(Messages.FileSystem.Rename, from, to),
        onChange: handler => this.onBroadcast(Messages.FileSystem.Change, handler),
        change: event => this.sendBroadcast(Messages.FileSystem.Change, event)
    };

    editor: EditorHandler = {
        onOpen: handler => this.onNotification(Messages.Editor.Open, handler),
        open: uri => this.sendNotification(Messages.Editor.Open, uri),
        onTextChanged: handler => this.onBroadcast(Messages.Editor.TextChanged, handler),
        textChanged: editorUpdate => this.sendBroadcast(Messages.Editor.TextChanged, editorUpdate),
        onPresenceUpdated: handler => this.onBroadcast(Messages.Editor.PresenceUpdated, handler),
        presenceUpdated: presenceUpdate => this.sendBroadcast(Messages.Editor.PresenceUpdated, presenceUpdate),
        onPresenceRequest: handler => this.onRequest(Messages.Editor.PresenceRequest, handler),
        presenceRequest: requestParams => this.sendRequest(Messages.Editor.PresenceRequest, requestParams)
    };
}
