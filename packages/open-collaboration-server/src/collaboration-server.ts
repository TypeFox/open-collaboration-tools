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
import * as express from 'express';
import { Channel, SocketIoChannel, WebSocketChannel } from './channel';
import { PeerFactory } from './peer';
import { RoomManager, isRoomClaim } from './room-manager';
import { UserManager } from './user-manager';
import { CredentialsManager } from './credentials-manager';
import { User } from './types';
import { ErrorMessage, MessageEncoding } from 'open-collaboration-rpc';
import { EncodingProvider } from './encoding-provider';
import { ProtocolServerMetaData } from 'open-collaboration-protocol';

@injectable()
export class CollaborationServer {

    @inject(RoomManager)
    protected readonly roomManager: RoomManager;

    @inject(UserManager)
    protected readonly userManager: UserManager;

    @inject(CredentialsManager)
    protected readonly credentials: CredentialsManager;

    @inject(EncodingProvider)
    protected readonly encodingProvider: EncodingProvider;

    @inject(PeerFactory)
    protected readonly peerFactory: PeerFactory;

    protected simpleLogin = true;

    startServer(args: Record<string, unknown>): void {
        const httpServer = http.createServer(this.setupApiRoute());
        const wsServer = new ws.Server({
            path: '/websocket',
            server: httpServer
        });
        wsServer.on('connection', async (socket, req) => {
            const protocolHeader = req.headers['sec-websocket-protocol'] ?? '';
            const headers = protocolHeader.split(',').reduce((acc, cur) => {
                const [key, value] = cur.split('+');
                if (typeof key === 'string' && typeof value === 'string') {
                    acc[key.trim()] = value.trim();
                }
                return acc;
            }, {} as Record<string, string>);
            try {
                await this.connectChannel(headers, encoding => new WebSocketChannel(socket, encoding));
            } catch (err) {
                socket.close();
                console.log(err);
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
                await this.connectChannel(headers, encoding => new SocketIoChannel(socket, encoding));
            } catch (err) {
                socket.send(ErrorMessage.create('Failed to join room'));
                socket.disconnect(true);
                console.log(err);
            }
        });
        httpServer.listen(Number(args.port), String(args.hostname));
        console.log('Open Collaboration Server listening on ' + args.hostname + ':' + args.port);
    }

    protected async connectChannel(headers: Record<string, string>, channelProvider: (encoding: MessageEncoding) => Channel): Promise<void> {
        const jwt = headers['x-jwt'] as string;
        if (!jwt) {
            throw new Error('No JWT auth token set');
        }
        let encoding = headers['x-encoding'] as string;
        if (!encoding) {
            encoding = 'json';
        }
        const messageEncoding = this.encodingProvider.getEncoding(encoding);
        const roomClaim = await this.credentials.verifyJwt(jwt, isRoomClaim);
        const channel = channelProvider(messageEncoding);
        const peer = this.peerFactory({
            user: roomClaim.user,
            channel
        });
        await this.roomManager.join(peer, roomClaim.room, roomClaim.host ?? false);
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

    protected setupApiRoute(): express.Application {
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
            } catch (err) {
                console.error(err);
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
                    res.send('Ok');
                } catch (err) {
                    console.error(err);
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
            } catch (err) {
                console.error(err);
                res.status(400);
                res.send('Failed to confirm login token');
            }
        });
        app.get('/api/meta', async (_, res) => {
            const data: ProtocolServerMetaData = {
                owner: '',
                version: '',
                transports: [
                    'websocket',
                    'socket.io'
                ],
                encodings: [
                    'json'
                ]
            };
            res.send(data);
        });
        app.post('/api/session/join/:room', async (req, res) => {
            try {
                const roomId = req.params.room as string;
                const user = await this.getUserFromAuth(req);
                const room = this.roomManager.getRoomById(roomId);
                if (!room) {
                    throw new Error(`Room with requested id ${roomId} does not exist`);
                }
                const jwt = await this.roomManager.requestJoin(room, user!);
                res.send({
                    token: jwt
                });
            } catch (err) {
                console.error(err);
                res.status(400);
                res.send('Failed to join room');
            }
        });
        app.post('/api/session/create', async (req, res) => {
            try {
                const user = await this.getUserFromAuth(req);
                const room = await this.roomManager.prepareRoom(user!);
                res.send({
                    room: room.id,
                    token: room.jwt
                });
            } catch (err) {
                console.error(err);
                res.status(400);
                res.send('Failed to create room');
            }
        });
        return app;
    }

}
