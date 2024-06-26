// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import * as pgp from 'openpgp';
import { NotificationMessage, EncryptedNotificationMessage, RequestMessage, EncryptedRequestMessage, ErrorMessage, ResponseErrorMessage, EncryptedResponseErrorMessage, BroadcastMessage, EncryptedBroadcastMessage, EncryptedErrorMessage, ResponseMessage, EncryptedResponseMessage } from './messages';
import { Encoding } from './encoding';
import { v4 } from 'uuid';

export namespace Encryption {

    export interface KeyPair {
        publicKey: string;
        privateKey: string;
    }

    export async function generateKeyPair(): Promise<KeyPair> {
        const keys = await pgp.generateKey({
            userIDs: {
                name: v4()
            },
            curve: 'p256', // p256 curve is integrated natively in JS runtimes, marking it pretty quick
            format: 'armored' // base64 encoded keys
        });
        const { publicKey, privateKey } = keys;
        return {
            publicKey,
            privateKey
        };
    }
    export async function encrypt(message: NotificationMessage, ...publicKeys: string[]): Promise<EncryptedNotificationMessage>;
    export async function encrypt(message: RequestMessage, ...publicKeys: string[]): Promise<EncryptedRequestMessage>;
    export async function encrypt(message: ResponseMessage, ...publicKeys: string[]): Promise<EncryptedResponseMessage>;
    export async function encrypt(message: ErrorMessage, ...publicKeys: string[]): Promise<EncryptedErrorMessage>;
    export async function encrypt(message: ResponseErrorMessage, ...publicKeys: string[]): Promise<EncryptedResponseErrorMessage>;
    export async function encrypt(message: BroadcastMessage, ...publicKeys: string[]): Promise<EncryptedBroadcastMessage>;
    export async function encrypt(message: { content: unknown }, ...publicKeys: string[]): Promise<{ content: Uint8Array }>;
    export async function encrypt(message: { content: unknown }, ...publicKeys: string[]): Promise<{ content: Uint8Array }> {
        const content = message.content;
        const encoded = Encoding.encode(content);
        const encryptionKeys = await Promise.all(publicKeys.map(async key => await pgp.readKey({ armoredKey: key })));
        const encrypted = await pgp.encrypt({
            message: await pgp.createMessage({ binary: encoded }),
            encryptionKeys,
            format: 'binary'
        });
        return {
            ...message,
            content: encrypted
        };
    }
    export async function decrypt(message: EncryptedNotificationMessage, privateKey: string): Promise<NotificationMessage>;
    export async function decrypt(message: EncryptedBroadcastMessage, privateKey: string): Promise<BroadcastMessage>;
    export async function decrypt(message: EncryptedRequestMessage, privateKey: string): Promise<RequestMessage>;
    export async function decrypt(message: EncryptedResponseMessage, privateKey: string): Promise<ResponseMessage>;
    export async function decrypt(message: EncryptedResponseErrorMessage, privateKey: string): Promise<ResponseErrorMessage>;
    export async function decrypt(message: EncryptedErrorMessage, privateKey: string): Promise<ErrorMessage>;
    export async function decrypt(message: EncryptedBroadcastMessage | EncryptedNotificationMessage, privateKey: string): Promise<BroadcastMessage | NotificationMessage>;
    export async function decrypt(message: { content: Uint8Array }, privateKey: string): Promise<{ content: unknown }>;
    export async function decrypt(message: { content: Uint8Array }, privateKey: string): Promise<{ content: unknown }> {
        const content = message.content;
        const privateKeyObj = await pgp.readPrivateKey({ armoredKey: privateKey });
        const decrypted = await pgp.decrypt({
            message: await pgp.readMessage({ binaryMessage: content }),
            decryptionKeys: privateKeyObj,
            format: 'binary'
        });
        const decoded = Encoding.decode(decrypted.data);
        return {
            ...message,
            content: decoded
        };
    }
}
