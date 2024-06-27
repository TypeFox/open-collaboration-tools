// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import * as msgpack from 'msgpackr';

export namespace Encoding {
    export function encode(message: unknown): Uint8Array {
        return msgpack.encode(message);
    }
    export function decode(data: Uint8Array): unknown {
        return msgpack.decode(data);
    }
}
