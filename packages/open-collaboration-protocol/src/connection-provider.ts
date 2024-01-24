// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { MessageEncoding, MessageTransportProvider } from "open-collaboration-rpc";
import { ProtocolBroadcastConnection, createConnection } from "./connection";

export interface ConnectionProviderOptions {
    url: string;
    userToken?: string;
    fetch?: typeof fetch;
    opener: (url: string) => void;
    transports: MessageTransportProvider[];
    encodings: MessageEncoding[];
}

export interface ProtocolServerMetaData {
    owner: string;
    version: string;
    transports: string[];
    encodings: string[];
}

export interface ConnectionRoomClaim {
    roomToken: string;
    loginToken?: string;
}

export class ConnectionProvider {

    private options: ConnectionProviderOptions;
    private fetch: typeof fetch;

    constructor(options: ConnectionProviderOptions) {
        this.options = options;
        this.fetch = options.fetch ?? fetch;
        this.userAuthToken = options.userToken;
    }

    protected userAuthToken?: string;
    protected roomAuthToken?: string;

    get authToken(): string | undefined {
        return this.userAuthToken;
    }

    protected getUrl(path: string): string {
        return `${this.options.url}${path}`;
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

    async createRoom(): Promise<ConnectionRoomClaim> {
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
        const body = await response.json();
        this.roomAuthToken = body.token;
        return {
            loginToken,
            roomToken: body.room
        };
    }

    async joinRoom(roomToken: string): Promise<ConnectionRoomClaim> {
        const valid = await this.validate();
        let loginToken: string | undefined;
        if (!valid) {
            loginToken = await this.login();
        }
        const response = await this.fetch(this.getUrl(`/api/session/join/${roomToken}`), {
            method: 'POST',
            headers: {
                'x-jwt': this.userAuthToken!
            }
        });
        const body = await response.json();
        this.roomAuthToken = body.token;
        return {
            loginToken,
            roomToken
        };
    }

    async connect(): Promise<ProtocolBroadcastConnection> {
        const metadata = await this.fetch(this.getUrl('/api/meta'));
        const metadataBody = await metadata.json() as ProtocolServerMetaData;
        const transportIndex = this.findFitting(metadataBody.transports, this.options.transports.map(t => t.id));
        const encodingIndex = this.findFitting(metadataBody.encodings, this.options.encodings.map(e => e.encoding));
        const transportProvider = this.options.transports[transportIndex];
        const encoding = this.options.encodings[encodingIndex];
        const transport = transportProvider.createTransport(this.options.url, {
            'x-jwt': this.roomAuthToken!,
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
