// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Socket, io } from 'socket.io-client';
import { Emitter, Event } from '../common/utils';
import { MessageTransport, MessageTransportProvider } from '../common';

export const SocketIoTransportProvider: MessageTransportProvider = {
    id: 'socket-io',
    createTransport: (url, headers) => {
        const socket = io(url + '/socket-io', {
            extraHeaders: headers
        });
        const transport = new SocketIoTransport(socket);
        return transport;
    }
};

export class SocketIoTransport implements MessageTransport {

    readonly id = 'socket-io';

    private onDisconnectEmitter = new Emitter<void>();

    get onDisconnect(): Event<void> {
        return this.onDisconnectEmitter.event;
    }

    constructor(protected socket: Socket) {
        this.socket.on('disconnect', () => this.onDisconnectEmitter.fire());
    }

    write(data: ArrayBuffer): void {
        this.socket.emit('message', data);
    }

    read(cb: (data: ArrayBuffer) => void): void {
        this.socket.on('message', cb);
    }

    dispose(): void {
        this.onDisconnectEmitter.dispose();
        this.socket.close();
    }
}
