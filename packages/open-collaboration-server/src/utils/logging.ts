// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable } from "inversify";

export enum LogLevel {
    none = 0,
    error = 1,
    warn = 2,
    info = 3,
    debug = 4
};

export interface Logger {

    logLevel: LogLevel;

    getLogLevel(): LogLevel;
    error(message: string, ...params: unknown[]): void;
    createErrorAndLog(message: string, ...params: unknown[]): Error;
    warn(message: string, ...params: unknown[]): void;
    info(message: string, ...params: unknown[]): void;
    debug(message: string, ...params: unknown[]): void;

}

@injectable()
export class ConsoleLogger implements Logger {

    @inject(Symbol('LogLevel')) public logLevel: LogLevel = LogLevel.info;

    getLogLevel() {
        return this.logLevel;
    }

    error(message: string, ...params: unknown[]) {
        if (this.logLevel >= LogLevel.error) {
            console.error(message, params);
        }
    }

    createErrorAndLog(message: string, ...params: unknown[]) {
        if (this.logLevel >= LogLevel.error) {
            this.error(message, params);
        }
        return new Error(message);
    }

    warn(message: string, ...params: unknown[]) {
        if (this.logLevel >= LogLevel.warn) {
            console.warn(message, params);
        }
    }

    info(message: string, ...params: unknown[]) {
        if (this.logLevel >= LogLevel.info) {
            console.log(message, params);
        }
    }

    debug(message: string, ...params: unknown[]) {
        if (this.logLevel >= LogLevel.debug) {
            console.debug(message, params);
        }
    }

}

export const checkLogLevel = (logLevel?: string | unknown) => {
    switch (logLevel) {
        case 'none':
        case '0':
            return LogLevel.none;
        case 'error':
        case '1':
            return LogLevel.error;
        case 'warn':
        case '2':
            return LogLevel.warn;
        case 'debug':
        case '4':
            return LogLevel.debug;
        case 'info':
        case '3':
        default:
            return LogLevel.info;
    }
}
