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
    metadata: MessageMetadata;
}

export interface MessageMetadata {
    encryption: MessageEncryption;
    compression: MessageCompression;
}

export const DEFAULT_METADATA: MessageMetadata = {
    encryption: {
        keys: []
    },
    compression: {
        algorithm: 'none'
    }
};

export interface MessageEncryption {
    keys: MessageContentKey[];
}

export interface MessageCompression {
    algorithm: CompressionAlgorithm;
}

export interface MessageContentKey {
    target: MessageTarget;
    key: string;
    iv: string;
}

export type CompressionAlgorithm = 'none' | 'gzip' | (string & {});

export interface BinaryMessage extends Message {
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
    export function isBinary(item: Message): item is BinaryMessage {
        return (item as BinaryMessage).content instanceof Uint8Array;
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
export type BinaryErrorMessage = AbstractErrorMessage<Uint8Array>;

export namespace ErrorMessage {
    export function create(message: string): ErrorMessage {
        return {
            version: VERSION,
            kind: 'error',
            metadata: DEFAULT_METADATA,
            content: {
                message
            }
        };
    }
    export function is(message: unknown): message is ErrorMessage {
        return Message.is(message) && message.kind === 'error';
    }
    export function isBinary(message: unknown): message is BinaryErrorMessage {
        return is(message) && message.content instanceof Uint8Array;
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
export type BinaryRequestMessage = AbstractRequestMessage<Uint8Array>;

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
            metadata: DEFAULT_METADATA,
            origin,
            target,
            kind: 'request',
            content: {
                method: typeof signature === 'string' ? signature : signature.method,
                params
            }
        };
    }
    export function is(message: unknown): message is RequestMessage {
        return Message.is(message) && message.kind === 'request';
    }
    export function isBinary(message: unknown): message is BinaryRequestMessage {
        return is(message) && message.content instanceof Uint8Array;
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

export type ResponseMessage<T = unknown> = AbstractResponseMessage<T>;
export type BinaryResponseMessage = AbstractResponseMessage<Uint8Array>;

export namespace ResponseMessage {
    export function create<T extends object>(id: number | string, response: T): ResponseMessage<T> {
        return {
            kind: 'response',
            version: VERSION,
            id,
            metadata: DEFAULT_METADATA,
            content: response
        };
    }
    export function is(message: unknown): message is ResponseMessage {
        return Message.is(message) && message.kind === 'response';
    }
    export function isBinary(message: unknown): message is BinaryResponseMessage {
        return is(message) && message.content instanceof Uint8Array;
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
export type BinaryResponseErrorMessage = AbstractResponseErrorMessage<Uint8Array>;

export namespace ResponseErrorMessage {
    export function create(id: number | string, message: string): ResponseErrorMessage;
    export function create(id: number | string, message: Uint8Array): BinaryResponseErrorMessage;
    export function create(id: number | string, message: string | Uint8Array): ResponseErrorMessage | BinaryResponseErrorMessage {
        if (typeof message === 'string') {
            return {
                kind: 'response-error',
                version: VERSION,
                metadata: DEFAULT_METADATA,
                id,
                content: {
                    message
                }
            };
        } else {
            return {
                kind: 'response-error',
                version: VERSION,
                metadata: DEFAULT_METADATA,
                id,
                content: message
            };
        }
    }
    export function is(message: unknown): message is ResponseErrorMessage {
        return Message.is(message) && message.kind === 'response-error';
    }
    export function isBinary(message: unknown): message is BinaryResponseErrorMessage {
        return is(message) && message.content instanceof Uint8Array;
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
export type BinaryNotificationMessage = AbstractNotificationMessage<Uint8Array>;

export namespace NotificationMessage {
    export function create(signature: NotificationType<any> | string, origin: MessageOrigin, target: MessageTarget, params?: any[]): NotificationMessage {
        return {
            version: VERSION,
            kind: 'notification',
            metadata: DEFAULT_METADATA,
            target,
            origin,
            content: {
                method: typeof signature === 'string' ? signature : signature.method,
                params
            }
        };
    }
    export function is(message: unknown): message is NotificationMessage {
        return Message.is(message) && message.kind === 'notification';
    }
    export function isBinary(message: unknown): message is BinaryNotificationMessage {
        return is(message) && message.content instanceof Uint8Array;
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
export type BinaryBroadcastMessage = AbstractBroadcastMessage<Uint8Array>;

export namespace BroadcastMessage {
    export function create(signature: BroadcastType<any> | string, origin: string, params?: any[]): BroadcastMessage {
        return {
            version: VERSION,
            kind: 'broadcast',
            metadata: DEFAULT_METADATA,
            origin: origin,
            content: {
                method: typeof signature === 'string' ? signature : signature.method,
                params
            }
        };
    }
    export function is(message: unknown): message is BroadcastMessage {
        return Message.is(message) && message.kind === 'broadcast';
    }
    export function isBinary(message: unknown): message is BinaryBroadcastMessage {
        return is(message) && message.content instanceof Uint8Array;
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
