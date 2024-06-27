// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { isObject } from "./utils/types";
import { BroadcastMessage, BroadcastType, EncryptedBroadcastMessage, EncryptedErrorMessage, EncryptedNotificationMessage, EncryptedRequestMessage, EncryptedResponseErrorMessage, EncryptedResponseMessage, ErrorMessage, MessageTarget, NotificationMessage, NotificationType, RequestMessage, RequestType, ResponseErrorMessage, ResponseMessage } from "./messages";
import { MessageTransport } from "./transport";
import { Emitter, Event } from './utils/event';
import { Deferred } from "./utils/promise";
import { Encryption } from "./encryption";
import { Encoding } from "./encoding";

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
    onConnectionError: Event<string>;
}

export interface RelayedRequest {
    id: string | number;
    response: Deferred<any>
    dispose(): void;
}

export abstract class AbstractBroadcastConnection implements BroadcastConnection {

    protected messageHandlers = new Map<string, Handler<any[], any>>();
    protected onErrorEmitter = new Emitter<string>();
    protected onDisconnectEmitter = new Emitter<void>();
    protected onConnectionErrorEmitter = new Emitter<string>();

    get onError(): Event<string> {
        return this.onErrorEmitter.event;
    }

    get onDisconnect(): Event<void> {
        return this.onDisconnectEmitter.event;
    }

    get onConnectionError(): Event<string> {
        return this.onConnectionErrorEmitter.event;
    }

    protected requestMap = new Map<string | number, RelayedRequest>();
    protected requestId = 1;

    constructor(readonly keys: Encryption.KeyPair, readonly transport: MessageTransport) {
        transport.read(data => this.handleMessage(new Uint8Array(data)));
        transport.onDisconnect(() => this.dispose());
        transport.onError(message => {
            this.onConnectionErrorEmitter.fire(message);
            this.dispose();
        });
    }

    dispose(): void {
        this.onDisconnectEmitter.fire();
        this.onDisconnectEmitter.dispose();
        this.onErrorEmitter.dispose();
        this.messageHandlers.clear();
        this.transport.dispose();
    }

    protected async handleMessage(data: Uint8Array): Promise<void> {
        const message = Encoding.decode(data);
        if (ResponseMessage.isEncrypted(message)) {
            const request = this.requestMap.get(message.id);
            try {
                const decrypted = await Encryption.decrypt(message, this.keys.privateKey);
                if (request) {
                    request.response.resolve(decrypted.content);
                }
            } catch (err) {
                console.error(`Failed to handle response message`, err);
                request?.response.reject(err);
            }
        } else if (ResponseErrorMessage.isEncrypted(message)) {
            const request = this.requestMap.get(message.id);
            try {
                const decrypted = await Encryption.decrypt(message, this.keys.privateKey);
                if (request) {
                    request.response.reject(decrypted.content.message);
                }
            } catch (err) {
                console.error(`Failed to handle response error message`, err);
                request?.response.reject(err);
            }
        } else if (RequestMessage.isEncrypted(message)) {
            try {
                const decrypted = await Encryption.decrypt(message, this.keys.privateKey);
                const handler = this.messageHandlers.get(decrypted.content.method);
                if (!handler) {
                    console.error(`No handler registered for ${decrypted.kind} method ${decrypted.content.method}.`);
                    return;
                }
                try {
                    const result = handler(decrypted.origin, ...(decrypted.content.params ?? []));
                    Promise.resolve(result).then(async value => {
                        const responseMessage = ResponseMessage.create(decrypted.id, value);
                        const publicKey = this.getPublicKey(decrypted.origin);
                        const encryptedResponseMessage = await Encryption.encrypt(responseMessage, publicKey);
                        this.write(encryptedResponseMessage);
                    }, async error => {
                        const responseErrorMessage = ResponseErrorMessage.create(decrypted.id, error.message);
                        const publicKey = this.getPublicKey(decrypted.origin);
                        const encryptedResponseErrorMessage = await Encryption.encrypt(responseErrorMessage, publicKey);
                        this.write(encryptedResponseErrorMessage);
                    });
                } catch (error) {
                    if (isObject(error) && typeof error.message === 'string') {
                        const responseErrorMessage = ResponseErrorMessage.create(decrypted.id, error.message);
                        const publicKey = this.getPublicKey(decrypted.origin);
                        const encryptedResponseErrorMessage = await Encryption.encrypt(responseErrorMessage, publicKey);
                        this.write(encryptedResponseErrorMessage);
                    }
                }
            } catch (err) {
                console.error(`Failed to handle request message`, err);
            }
        } else if (BroadcastMessage.isEncrypted(message) || NotificationMessage.isEncrypted(message)) {
            try {
                const decrypted = await Encryption.decrypt(message, this.keys.privateKey);
                const handler = this.messageHandlers.get(decrypted.content.method);
                if (!handler) {
                    console.error(`No handler registered for ${message.kind} method ${decrypted.content.method}.`);
                    return;
                }
                handler(message.origin, ...(decrypted.content.params ?? []));
            } catch (err) {
                console.error(`Failed to handle ${message.kind} message`, err);
            }
        } else if (ErrorMessage.isEncrypted(message)) {
            try {
                const decrypted = await Encryption.decrypt(message, this.keys.privateKey);
                this.onErrorEmitter.fire(decrypted.content.message);
            } catch (err) {
                console.error(`Failed to handle error message`, err);
            }
        }
    }
    
    protected abstract getPublicKey(origin: string | undefined): string;
    protected abstract getPublicKeys(): string[];

    private write(message: EncryptedBroadcastMessage | EncryptedErrorMessage | EncryptedNotificationMessage | EncryptedRequestMessage | EncryptedResponseErrorMessage | EncryptedResponseMessage): void {
        this.transport.write(Encoding.encode(message));
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
    async sendRequest(type: RequestType<any, any> | string, target: MessageTarget, ...parameters: any[]): Promise<any> {
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
        const encryptedMessage = await Encryption.encrypt(message, this.getPublicKey(target));
        this.write(encryptedMessage);
        return deferred.promise;
    }

    sendNotification(type: string, target: MessageTarget, ...parameters: any[]): void;
    sendNotification<P extends unknown[]>(type: NotificationType<P>, target: MessageTarget, ...parameters: P): void;
    async sendNotification(type: NotificationType<any> | string, target: MessageTarget, ...parameters: any[]): Promise<void> {
        const message = NotificationMessage.create(type, '', target, parameters);
        const encryptedMessage = await Encryption.encrypt(message, this.getPublicKey(target));
        this.write(encryptedMessage);
    }

    sendBroadcast(type: string, ...parameters: any[]): void;
    sendBroadcast<P extends unknown[]>(type: BroadcastType<P>, ...parameters: P): void;
    async sendBroadcast(type: BroadcastType<any> | string, ...parameters: any[]): Promise<void> {
        const message = BroadcastMessage.create(type, '', parameters);
        const publicKeys = this.getPublicKeys();
        if (publicKeys.length > 0) {
            // Don't actually send the broadcast if there are no other peers
            // Encryption will fail if we don't provide at least one public key
            const encryptedMessage = await Encryption.encrypt(message, ...publicKeys);
            this.write(encryptedMessage);
        }
    }
}
