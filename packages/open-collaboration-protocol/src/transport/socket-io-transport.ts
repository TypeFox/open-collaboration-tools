// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Emitter, Event, Deferred } from '../utils';
import { MessageTransport, MessageTransportProvider } from './transport';
import { io, Socket } from 'socket.io-client';

export const SocketIoTransportProvider: MessageTransportProvider = {
    id: 'socket.io',
    createTransport: (url, headers) => {
        const socket = io(url, {
            extraHeaders: headers
        });
        const transport = new SocketIoTransport(socket);
        return transport;
    }
};

export class SocketIoTransport implements MessageTransport {

    readonly id = 'socket.io';

    private onDisconnectEmitter = new Emitter<void>();
    private onErrorEmitter = new Emitter<string>();
    private ready = new Deferred();

    get onDisconnect(): Event<void> {
        return this.onDisconnectEmitter.event;
    }

    get onError(): Event<string> {
        return this.onErrorEmitter.event;
    }

    constructor(protected socket: Socket) {
        this.socket.on('disconnect', () => this.onDisconnectEmitter.fire());
        this.socket.on('error', () => this.onErrorEmitter.fire('Websocket connection closed unexpectedly.'));
        this.socket.on('connect', () => this.ready.resolve());
    }

    write(data: ArrayBuffer): void {
        this.ready.promise.then(() => this.socket.send(data));
    }

    read(cb: (data: ArrayBuffer) => void): void {
        this.socket.on('message', data => cb(data));
    }

    dispose(): void {
        this.onDisconnectEmitter.dispose();
        this.socket.close();
    }
}
