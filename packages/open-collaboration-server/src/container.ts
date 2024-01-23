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
import { EncodingProvider } from './encoding-provider';

export default new ContainerModule(bind => {
    bind(CollaborationServer).toSelf().inSingletonScope();
    bind(RoomManager).toSelf().inSingletonScope();
    bind(CredentialsManager).toSelf().inSingletonScope();
    bind(UserManager).toSelf().inSingletonScope();
    bind(MessageRelay).toSelf().inSingletonScope();
    bind(EncodingProvider).toSelf().inSingletonScope();
    bind(PeerImpl).toSelf().inTransientScope();
    bind(PeerFactory).toFactory(context => (peerInfo: PeerInfo) => {
        const child = new Container();
        child.parent = context.container;
        child.bind(PeerInfo).toConstantValue(peerInfo);
        return child.get(PeerImpl);
    });
});
