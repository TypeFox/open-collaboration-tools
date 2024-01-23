// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

type UnknownObject<T extends object> = Record<string | number | symbol, unknown> & { [K in keyof T]: unknown };

export function isObject<T extends object>(value: unknown): value is UnknownObject<T> {
    // eslint-disable-next-line no-null/no-null
    return typeof value === 'object' && value !== null;
}
