// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

type UnknownObject<T extends object> = { [K in keyof T]: unknown };

export function isObject<T extends object>(value: unknown): value is UnknownObject<T> {
    return typeof value === 'object' && value !== null;
}

export function isArray(value: unknown): value is unknown[];
export function isArray<T>(value: unknown, test: (item: unknown) => item is T): value is T[];
export function isArray(value: unknown, test?: (item: unknown) => boolean): boolean {
    if (!Array.isArray(value)) {
        return false;
    }
    if (test) {
        return value.every(test);
    }
    return true;
}

export function isStringArray(value: unknown): value is string[] {
    return isArray(value, isString);
}

export function isString(value: unknown): value is string {
    return typeof value === 'string';
}
