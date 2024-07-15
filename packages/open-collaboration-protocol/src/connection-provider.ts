// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Encryption } from "./messaging";
import { MessageTransportProvider } from "./transport";
import { ProtocolBroadcastConnection, createConnection } from "./connection";
import * as semver from 'semver';
import * as types from './types';
import { SEM_VERSION, compatibleVersions } from "./utils/version";
import { ServerError } from "./utils";
import { Info } from "./utils/info";

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
    signal?: AbortSignal | null;
}

export interface FetchResponse {
    status?: number;
    ok: boolean;
    json(): Promise<any>;
    text(): Promise<string>;
}

export interface LoginOptions {
    abortSignal?: AbortSignal;
    reporter?: ResponseReporter;
}

export interface JoinRoomOptions {
    roomId: string;
    reporter?: ResponseReporter;
    abortSignal?: AbortSignal;
}

export interface CreateRoomOptions {
    reporter?: ResponseReporter;
    abortSignal?: AbortSignal;
}

export type ResponseReporter = (info: Info) => void;

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
            this.protocolVersion = SEM_VERSION;
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

    async login(options: LoginOptions): Promise<string> {
        options.reporter?.({
            code: 'PerformingLogin',
            params: [],
            message: 'Performing login'
        });
        const loginResponse = await this.fetch(this.getUrl('/api/login/url'), {
            signal: options.abortSignal,
            method: 'POST'
        });
        if (!loginResponse.ok) {
            throw new Error('Failed to get login URL');
        }
        const loginBody = await loginResponse.json();
        if (!types.LoginInitialResponse.is(loginBody)) {
            throw new Error('Invalid login response');
        }
        const confirmToken = loginBody.pollToken;
        const url = loginBody.url;
        const fullUrl = url.startsWith('/') ? this.getUrl(url) : url;
        this.options.opener(fullUrl);
        const authToken = await this.pollLogin(confirmToken, options);
        this.userAuthToken = authToken;
        return authToken;
    }

    private async pollLogin(confirmToken: string, options: LoginOptions): Promise<string> {
        while (true) {
            const confirmResponse = await this.fetch(this.getUrl(`/api/login/confirm/${confirmToken}`), {
                signal: options.abortSignal,
                method: 'POST'
            });
            if (confirmResponse.ok) {
                try {
                    const confirmBody = await confirmResponse.json();
                    if (types.LoginPollResponse.is(confirmBody) && confirmBody.loginToken) {
                        return confirmBody.loginToken;
                    }
                } catch {
                    // No token yet, keep polling
                }
            } else {
                throw await this.readError(confirmResponse);
            }
        }
    }

    async ensureCompatibility(): Promise<void> {
        const metadata = await this.getMetaData();
        const serverVersion = semver.parse(metadata.version);
        if (!serverVersion) {
            throw new ServerError({
                code: 'InvalidServerVersion',
                message: 'Invalid protocol version returned by server: ' + metadata.version,
                params: [metadata.version]
            });
        }
        if (!compatibleVersions(serverVersion, this.protocolVersion)) {
            throw new ServerError({
                code: 'IncompatibleProtocolVersions',
                message: `Incompatible protocol versions: client ${this.protocolVersion.format()}, server ${serverVersion.format()}`,
                params: [this.protocolVersion.format(), serverVersion.format()]
            });
        }
    }

    async validate(): Promise<boolean> {
        if (this.userAuthToken) {
            try {
                const validateResponse = await this.fetch(this.getUrl('/api/login/validate'), {
                    method: 'POST',
                    headers: {
                        'x-oct-jwt': this.userAuthToken!
                    }
                });
                const body = await validateResponse.json();
                if (types.LoginValidateResponse.is(body)) {
                    return body.valid;
                }
            } catch {
                return false;
            }
        }
        return false;
    }

    async createRoom(options: CreateRoomOptions): Promise<types.CreateRoomResponse> {
        await this.ensureCompatibility();
        const valid = await this.validate();
        let loginToken: string | undefined;
        if (!valid) {
            loginToken = await this.login({
                abortSignal: options.abortSignal,
                reporter: options.reporter
            });
        }
        options.reporter?.({
            code: 'AwaitingServerResponse',
            params: [],
            message: 'Awaiting server response'
        });
        const response = await this.fetch(this.getUrl('/api/session/create'), {
            method: 'POST',
            signal: options.abortSignal,
            headers: {
                'x-oct-jwt': this.userAuthToken!
            }
        });
        if (!response.ok) {
            throw await this.readError(response);
        }
        const body = await response.json();
        if (!types.CreateRoomResponse.is(body)) {
            throw new Error('Invalid create room response');
        }
        return types.CreateRoomResponse.create(body.roomId, body.roomToken, loginToken);
    }

    async joinRoom(options: JoinRoomOptions): Promise<types.JoinRoomResponse> {
        await this.ensureCompatibility();
        const valid = await this.validate();
        let loginToken: string | undefined;
        if (!valid) {
            loginToken = await this.login({
                abortSignal: options.abortSignal,
                reporter: options.reporter
            });
        }
        options.reporter?.({
            code: 'AwaitingServerResponse',
            params: [],
            message: 'Awaiting server response'
        });
        const response = await this.fetch(this.getUrl(`/api/session/join/${options.roomId}`), {
            method: 'POST',
            signal: options.abortSignal,
            headers: {
                'x-oct-jwt': this.userAuthToken!
            }
        });
        if (!response.ok) {
            throw await this.readError(response);
        }
        const body = await response.json();
        if (!types.JoinRoomInitialResponse.is(body)) {
            throw new Error('Invalid join room response');
        }
        const joinToken = body.pollToken;
        const joinRoomResponse = await this.pollJoin(joinToken, options);
        return {
            loginToken,
            roomId: joinRoomResponse.roomId,
            roomToken: joinRoomResponse.roomToken,
            workspace: joinRoomResponse.workspace,
            host: joinRoomResponse.host
        };
    }

    async pollJoin(joinToken: string, options: JoinRoomOptions): Promise<types.JoinRoomResponse> {
        while (true) {
            const response = await this.fetch(this.getUrl(`/api/session/join-poll/${joinToken}`), {
                method: 'POST',
                signal: options.abortSignal,
                headers: {
                    'x-oct-jwt': this.userAuthToken!
                }
            });
            if (response.ok) {
                const body = await response.json();
                if (types.JoinRoomPollResponse.is(body)) {
                    // No token yet, report status
                    if (body.failure) {
                        throw new ServerError({
                            code: body.code,
                            params: body.params,
                            message: body.message
                        });
                    } else {
                        // Keep polling
                        options.reporter?.(body);
                    }
                } else if (types.JoinRoomResponse.is(body)) {
                    return body;
                } else {
                    throw new Error('Received invalid join room poll response');
                }
            } else {
                // Something went wrong
                throw await this.readError(response);
            }
        }
    }

    private async readError(response: FetchResponse): Promise<Error> {
        try {
            const text = await response.text();
            try {
                const body = JSON.parse(text);
                if (Info.is(body)) {
                    return new ServerError(body);
                } else {
                    return new Error(text);
                }
            } catch {
                return new Error(text);
            }
        } catch (error) {
            return new Error('Unknown error');
        }
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
        if (!response.ok) {
            throw new Error('Failed to fetch metadata');
        }
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
