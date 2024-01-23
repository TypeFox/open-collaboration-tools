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

export namespace Message {
    export function is(item: unknown): item is Message {
        const message = item as Message;
        return typeof message === 'object' && message && typeof message.version === 'string' && typeof message.kind === 'string';
    }
}

export interface ErrorMessage extends Message {
    kind: 'error';
    message: string;
}

export namespace ErrorMessage {
    export function create(message: string): ErrorMessage {
        return {
            version: VERSION,
            kind: 'error',
            message
        };
    }
    export function is(message: unknown): message is ErrorMessage {
        return Message.is(message) && message.kind === 'error';
    }
}

/**
 * Request message
 */
export interface RequestMessage extends Message {
    /**
     * The request id.
     */
    id: number | string;
    kind: 'request';

    /**
     * The method to be invoked.
     */
    method: string;

    /**
     * The method's params.
     */
    params?: unknown[];
}

export namespace RequestMessage {
    export function create(signature: RequestType<any, any> | string, id: number | string, params?: any[]): RequestMessage {
        return {
            id,
            method: typeof signature === 'string' ? signature : signature.method,
            kind: 'request',
            version: VERSION,
            params
        };
    }
    export function is(message: unknown): message is RequestMessage {
        return Message.is(message) && message.kind === 'request';
    }
}

export interface ResponseMessage extends Message {
    /**
     * The original request id.
     */
    id: number | string;
    kind: 'response';
    response: unknown;
}

export namespace ResponseMessage {
    export function create(id: number | string, response: unknown): ResponseMessage {
        return {
            kind: 'response',
            version: VERSION,
            id,
            response
        };
    }
    export function is(message: unknown): message is ResponseMessage {
        return Message.is(message) && message.kind === 'response';
    }
}

export interface ResponseErrorMessage extends Message {
    /**
     * The original request id.
     */
    id: number | string;
    kind: 'response-error';
    message: string;
}

export namespace ResponseErrorMessage {
    export function create(id: number | string, message: string): ResponseErrorMessage {
        return {
            kind: 'response-error',
            version: VERSION,
            id,
            message
        };
    }
    export function is(message: unknown): message is ResponseErrorMessage {
        return Message.is(message) && message.kind === 'response-error';
    }
}

export class ResponseError {
    constructor(readonly message: string) {

    }
}

export interface NotificationMessage extends Message {
    kind: 'notification';

    /**
     * The method to be invoked.
     */
    method: string;

    /**
     * The method's params.
     */
    params?: unknown[];
}

export namespace NotificationMessage {
    export function create(signature: NotificationType<any> | string, params?: any[]): NotificationMessage {
        return {
            method: typeof signature === 'string' ? signature : signature.method,
            kind: 'notification',
            version: VERSION,
            params
        };
    }
    export function is(message: unknown): message is NotificationMessage {
        return Message.is(message) && message.kind === 'notification';
    }
}

export interface BroadcastMessage extends Message {
    kind: 'broadcast';

    /**
     * ID of peer who initiated the broadcast.
     */
    clientId: string;

    /**
     * The method to be invoked.
     */
    method: string;

    /**
     * The method's params.
     */
    params?: unknown[];
}

export namespace BroadcastMessage {
    export function create(signature: BroadcastType<any> | string, clientId: string, params?: any[]): BroadcastMessage {
        return {
            clientId,
            method: typeof signature === 'string' ? signature : signature.method,
            kind: 'broadcast',
            version: VERSION,
            params
        };
    }
    export function is(message: unknown): message is BroadcastMessage {
        return Message.is(message) && message.kind === 'broadcast';
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
