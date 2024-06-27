// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

export type LoggerConfig = {
    enabled?: boolean,
    debugEnabled?: boolean
};

export type ErrorLogging = {
    message?: string;
    error?: unknown;
};

export class Logger {

    private enabled: boolean;
    private debugEnabled: boolean;

    constructor(config?: LoggerConfig) {
        this.updateConfig(config);
    }

    updateConfig(config?: LoggerConfig) {
        // enable logging if not explicetely set to false
        this.enabled = config?.enabled ?? true;
        this.debugEnabled = this.enabled && (config?.debugEnabled ?? false);
    }

    isEnabled() {
        return this.enabled;
    }

    isDebugEnabled() {
        return this.debugEnabled;
    }

    info(message: string) {
        if (this.enabled) {
            console.log(message);
        }
    }

    warn(message: string) {
        if (this.enabled) {
            console.warn(message);
        }
    }

    error(errorLogging: ErrorLogging) {
        if (this.enabled) {
            if (errorLogging.message !== undefined) {
                console.error(errorLogging.message, errorLogging.error);
            } else {
                console.error(errorLogging.error);
            }
        }
    }

    debug(message: string, force: boolean = false) {
        if (this.enabled && (this.debugEnabled || force)) {
            console.debug(message);
        }
    }

    logAndCreateError(errorLogging: ErrorLogging, log: boolean = true) {
        if (log) {
            this.error(errorLogging);
        }
        return new Error(errorLogging.message);
    }
}
