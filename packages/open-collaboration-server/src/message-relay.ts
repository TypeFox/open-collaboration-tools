// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { injectable } from 'inversify';
import { BroadcastMessage, Deferred, NotificationMessage, RequestMessage, ResponseErrorMessage, ResponseMessage } from 'open-collaboration-rpc';
import { Peer } from './types';
import { nanoid } from 'nanoid';

export interface RelayedRequest {
    id: string | number;
    response: Deferred<unknown>
    dispose(): void;
}

@injectable()
export class MessageRelay {

    protected requestMap = new Map<string, RelayedRequest>();

    pushResponse(receiver: Peer, message: ResponseMessage | ResponseErrorMessage): void {
        const relayedRequest = this.requestMap.get(message.id.toString());
        if (relayedRequest) {
            if (ResponseMessage.is(message)) {
                relayedRequest.response.resolve(message.response);
            } else {
                relayedRequest.response.reject(new Error(message.message));
            }
            relayedRequest.dispose();
        }
    }

    sendRequest(target: Peer, message: RequestMessage): Promise<unknown> {
        const deferred = new Deferred<unknown>();
        const messageId = message.id;
        const key = nanoid(24);
        const dispose = () => {
            this.requestMap.delete(key);
            clearTimeout(timeout);
            deferred.reject(new Error('Request timed out'));
        };
        const timeout = setTimeout(dispose, 300_000);
        this.requestMap.set(key, {
            id: messageId,
            response: deferred,
            dispose
        });
        const targetMessage: RequestMessage = {
            ...message,
            id: key
        };
        target.channel.sendMessage(targetMessage);
        return deferred.promise;
    }

    sendNotification(target: Peer, message: NotificationMessage): void {
        target.channel.sendMessage(message);
    }

    sendBroadcast(origin: Peer, message: BroadcastMessage): void {
        const room = origin.room;
        if (!room) {
            throw new Error("Origin peer doesn't belong to any room");
        }
        message.origin = origin.id;
        for (const peer of room.peers) {
            if (peer !== origin) {
                peer.channel.sendMessage(message);
            }
        }
    }

}
