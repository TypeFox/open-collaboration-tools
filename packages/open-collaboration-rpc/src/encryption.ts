// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { NotificationMessage, BinaryNotificationMessage, RequestMessage, BinaryRequestMessage, ErrorMessage, ResponseErrorMessage, BinaryResponseErrorMessage, BroadcastMessage, BinaryBroadcastMessage, BinaryErrorMessage, ResponseMessage, BinaryResponseMessage, Message, MessageContentKey, CompressionAlgorithm } from './messages';
import { Encoding } from './encoding';
import { getCryptoLib } from './utils/crypto';
import { Compression } from './compression';
import { MaybePromise } from './utils';
import { fromBase64, toBase64 } from './utils/base64';

export namespace Encryption {

    export interface KeyPair {
        publicKey: string;
        privateKey: string;
    }

    export interface AsymmetricKey {
        peerId: string;
        publicKey: string;
        supportedCompression: CompressionAlgorithm[];
    }

    export interface DecryptionKey {
        privateKey: string;
        cache?: Record<string, string>;
    }

    let crypto = getCryptoLib();

    export async function generateKeyPair(): Promise<KeyPair> {
        const cryptoLib = await crypto;
        return cryptoLib.generateKeyPair();
    }
    export async function generateSymKey(): Promise<string> {
        const cryptoLib = await crypto;
        return cryptoLib.generateSymKey();
    }
    export async function symEncrypt(data: Uint8Array, key: string, iv: string): Promise<Uint8Array> {
        const cryptoLib = await crypto;
        return cryptoLib.symEncrypt(data, key, iv);
    }
    export async function symDecrypt(data: Uint8Array, key: string, iv: string): Promise<Uint8Array> {
        const cryptoLib = await crypto;
        return cryptoLib.symDecrypt(data, key, iv);
    }
    export async function publicEncrypt(data: Uint8Array, key: string): Promise<Uint8Array> {
        const cryptoLib = await crypto;
        return cryptoLib.publicEncrypt(data, key);
    }
    export async function privateDecrypt(data: Uint8Array, key: string): Promise<Uint8Array> {
        const cryptoLib = await crypto;
        return cryptoLib.privateDecrypt(data, key);
    }
    export async function generateIV(): Promise<string> {
        const cryptoLib = await crypto;
        return cryptoLib.generateIV();
    }
    export async function encrypt(message: NotificationMessage, symKey: MaybePromise<string>, ...keys: AsymmetricKey[]): Promise<BinaryNotificationMessage>;
    export async function encrypt(message: RequestMessage, symKey: MaybePromise<string>, ...keys: AsymmetricKey[]): Promise<BinaryRequestMessage>;
    export async function encrypt(message: ResponseMessage, symKey: MaybePromise<string>, ...keys: AsymmetricKey[]): Promise<BinaryResponseMessage>;
    export async function encrypt(message: ErrorMessage, symKey: MaybePromise<string>, ...keys: AsymmetricKey[]): Promise<BinaryErrorMessage>;
    export async function encrypt(message: ResponseErrorMessage, symKey: MaybePromise<string>, ...keys: AsymmetricKey[]): Promise<BinaryResponseErrorMessage>;
    export async function encrypt(message: BroadcastMessage, symKey: MaybePromise<string>, ...keys: AsymmetricKey[]): Promise<BinaryBroadcastMessage>;
    export async function encrypt(message: Message & { content: unknown }, symKey: MaybePromise<string>, ...keys: AsymmetricKey[]): Promise<Message & { content: Uint8Array }>;
    export async function encrypt(message: Message & { content: unknown }, symKey: MaybePromise<string>, ...keys: AsymmetricKey[]): Promise<Message & { content: Uint8Array }> {
        const cryptoLib = await crypto;
        const key = await symKey;
        const keyBuffer = fromBase64(key);
        const content = message.content;
        const encoded = Encoding.encode(content);
        const compressionAlgo = Compression.bestFit(keys.map(key => key.supportedCompression));
        const compressed = await Compression.compress(encoded, compressionAlgo);
        const iv = await cryptoLib.generateIV();
        const encrypted = await cryptoLib.symEncrypt(compressed, key, iv);
        const encryptedKeys = await Promise.all(keys.map(async key => ({
            target: key.peerId,
            key: toBase64(await cryptoLib.publicEncrypt(keyBuffer, key.publicKey)),
            iv
        } as MessageContentKey)));
        return {
            ...message,
            metadata: {
                ...message.metadata,
                encryption: {
                    keys: encryptedKeys
                },
                compression: {
                    algorithm: compressionAlgo
                }
            },
            content: encrypted
        };
    }
    export async function decrypt(message: BinaryNotificationMessage, privateKey: string): Promise<NotificationMessage>;
    export async function decrypt(message: BinaryBroadcastMessage, privateKey: string): Promise<BroadcastMessage>;
    export async function decrypt(message: BinaryRequestMessage, privateKey: string): Promise<RequestMessage>;
    export async function decrypt(message: BinaryResponseMessage, privateKey: string): Promise<ResponseMessage>;
    export async function decrypt(message: BinaryResponseErrorMessage, privateKey: string): Promise<ResponseErrorMessage>;
    export async function decrypt(message: BinaryErrorMessage, privateKey: string): Promise<ErrorMessage>;
    export async function decrypt(message: BinaryBroadcastMessage | BinaryNotificationMessage, privateKey: string): Promise<BroadcastMessage | NotificationMessage>;
    export async function decrypt(message: Message & { content: Uint8Array }, privateKey: string): Promise<Message & { content: unknown }>;
    export async function decrypt(message: Message & { content: Uint8Array }, privateKey: string): Promise<Message & { content: unknown }> {
        const cryptoLib = await crypto;
        const key = message.metadata.encryption.keys[0];
        if (!key) {
            throw new Error('No key found for sender');
        }
        const decryptedKey = toBase64(await cryptoLib.privateDecrypt(fromBase64(key.key), privateKey));
        const decrypted = await cryptoLib.symDecrypt(message.content, decryptedKey, key.iv);
        const decompressed = await Compression.decompress(decrypted, message.metadata.compression.algorithm);
        const decoded = Encoding.decode(decompressed);
        return {
            ...message,
            content: decoded
        };
    }
}
