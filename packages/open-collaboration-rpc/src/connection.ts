// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { isObject } from "./utils/types";
import { MessageEncoding } from "./encoding";
import { BroadcastMessage, BroadcastType, ErrorMessage, Message, MessageTarget, NotificationMessage, NotificationType, RequestMessage, RequestType, ResponseErrorMessage, ResponseMessage } from "./messages";
import { MessageTransport } from "./transport";
import { Emitter, Event } from './utils/event';
import { Deferred } from "./utils/promise";

export type Handler<P extends unknown[], R = void> = (origin: string, ...parameters: P) => (R | Promise<R>);
export type ErrorHandler = (message: string) => void;

export interface BroadcastConnection {
    onRequest(type: string, handler: Handler<any[], any>): void;
    onRequest<P extends unknown[], R>(type: RequestType<P, R>, handler: Handler<P, R>): void;
    onNotification(type: string, handler: Handler<any[]>): void;
    onNotification<P extends unknown[]>(type: NotificationType<P>, handler: Handler<P>): void;
    onBroadcast(type: string, handler: Handler<any[]>): void;
    onBroadcast<P extends unknown[]>(type: BroadcastType<P>, handler: Handler<P>): void;
    onError(handler: ErrorHandler): void;
    sendRequest(type: string, ...parameters: any[]): Promise<any>;
    sendRequest<P extends unknown[], R>(type: RequestType<P, R>, ...parameters: P): Promise<R>;
    sendNotification(type: string, ...parameters: any[]): void;
    sendNotification<P extends unknown[]>(type: NotificationType<P>, ...parameters: P): void;
    sendBroadcast(type: string, ...parameters: any[]): void;
    sendBroadcast<P extends unknown[]>(type: BroadcastType<P>, ...parameters: P): void;
    dispose(): void;
    onDisconnect: Event<void>;
}

export interface RelayedRequest {
    id: string | number;
    response: Deferred<any>
    dispose(): void;
}

export class AbstractBroadcastConnection implements BroadcastConnection {

    protected messageHandlers = new Map<string, Handler<any[], any>>();
    protected onErrorEmitter = new Emitter<string>();
    protected onDisconnectEmitter = new Emitter<void>();

    get onError(): Event<string> {
        return this.onErrorEmitter.event;
    }

    get onDisconnect(): Event<void> {
        return this.onDisconnectEmitter.event;
    }

    protected requestMap = new Map<string | number, RelayedRequest>();
    protected requestId = 1;

    constructor(readonly encoding: MessageEncoding, readonly transport: MessageTransport) {
        transport.read((data: ArrayBuffer) => this.handleMessage(this.encoding.decode(data)));
        transport.onDisconnect(() => this.dispose());
    }

    dispose(): void {
        this.onDisconnectEmitter.fire();
        this.onDisconnectEmitter.dispose();
        this.onErrorEmitter.dispose();
        this.messageHandlers.clear();
        this.transport.dispose();
    }

    protected handleMessage(message: unknown): void {
        if (Message.is(message)) {
            if (ResponseMessage.is(message) || ResponseErrorMessage.is(message)) {
                const request = this.requestMap.get(message.id);
                if (request) {
                    if (ResponseMessage.is(message)) {
                        request.response.resolve(message.response);
                    } else {
                        request.response.reject(message.message);
                    }
                }
            } else if (RequestMessage.is(message)) {
                const handler = this.messageHandlers.get(message.method);
                if (!handler) {
                    console.error(`No handler registered for ${message.kind} method ${message.method}.`);
                    return;
                }
                try {
                    const result = handler(message.origin, ...(message.params ?? []));
                    Promise.resolve(result).then(value => {
                        const responseMessage = ResponseMessage.create(message.id, value);
                        this.write(responseMessage);
                    }, error => {
                        const responseErrorMessage = ResponseErrorMessage.create(message.id, error.message);
                        this.write(responseErrorMessage);
                    });
                } catch (error) {
                    if (isObject(error) && typeof error.message === 'string') {
                        const responseErrorMessage = ResponseErrorMessage.create(message.id, error.message);
                        this.write(responseErrorMessage);
                    }
                }
            } else if (BroadcastMessage.is(message) || NotificationMessage.is(message)) {
                const handler = this.messageHandlers.get(message.method);
                if (!handler) {
                    console.error(`No handler registered for ${message.kind} method ${message.method}.`);
                    return;
                }
                handler(message.origin, ...(message.params ?? []));
            } else if (ErrorMessage.is(message)) {
                this.onErrorEmitter.fire(message.message);
            }
        }
    }

    private write(message: unknown): void {
        this.transport.write(this.encoding.encode(message));
    }

    onRequest(type: string, handler: Handler<any[], any>): void;
    onRequest<P extends unknown[], R>(type: RequestType<P, R> | string, handler: Handler<P, R>): void;
    onRequest(type: RequestType<any[], any> | string, handler: Handler<any[], any>): void {
        const method = typeof type === 'string' ? type : type.method;
        this.messageHandlers.set(method, handler);
    }

    onNotification(type: string, handler: Handler<any[]>): void
    onNotification<P extends unknown[]>(type: NotificationType<P> | string, handler: Handler<P>): void
    onNotification(type: NotificationType<any[]> | string, handler: Handler<any[]>): void {
        const method = typeof type === 'string' ? type : type.method;
        this.messageHandlers.set(method, handler);
    }

    onBroadcast(type: BroadcastType<any[]> | string, handler: Handler<any[]>): void;
    onBroadcast(type: BroadcastType<any[]> | string, handler: Handler<any[]>): void;
    onBroadcast(type: BroadcastType<any[]> | string, handler: Handler<any[]>): void {
        const method = typeof type === 'string' ? type : type.method;
        this.messageHandlers.set(method, handler);
    }

    sendRequest(type: string, target: MessageTarget, ...parameters: any[]): Promise<any>;
    sendRequest<P extends unknown[], R>(type: RequestType<P, R> | string, target: MessageTarget, ...parameters: P): Promise<R>;
    sendRequest(type: RequestType<any, any> | string, target: MessageTarget, ...parameters: any[]): Promise<any> {
        const id = this.requestId++;
        const deferred = new Deferred<any>();
        const dispose = () => {
            this.requestMap.delete(id);
            clearTimeout(timeout);
            deferred.reject(new Error('Request timed out'));
        };
        const timeout = setTimeout(dispose, 60_000); // Timeout after one minute
        const relayedMessage: RelayedRequest = {
            id,
            response: deferred,
            dispose
        };
        this.requestMap.set(id, relayedMessage);
        const message = RequestMessage.create(type, id, '', target, parameters);
        this.write(message);
        return deferred.promise;
    }

    sendNotification(type: string, target: MessageTarget, ...parameters: any[]): void;
    sendNotification<P extends unknown[]>(type: NotificationType<P>, target: MessageTarget, ...parameters: P): void;
    sendNotification(type: NotificationType<any> | string, target: MessageTarget, ...parameters: any[]): void {
        const message = NotificationMessage.create(type, '', target, parameters);
        this.write(message);
    }

    sendBroadcast(type: string, ...parameters: any[]): void;
    sendBroadcast<P extends unknown[]>(type: BroadcastType<P>, ...parameters: P): void;
    sendBroadcast(type: BroadcastType<any> | string, ...parameters: any[]): void {
        const message = BroadcastMessage.create(type, '', parameters);
        this.write(message);
    }
}
