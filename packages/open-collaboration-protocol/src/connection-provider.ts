// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { MessageEncoding, MessageTransportProvider } from "open-collaboration-rpc";
import { ProtocolBroadcastConnection, createConnection } from "./connection";
import * as types from './types';

export type Fetch = (url: string, options?: FetchRequestOptions) => Promise<FetchResponse>;

export interface ConnectionProviderOptions {
    url: string;
    userToken?: string;
    fetch: Fetch;
    opener: (url: string) => void;
    transports: MessageTransportProvider[];
    encodings: MessageEncoding[];
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

    constructor(options: ConnectionProviderOptions) {
        this.options = options;
        this.fetch = options.fetch ?? ((url, options) => fetch(url, options));
        this.userAuthToken = options.userToken;
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

    async validate(): Promise<boolean> {
        if (this.userAuthToken) {
            const validateResponse = await this.fetch(this.getUrl('/api/login/validate'), {
                method: 'POST',
                headers: {
                    'x-jwt': this.userAuthToken!
                }
            });
            return validateResponse.status === 200;
        } else {
            return false;
        }
    }

    async createRoom(): Promise<types.CreateRoomResponse> {
        const valid = await this.validate();
        let loginToken: string | undefined;
        if (!valid) {
            loginToken = await this.login();
        }
        const response = await this.fetch(this.getUrl('/api/session/create'), {
            method: 'POST',
            headers: {
                'x-jwt': this.userAuthToken!
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
        const valid = await this.validate();
        let loginToken: string | undefined;
        if (!valid) {
            loginToken = await this.login();
        }
        const response = await this.fetch(this.getUrl(`/api/session/join/${roomId}`), {
            method: 'POST',
            headers: {
                'x-jwt': this.userAuthToken!
            }
        });
        const body: types.JoinRoomResponse = await response.json();
        const roomAuthToken = body.roomToken;
        return {
            loginToken,
            roomId,
            workspace: body.workspace,
            roomToken: roomAuthToken
        };
    }

    async connect(roomAuthToken: string): Promise<ProtocolBroadcastConnection> {
        const metadata = await this.fetch(this.getUrl('/api/meta'));
        const metadataBody = await metadata.json() as types.ProtocolServerMetaData;
        const transportIndex = this.findFitting(metadataBody.transports, this.options.transports.map(t => t.id));
        const encodingIndex = this.findFitting(metadataBody.encodings, this.options.encodings.map(e => e.encoding));
        const transportProvider = this.options.transports[transportIndex];
        const encoding = this.options.encodings[encodingIndex];
        const transport = transportProvider.createTransport(this.options.url, {
            'x-jwt': roomAuthToken,
            'x-encoding': encoding.encoding
        });
        const connection = createConnection(
            transport,
            encoding
        );
        return connection;
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
