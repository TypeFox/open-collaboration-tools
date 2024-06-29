// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { isBrowser } from "./system";
import { fromByteArray, toByteArray } from 'base64-js';

export function fromBase64(data: string): Uint8Array {
    if (isBrowser) {
        return toByteArray(data);
    } else {
        return Buffer.from(data, 'base64');
    }
}

export function toBase64(data: Uint8Array): string {
    if (isBrowser) {
        return fromByteArray(data);
    } else {
        return Buffer.from(data).toString('base64');
    }
}
