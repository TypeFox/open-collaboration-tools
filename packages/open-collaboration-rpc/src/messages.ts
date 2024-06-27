// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

export const VERSION = '0.1.0';

/**
 * A collaboration message
 */
export interface Message {
    /**
     * Protocol version
     */
    version: string;
    kind: string;
}

export interface EncryptedMessage extends Message {
    content: Uint8Array;
}

export type MessageTarget = string | undefined;
export type MessageOrigin = string;
export type MessageId = number | string;

export namespace Message {
    export function is(item: unknown): item is Message {
        const message = item as Message;
        return typeof message === 'object' && message && typeof message.version === 'string' && typeof message.kind === 'string';
    }
    export function isEncrypted(item: Message): item is EncryptedMessage {
        return (item as EncryptedMessage).content instanceof Uint8Array;
    }
}

export interface AbstractErrorMessage<T> extends Message {
    kind: 'error';
    content: T
}

export interface ErrorMessageContent {
    message: string;
}

export type ErrorMessage = AbstractErrorMessage<ErrorMessageContent>;
export type EncryptedErrorMessage = AbstractErrorMessage<Uint8Array>;

export namespace ErrorMessage {
    export function create(message: string): ErrorMessage {
        return {
            version: VERSION,
            kind: 'error',
            content: {
                message
            }
        };
    }
    export function is(message: unknown): message is ErrorMessage | EncryptedErrorMessage {
        return Message.is(message) && message.kind === 'error';
    }
    export function isEncrypted(message: unknown): message is EncryptedErrorMessage {
        return is(message) && message.content instanceof Uint8Array;
    }
    export function isDecrypted(message: unknown): message is ErrorMessage {
        return is(message) && !isEncrypted(message);
    }
}

/**
 * Request message
 */
export interface AbstractRequestMessage<T> extends Message {
    /**
     * The request id.
     */
    id: number | string;
    kind: 'request';

    /**
     * The origin peer id of the request.
     */
    origin: MessageOrigin;

    /**
     * The peer id to which the request is addressed.
     */
    target: MessageTarget;

    content: T;
}

export interface RequestMessageContent {
    /**
     * The method to be invoked.
     */
    method: string;
    /**
     * The method's params.
     */
    params?: unknown[];
}

export type RequestMessage = AbstractRequestMessage<RequestMessageContent>;
export type EncryptedRequestMessage = AbstractRequestMessage<Uint8Array>;

export namespace RequestMessage {
    export function create(
        signature: RequestType<any, any> | string,
        id: number | string,
        origin: MessageOrigin,
        target: MessageTarget,
        params?: any[]
    ): RequestMessage {
        return {
            version: VERSION,
            id,
            origin,
            target,
            kind: 'request',
            content: {
                method: typeof signature === 'string' ? signature : signature.method,
                params
            }
        };
    }
    export function is(message: unknown): message is RequestMessage | EncryptedRequestMessage {
        return Message.is(message) && message.kind === 'request';
    }
    export function isEncrypted(message: unknown): message is EncryptedRequestMessage {
        return is(message) && message.content instanceof Uint8Array;
    }
    export function isDecrypted(message: unknown): message is RequestMessage {
        return is(message) && !isEncrypted(message);
    }
}

export interface AbstractResponseMessage<T> extends Message {
    /**
     * The original request id.
     */
    id: number | string;
    kind: 'response';
    content: T;
}

export type ResponseMessage = AbstractResponseMessage<unknown>;
export type EncryptedResponseMessage = AbstractResponseMessage<Uint8Array>;

export namespace ResponseMessage {
    export function create(id: number | string, response: unknown): ResponseMessage {
        return {
            kind: 'response',
            version: VERSION,
            id,
            content: response
        };
    }
    export function is(message: unknown): message is ResponseMessage | EncryptedResponseMessage {
        return Message.is(message) && message.kind === 'response';
    }
    export function isEncrypted(message: unknown): message is EncryptedResponseMessage {
        return is(message) && message.content instanceof Uint8Array;
    }
    export function isDecrypted(message: unknown): message is ResponseMessage {
        return is(message) && !isEncrypted(message);
    }
}

export interface AbstractResponseErrorMessage<T> extends Message {
    /**
     * The original request id.
     */
    id: number | string;
    kind: 'response-error';
    content: T;
}

