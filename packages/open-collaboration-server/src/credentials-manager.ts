// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable } from 'inversify';
import { User, isUser } from './types';
import { UserManager } from './user-manager';
import jose = require('jose');
import { nanoid } from 'nanoid';
import { Deferred } from 'open-collaboration-rpc';

export interface DelayedAuth {
    deferred: Deferred<string>
    dispose: () => void
}

@injectable()
export class CredentialsManager {

    @inject(UserManager)
    protected readonly userManager: UserManager;

    protected deferredAuths = new Map<string, DelayedAuth>();

    protected cachedKey?: string;

    constructor() {
        if (process.env.JWT_PRIVATE_KEY === undefined) {
            console.warn('JWT_PRIVATE_KEY env variable is not set. Using a static key for development purposes.');
        }
    }

    async confirmUser(confirmToken: string, user: Omit<User, 'id'>): Promise<string> {
        const auth = this.deferredAuths.get(confirmToken);
        if (!auth) {
            throw new Error('Login timed out');
        }
        const registeredUser = await this.userManager.registerUser(user);
        const userClaim: User = {
            id: registeredUser.id,
            name: registeredUser.name,
            email: registeredUser.email
        };
        const jwt = await this.generateJwt(userClaim);
        auth.deferred.resolve(jwt);
        auth.dispose();
        return jwt;
    }

    async confirmAuth(confirmToken: string): Promise<string> {
        const deferred = new Deferred<string>();
        const dispose = () => {
            clearTimeout(timeout);
            this.deferredAuths.delete(confirmToken);
            deferred.reject(new Error('Auth request timed out'));
        };
        const timeout = setTimeout(dispose, 300_000); // 5 minutes of timeout
        this.deferredAuths.set(confirmToken, {
            deferred,
            dispose
        });
        return deferred.promise;
    }

    async getUser(token: string): Promise<User | undefined> {
        const user = await this.verifyJwt(token, isUser);
        if (typeof user.id !== 'string' || typeof user.name !== 'string') {
            throw new Error('User token is not valid');
        }
        return user;
    }

    async verifyJwt<T extends object>(jwt: string, verify: (obj: unknown) => obj is T): Promise<T> {
        const key = await this.getJwtPrivateKey();
        const { payload } = await jose.jwtVerify(jwt, key);
        if (verify(payload)) {
            return payload;
        } else {
            throw new Error('JWT payload is not valid');
        }
    }

    protected async getJwtPrivateKey(): Promise<Uint8Array> {
        const key = process.env.JWT_PRIVATE_KEY ?? __filename;
        return Buffer.from(key);
    }

    async generateJwt(payload: object): Promise<string> {
        const [key, expiration] = await Promise.all([
            this.getJwtPrivateKey(),
            this.getJwtExpiration()
        ]);
        const signJwt = new jose.SignJWT(payload as jose.JWTPayload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt();
        if (expiration !== undefined) {
            signJwt.setExpirationTime(expiration);
        }
        return signJwt.sign(key);
    }

    protected async getJwtExpiration(): Promise<string | number | undefined> {
        return undefined;
    }

    secureId(): string {
        return nanoid(24);
    }
}
