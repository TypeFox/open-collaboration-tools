// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable } from 'inversify';
import * as http from 'http';
import * as path from 'path';
import { Server } from 'socket.io';
import * as ws from 'ws';
import express from 'express';
import { Channel, SocketIoChannel, WebSocketChannel } from './channel';
import { PeerFactory } from './peer';
import { RoomManager, isRoomClaim } from './room-manager';
import { UserManager } from './user-manager';
import { CredentialsManager } from './credentials-manager';
import { User } from './types';
import * as types from 'open-collaboration-protocol';
import { Logger, LoggerSymbol } from './utils/logging';

@injectable()
export class CollaborationServer {

    @inject(RoomManager)
    protected readonly roomManager: RoomManager;

    @inject(UserManager)
    protected readonly userManager: UserManager;

    @inject(CredentialsManager)
    protected readonly credentials: CredentialsManager;

    @inject(PeerFactory)
    protected readonly peerFactory: PeerFactory;

    @inject(LoggerSymbol) protected logger: Logger;

    protected simpleLogin = true;

    startServer(args: Record<string, unknown>): void {
        this.logger.debug('Starting Open Collaboration Server ...');

        const httpServer = http.createServer(this.setupApiRoute());
        const wsServer = new ws.Server({
            path: '/websocket',
            server: httpServer
        });
        wsServer.on('connection', async (socket, req) => {
            try {
                const query = req.url?.split('?')[1] ?? '';
                const headers = query.split('&').reduce((acc, cur) => {
                    const [key, value] = cur.split('=');
                    if (typeof key === 'string' && typeof value === 'string') {
                        acc[decodeURIComponent(key.trim())] = decodeURIComponent(value.trim());
                    }
                    return acc;
                }, {} as Record<string, string>);
                await this.connectChannel(headers, new WebSocketChannel(socket));
            } catch (error) {
                socket.close(undefined, 'Failed to join room');
                this.logger.error('Web socket connection failed', error);
            }
        });
        const io = new Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });
        io.on('connection', async socket => {
            const headers = socket.request.headers as Record<string, string>;
            try {
                await this.connectChannel(headers, new SocketIoChannel(socket));
            } catch (error) {
                socket.disconnect(true);
                this.logger.error('Socket IO connection failed', error);
            }
        });
        httpServer.listen(Number(args.port), String(args.hostname));
        this.logger.info(`Open Collaboration Server listening on ${args.hostname}:${args.port}`);
    }

    protected async connectChannel(headers: Record<string, string>, channel: Channel): Promise<void> {
        const jwt = headers['x-jwt'];
        if (!jwt) {
            throw this.logger.createErrorAndLog('No JWT auth token set');
        }
        const publicKey = headers['x-public-key'];
        if (!publicKey) {
            throw new Error('No encryption key set');
        }
        let compression = headers['x-compression']?.split(',');
        if (compression === undefined || compression.length === 0) {
            compression = ['none'];
        }
        const roomClaim = await this.credentials.verifyJwt(jwt, isRoomClaim);
        const peer = this.peerFactory({
            user: roomClaim.user,
            host: roomClaim.host ?? false,
            publicKey,
            supportedCompression: compression,
            channel
        });
        await this.roomManager.join(peer, roomClaim.room);
    }

    protected async getUserFromAuth(req: express.Request): Promise<User | undefined> {
        const auth = req.headers['x-jwt'] as string;
        try {
            const user = await this.credentials.getUser(auth);
            return user;
        } catch {
            return undefined;
        }
    }

    protected setupApiRoute(): express.Express {
        const app = express();
        app.use(express.json());
        app.use((_, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            next();
        });
        app.use(async (req, res, next) => {
            if (req.method === 'POST' && req.url.startsWith('/api/') && !req.url.startsWith('/api/login/')) {
                const user = await this.getUserFromAuth(req);
                if (!user) {
                    res.status(403);
                    res.send('Forbidden resource');
                } else {
                    next();
                }
            } else {
                next();
            }
        });
        app.use(express.static(path.resolve(__dirname, '../src/static')));
        app.post('/api/login/url', async (req, res) => {
            try {
                const token = this.credentials.secureId();
                const index = `/login.html?token=${token}`;
                res.send({
                    url: index,
                    token
                });
            } catch (error) {
                this.logger.error('Error occurred during login', error);
                res.status(400);
                res.send('Failed to login');
            }
        });
        app.post('/api/login/validate', async (req, res) => {
            const user = await this.getUserFromAuth(req);
            if (user) {
                res.status(200);
                res.send('true');
            } else {
                res.status(400);
                res.send('false');
            }
        });
        if (this.simpleLogin) {
            app.post('/api/login/simple', async (req, res) => {
                try {
                    const token = req.body.token as string;
                    const user = req.body.user as string;
                    const email = req.body.email as string | undefined;
                    await this.credentials.confirmUser(token, {
                        name: user,
                        email
                    });
                    this.logger.info(`Simple login will be confirmed to client for user: ${user}`);
                    res.send('Ok');
                } catch (error) {
                    this.logger.error('Failed to perform simple login', error);
                    res.status(400);
                    res.send('Failed to perform simple login');
                }
            });
        }
        app.post('/api/login/confirm/:token', async (req, res) => {
            try {
                const token = req.params.token as string;
                const jwt = await this.credentials.confirmAuth(token);
                const user = await this.credentials.getUser(jwt);
                res.send({
                    user,
                    token: jwt
                });
            } catch (error) {
                this.logger.error('Error occurred during login token confirmation', error);
                res.status(400);
                res.send('Failed to confirm login token');
            }
        });
        app.get('/api/meta', async (_, res) => {
            const data: types.ProtocolServerMetaData = {
                owner: '',
                version: '',
                transports: [
                    'websocket',
                    'socket.io'
                ],
                publicKey: await this.credentials.getPublicKey()
            };
            res.send(data);
        });
        app.post('/api/session/join/:room', async (req, res) => {
            try {
                const roomId = req.params.room as string;
                const user = await this.getUserFromAuth(req);
                const room = this.roomManager.getRoomById(roomId);
                if (!room) {
                    throw this.logger.createErrorAndLog(`Room with requested id ${roomId} does not exist`);
                }
                const result = await this.roomManager.requestJoin(room, user!);
                const response: types.JoinRoomResponse = {
                    roomId: room.id,
                    roomToken: result.jwt,
                    workspace: result.response.workspace,
                    host: room.host.toProtocol()
                };
                res.send(response);
            } catch (error) {
                this.logger.error('Error occurred while joining a room', error);
                res.status(400);
                res.send('Failed to join room');
            }
        });
        app.post('/api/session/create', async (req, res) => {
            try {
                const user = await this.getUserFromAuth(req);
                const room = await this.roomManager.prepareRoom(user!);
                const response: types.CreateRoomResponse = {
                    roomId: room.id,
                    roomToken: room.jwt
                };
                res.send(response);
            } catch (error) {
                this.logger.error('Error occurred when creating a room', error);
                res.status(400);
                res.send('Failed to create room');
            }
        });
        return app;
    }

}
