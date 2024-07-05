// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { injectable } from 'inversify';

export interface Configuration {

    /**
     * Get a string value for the given configuration key.
     * The key must be provided in kebab-case.
     */
    getValue(key: string, type?: 'string'): string | undefined;

    /**
     * Get a number value for the given configuration key.
     * The key must be provided in kebab-case.
     */
    getValue(key: string, type: 'number'): number | undefined;

    /**
     * Get a boolean value for the given configuration key.
     * The key must be provided in kebab-case.
     */
    getValue(key: string, type: 'boolean'): boolean | undefined;

}

export const Configuration = Symbol('Configuration');

@injectable()
export class DefaultConfiguration implements Configuration {

    getValue(key: string, type?: 'string'): string | undefined;
    getValue(key: string, type: 'number'): number | undefined;
    getValue(key: string, type: 'boolean'): boolean | undefined;
    getValue(key: string, type?: 'string' | 'number' | 'boolean'): string | number | boolean | undefined {
        const value = this.getFromEnv(key);

        if (value !== undefined) {
            if (type === 'number') {
                return parseInt(value, 10);
            } else if (type === 'boolean') {
                return value.toLowerCase() === 'true';
            }
        }
        return value;
    }

    protected getFromEnv(key: string): string | undefined {
        return process.env[toEnvKey(key)];
    }

}

/**
 * Converts a kebab-case key to a SNAKE_CASE key.
 */
function toEnvKey(key: string): string {
    return key.replace(/-/g, '_').toUpperCase();
}
