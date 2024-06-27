// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Socket } from 'socket.io';
import * as ws from 'ws';
import { Disposable, Emitter, Encoding, EncryptedMessage, Event } from 'open-collaboration-rpc';

export interface Channel {
    onMessage(cb: (message: EncryptedMessage) => void): Disposable;
    sendMessage(message: EncryptedMessage): void;
    close(): void;
    onClose: Event<void>;
}

export class WebSocketChannel implements Channel {
    private onDidCloseEmitter = new Emitter<void>();

    get onClose(): Event<void> {
        return this.onDidCloseEmitter.event;
    }

    private _socket: ws.WebSocket;

    constructor(socket: ws.WebSocket) {
        this._socket = socket;
        this._socket.onclose = () => {
            this.onDidCloseEmitter.fire();
        };
    }

    onMessage(cb: (message: EncryptedMessage) => void): Disposable {
        const decode = (message: ArrayBuffer) => {
            const data = Encoding.decode(new Uint8Array(message)) as EncryptedMessage;
            cb(data);
        };
        this._socket.on('message', decode);
        return Disposable.create(() => {
            this._socket.off('message', decode);
        });
    }

    sendMessage(message: EncryptedMessage): void {
        const buffer = Encoding.encode(message);
        this._socket.send(buffer);
    }

    close(): void {
        this.onDidCloseEmitter.dispose();
        this._socket.close();
    }

}

export class SocketIoChannel implements Channel {

    private onDidCloseEmitter = new Emitter<void>();

    get onClose(): Event<void> {
        return this.onDidCloseEmitter.event;
    }

    private _socket: Socket;

    constructor(socket: Socket) {
        this._socket = socket;
        this._socket.on('disconnect', () => {
            this.onDidCloseEmitter.fire();
        });
    }

    onMessage(cb: (message: EncryptedMessage) => void): Disposable {
        const decode = (message: ArrayBuffer) => {
            const data = Encoding.decode(new Uint8Array(message)) as EncryptedMessage;
            cb(data);
        };
        this._socket.on('message', decode);
        return Disposable.create(() => {
            this._socket.off('message', decode);
        });
    }

    sendMessage(message: EncryptedMessage): void {
        const buffer = Encoding.encode(message);
        this._socket.send(buffer);
    }

    close(): void {
        this.onDidCloseEmitter.dispose();
        this._socket.disconnect(true);
    }
}
