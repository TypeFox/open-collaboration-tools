// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

export interface MessageEncoding {
    readonly encoding: string;
    encode(message: unknown): ArrayBuffer;
    decode(data: ArrayBuffer): unknown;
}

export const JsonMessageEncoding: MessageEncoding = {
    encoding: 'json',
    encode: message => new TextEncoder().encode(JSON.stringify(message)),
    decode: data => JSON.parse(new TextDecoder().decode(data))
};
