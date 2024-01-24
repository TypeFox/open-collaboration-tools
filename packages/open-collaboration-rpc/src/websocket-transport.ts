// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Emitter, Event, Deferred } from './utils';
import { MessageTransport, MessageTransportProvider } from './transport';

export const WebSocketTransportProvider: MessageTransportProvider = {
    id: 'websocket',
    createTransport: (url, headers) => {
        if (url.startsWith('https')) {
            url = url.replace('https', 'wss');
        } else if (url.startsWith('http')) {
            url = url.replace('http', 'ws');
        }
        const protocols = Object.entries(headers).map(([key, value]) => `${key}+${value}`);
        const socket = new WebSocket(url + '/websocket', protocols);
        socket.binaryType = 'arraybuffer';
        const transport = new WebSocketTransport(socket);
        return transport;
    }
};

export class WebSocketTransport implements MessageTransport {

    readonly id = 'websocket';

    private onDisconnectEmitter = new Emitter<void>();
    private ready = new Deferred();

    get onDisconnect(): Event<void> {
        return this.onDisconnectEmitter.event;
    }

    constructor(protected socket: WebSocket) {
        this.socket.onclose = () => this.onDisconnectEmitter.fire();
        this.socket.onopen = () => this.ready.resolve();
    }

    write(data: ArrayBuffer): void {
        this.ready.promise.then(() => this.socket.send(data));
    }

    read(cb: (data: ArrayBuffer) => void): void {
        this.socket.onmessage = event => cb(event.data);
    }

    dispose(): void {
        this.onDisconnectEmitter.dispose();
        this.socket.close();
    }
}
