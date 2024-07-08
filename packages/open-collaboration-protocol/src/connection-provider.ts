// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Encryption, VERSION } from "./messaging";
import { MessageTransportProvider } from "./transport";
import { ProtocolBroadcastConnection, createConnection } from "./connection";
import * as semver from 'semver';
import * as types from './types';

export type Fetch = (url: string, options?: FetchRequestOptions) => Promise<FetchResponse>;

export interface ConnectionProviderOptions {
    url: string;
    userToken?: string;
    client?: string;
    protocolVersion?: string;
    fetch: Fetch;
    opener: (url: string) => void;
    transports: MessageTransportProvider[];
}

export interface FetchRequestOptions {
    method?: string;
    headers?: Record<string, string>;
}

export interface FetchResponse {
    status?: number;
    json(): Promise<any>;
    text(): Promise<string>;
}

export class ConnectionProvider {

    private options: ConnectionProviderOptions;
    private fetch: Fetch;
    private protocolVersion: semver.SemVer;

    constructor(options: ConnectionProviderOptions) {
        this.options = options;
        this.fetch = options.fetch ?? ((url, options) => fetch(url, options));
        this.userAuthToken = options.userToken;
        if (options.protocolVersion) {
            const parsed = semver.parse(options.protocolVersion);
            if (!parsed) {
                throw new Error('Invalid protocol version provided: ' + options.protocolVersion);
            }
            this.protocolVersion = parsed;
        } else {
            this.protocolVersion = new semver.SemVer(VERSION);
        }
    }

    protected userAuthToken?: string;
    protected roomAuthToken?: string;

    get authToken(): string | undefined {
        return this.userAuthToken;
    }

    protected getUrl(path: string): string {
        // Remove trailing slashes from the base URL
        let url = this.options.url;
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        if (path.startsWith('/')) {
            path = path.slice(1);
        }
        return `${url}/${path}`;
    }

    async login(): Promise<string> {
        const loginResponse = await this.fetch(this.getUrl('/api/login/url'), {
            method: 'POST'
        });
        const loginBody = await loginResponse.json();
        const confirmToken = loginBody.token;
        const url = loginBody.url as string;
        const fullUrl = url.startsWith('/') ? this.getUrl(url) : url;
        this.options.opener(fullUrl);
        const confirmResponse = await this.fetch(this.getUrl(`/api/login/confirm/${confirmToken}`), {
            method: 'POST'
        });
        const confirmBody = await confirmResponse.json();
        this.userAuthToken = confirmBody.token;
        return confirmBody.token;
    }

    async ensureCompatibility(): Promise<void> {
        const metadata = await this.getMetaData();
        const serverVersion = semver.parse(metadata.version);
        if (!serverVersion) {
            throw new Error('Invalid protocol version returned by server: ' + metadata.version);
        }
        if (!this.satisfiesSemver(serverVersion)) {
            throw new Error(`Incompatible protocol versions: client ${this.protocolVersion}, server ${metadata.version}`);
        }
    }

    /**
     * Returns whether the client protocol version is compatible with the server protocol version.
     * The client and server are compatible if they either share the same major version or if both are in the `0.x` range and they share the same minor version.
     * 
     * After the first major version, minor versions only indicate backwards-compatible changes.
     * In the `0.x` range, minor versions indicate backwards-incompatible changes.
     * Patch versions are ignored for compatibility checks.
     */
    private satisfiesSemver(serverVersion: semver.SemVer): boolean {
        if (this.protocolVersion.major !== serverVersion.major) {
            return false;
        } else if (this.protocolVersion.major === 0 && serverVersion.major === 0) {
            return this.protocolVersion.minor === serverVersion.minor;
        } else {
            return true;
        }
    }

    async validate(): Promise<boolean> {
        if (this.userAuthToken) {
            const validateResponse = await this.fetch(this.getUrl('/api/login/validate'), {
                method: 'POST',
                headers: {
                    'x-oct-jwt': this.userAuthToken!
                }
            });
            return validateResponse.status === 200;
        } else {
            return false;
        }
    }

    async createRoom(): Promise<types.CreateRoomResponse> {
        await this.ensureCompatibility();
        const valid = await this.validate();
        let loginToken: string | undefined;
        if (!valid) {
            loginToken = await this.login();
        }
        const response = await this.fetch(this.getUrl('/api/session/create'), {
            method: 'POST',
            headers: {
                'x-oct-jwt': this.userAuthToken!
            }
        });
        const body: types.CreateRoomResponse = await response.json();
        return {
            loginToken,
            roomId: body.roomId,
            roomToken: body.roomToken
        };
    }

    async joinRoom(roomId: string): Promise<types.JoinRoomResponse> {
        await this.ensureCompatibility();
        const valid = await this.validate();
        let loginToken: string | undefined;
        if (!valid) {
            loginToken = await this.login();
        }
        const response = await this.fetch(this.getUrl(`/api/session/join/${roomId}`), {
            method: 'POST',
            headers: {
                'x-oct-jwt': this.userAuthToken!
            }
        });
        const body: types.JoinRoomResponse = await response.json();
        const roomAuthToken = body.roomToken;
        return {
            loginToken,
            roomId,
            roomToken: roomAuthToken,
            workspace: body.workspace,
            host: body.host
        };
    }

    async connect(roomAuthToken: string, host?: types.Peer): Promise<ProtocolBroadcastConnection> {
        const metadata = await this.getMetaData();
        const transportIndex = this.findFitting(metadata.transports, this.options.transports.map(t => t.id));
        const transportProvider = this.options.transports[transportIndex];
        const keyPair = await Encryption.generateKeyPair();
        const transport = transportProvider.createTransport(this.options.url, {
            'x-oct-jwt': roomAuthToken,
            'x-oct-public-key': keyPair.publicKey,
            'x-oct-client': this.options.client ?? 'Unknown OCT JS Client',
            'x-oct-compression': 'gzip'
        });
        const connection = createConnection(
            {
                privateKey: keyPair.privateKey,
                publicServerKey: metadata.publicKey,
                transport,
                host
            }
        );
        return connection;
    }

    private async getMetaData(): Promise<types.ProtocolServerMetaData> {
        const response = await this.fetch(this.getUrl('/api/meta'));
        return await response.json();
    }

    private findFitting(available: string[], desired: string[]): number {
        const availableSet = new Set(available);
        for (let i = 0; i < desired.length; i++) {
            if (availableSet.has(desired[i])) {
                return i;
            }
        }
        return -1;
    }
}
