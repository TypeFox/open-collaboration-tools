// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Info } from './info';

export class ServerError extends Error {

    code: string;
    params: string[];

    constructor(info: Info) {
        super(info.message);
        this.code = info.code;
        this.params = info.params;
    }

}

export function stringifyError(error: unknown, localization?: (code: string, msg: string, params: string[]) => string): string {
    if (error instanceof ServerError || Info.is(error)) {
        if (localization) {
            return localization(error.code, error.message, error.params);
        }
        return error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
