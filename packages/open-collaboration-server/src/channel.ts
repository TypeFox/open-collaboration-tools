// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Socket } from 'socket.io';
import * as ws from 'ws';
import { Disposable, Emitter, Event, Message, MessageEncoding } from 'open-collaboration-rpc';

export interface Channel {
    readonly encoding: MessageEncoding;
    onMessage(cb: (message: Message) => void): Disposable;
    sendMessage(message: Message): void;
    close(): void;
    onClose: Event<void>;
}

export class WebSocketChannel implements Channel {
    private onDidCloseEmitter = new Emitter<void>();

    get onClose(): Event<void> {
        return this.onDidCloseEmitter.event;
    }

    private _encoding: MessageEncoding;
    private _socket: ws.WebSocket;

    get encoding(): MessageEncoding {
        return this._encoding;
    }

    constructor(socket: ws.WebSocket, encoding: MessageEncoding) {
        this._encoding = encoding;
        this._socket = socket;
        this._socket.onclose = () => {
            this.onDidCloseEmitter.fire();
        };
    }

    onMessage(cb: (message: Message) => void): Disposable {
        const decode = (message: ArrayBuffer) => {
            const data = this.encoding.decode(message) as Message;
            cb(data);
        };
        this._socket.on('message', decode);
        return Disposable.create(() => {
            this._socket.off('message', decode);
        });
    }

    sendMessage(message: Message): void {
        const buffer = this.encoding.encode(message);
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

    private _encoding: MessageEncoding;
    private _socket: Socket;

    get encoding(): MessageEncoding {
        return this._encoding;
    }

    constructor(socket: Socket, encoding: MessageEncoding) {
        this._encoding = encoding;
        this._socket = socket;
        this._socket.on('disconnect', () => {
            this.onDidCloseEmitter.fire();
        });
    }

    onMessage(cb: (message: Message) => void): Disposable {
        const decode = (message: ArrayBuffer) => {
            const data = this.encoding.decode(message) as Message;
            cb(data);
        };
        this._socket.on('message', decode);
        return Disposable.create(() => {
            this._socket.off('message', decode);
        });
    }

    sendMessage(message: Message): void {
        const buffer = this.encoding.encode(message);
        this._socket.send(buffer);
    }

    close(): void {
        this.onDidCloseEmitter.dispose();
        this._socket.disconnect(true);
    }
}
