// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { injectable } from 'inversify';
import { Deferred, EncryptedBroadcastMessage, EncryptedNotificationMessage, EncryptedRequestMessage, EncryptedResponseErrorMessage, EncryptedResponseMessage, ResponseMessage } from 'open-collaboration-rpc';
import { Peer } from './types';
import { nanoid } from 'nanoid';

export interface RelayedRequest {
    id: string | number;
    response: Deferred<Uint8Array>
    dispose(): void;
}

@injectable()
export class MessageRelay {

    protected requestMap = new Map<string, RelayedRequest>();

    pushResponse(receiver: Peer, message: EncryptedResponseMessage | EncryptedResponseErrorMessage): void {
        const relayedRequest = this.requestMap.get(message.id.toString());
        if (relayedRequest) {
            if (ResponseMessage.is(message)) {
                relayedRequest.response.resolve(message.content);
            } else {
                relayedRequest.response.reject(message.content);
            }
            relayedRequest.dispose();
        }
    }

    sendRequest(target: Peer, message: EncryptedRequestMessage): Promise<Uint8Array> {
        const deferred = new Deferred<Uint8Array>();
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
        const targetMessage: EncryptedRequestMessage = {
            ...message,
            id: key
        };
        target.channel.sendMessage(targetMessage);
        return deferred.promise;
    }

    sendNotification(target: Peer, message: EncryptedNotificationMessage): void {
        target.channel.sendMessage(message);
    }

    sendBroadcast(origin: Peer, message: EncryptedBroadcastMessage): void {
        try {
            const room = origin.room;
            message.origin = origin.id;
            for (const peer of room.peers) {
                if (peer !== origin) {
                    peer.channel.sendMessage(message);
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

}
