// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Container, ContainerModule } from 'inversify';
import { CollaborationServer } from './collaboration-server';
import { CredentialsManager } from './credentials-manager';
import { MessageRelay } from './message-relay';
import { PeerFactory, PeerImpl } from './peer';
import { RoomManager } from './room-manager';
import { PeerInfo } from './types';
import { UserManager } from './user-manager';
import { ConsoleLogger, LogLevel, LogLevelSymbol, LoggerSymbol } from './utils/logging';
import { SimpleLoginEndpoint } from './auth-endpoints/simple-login-endpoint';
import { AuthEndpoint } from './auth-endpoints/auth-endpoint';
import { OAuthEnpoint } from './auth-endpoints/oauth-endpoint';

export default new ContainerModule(bind => {
    bind(LoggerSymbol).to(ConsoleLogger).inSingletonScope();
    bind(LogLevelSymbol).toConstantValue(LogLevel.info);
    bind(CollaborationServer).toSelf().inSingletonScope();
    bind(RoomManager).toSelf().inSingletonScope();
    bind(CredentialsManager).toSelf().inSingletonScope();
    bind(UserManager).toSelf().inSingletonScope();
    bind(MessageRelay).toSelf().inSingletonScope();
    bind(PeerImpl).toSelf().inTransientScope();
    bind(PeerFactory).toFactory(context => (peerInfo: PeerInfo) => {
        const child = new Container();
        child.parent = context.container;
        child.bind(PeerInfo).toConstantValue(peerInfo);
        return child.get(PeerImpl);
    });

    bind(SimpleLoginEndpoint).toSelf().inSingletonScope();
    bind(AuthEndpoint).toService(SimpleLoginEndpoint);
    bind(OAuthEnpoint).toSelf().inSingletonScope();
    bind(AuthEndpoint).toService(OAuthEnpoint);
});