export interface ResponseErrorMessageContent {
    message: string;
}

export type ResponseErrorMessage = AbstractResponseErrorMessage<ResponseErrorMessageContent>;
export type EncryptedResponseErrorMessage = AbstractResponseErrorMessage<Uint8Array>;

export namespace ResponseErrorMessage {
    export function create(id: number | string, message: string): ResponseErrorMessage {
        return {
            kind: 'response-error',
            version: VERSION,
            id,
            content: {
                message
            }
        };
    }
    export function is(message: unknown): message is ResponseErrorMessage | EncryptedResponseErrorMessage {
        return Message.is(message) && message.kind === 'response-error';
    }
    export function isEncrypted(message: unknown): message is EncryptedResponseErrorMessage {
        return is(message) && message.content instanceof Uint8Array;
    }
    export function isDecrypted(message: unknown): message is ResponseErrorMessage {
        return is(message) && !isEncrypted(message);
    }
}

export interface AbstractNotificationMessage<T> extends Message {
    kind: 'notification';
    /**
     * The origin peer id of the notification.
     */
    origin: MessageOrigin;
    /**
     * The peer id to which the notification is addressed.
     */
    target: MessageTarget;
    content: T;
}

export interface NotificationMessageContent {
    /**
     * The method to be invoked.
     */
    method: string;
    /**
     * The method's params.
     */
    params?: unknown[];
}

export type NotificationMessage = AbstractNotificationMessage<NotificationMessageContent>;
export type EncryptedNotificationMessage = AbstractNotificationMessage<Uint8Array>;

export namespace NotificationMessage {
    export function create(signature: NotificationType<any> | string, origin: MessageOrigin, target: MessageTarget, params?: any[]): NotificationMessage {
        return {
            version: VERSION,
            kind: 'notification',
            target: target,
            origin,
            content: {
                method: typeof signature === 'string' ? signature : signature.method,
                params
            }
        };
    }
    export function is(message: unknown): message is NotificationMessage | EncryptedNotificationMessage {
        return Message.is(message) && message.kind === 'notification';
    }
    export function isEncrypted(message: unknown): message is EncryptedNotificationMessage {
        return is(message) && message.content instanceof Uint8Array;
    }
    export function isDecrypted(message: unknown): message is NotificationMessage {
        return is(message) && !isEncrypted(message);
    }
}

export interface AbstractBroadcastMessage<T> extends Message {
    kind: 'broadcast';
    origin: MessageOrigin;
    content: T;
}

export interface BroadcastMessageContent {
    method: string;
    params?: unknown[];
}

export type BroadcastMessage = AbstractBroadcastMessage<BroadcastMessageContent>;
export type EncryptedBroadcastMessage = AbstractBroadcastMessage<Uint8Array>;

export namespace BroadcastMessage {
    export function create(signature: BroadcastType<any> | string, origin: string, params?: any[]): BroadcastMessage {
        return {
            version: VERSION,
            origin: origin,
            kind: 'broadcast',
            content: {
                method: typeof signature === 'string' ? signature : signature.method,
                params
            }
        };
    }
    export function is(message: unknown): message is BroadcastMessage | EncryptedBroadcastMessage {
        return Message.is(message) && message.kind === 'broadcast';
    }
    export function isEncrypted(message: unknown): message is EncryptedBroadcastMessage {
        return is(message) && message.content instanceof Uint8Array;
    }
    export function isDecrypted(message: unknown): message is BroadcastMessage {
        return is(message) && !isEncrypted(message);
    }
}

export interface MessageSignature {
    method: string
}

export class AbstractMessageSignature implements MessageSignature {
    method: string;
    constructor(method: string) {
        this.method = method;
    }
}

export class BroadcastType<P extends unknown[] = []> extends AbstractMessageSignature {
    public readonly _?: ['broadcast', P, void];
    constructor(method: string) {
        super(method);
    }
}

export class RequestType<P extends unknown[], R> extends AbstractMessageSignature {
    public readonly _?: ['request', P, R];
    constructor(method: string) {
        super(method);
    }
}

export class NotificationType<P extends unknown[]> extends AbstractMessageSignature {
    public readonly _?: ['notification', P, void];
    constructor(method: string) {
        super(method);
    }
}
