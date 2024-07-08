// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

export type MaybePromise<T> = T | Promise<T>;

export class Deferred<T = void> {
    resolve: (value: T) => this;
    reject: (err?: unknown) => this;

    promise = new Promise<T>((resolve, reject) => {
        this.resolve = (arg) => (resolve(arg), this);
        this.reject = (err) => (reject(err), this);
    });
}
