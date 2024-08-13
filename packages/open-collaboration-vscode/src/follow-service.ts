// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable } from 'inversify';
import { CollaborationInstance, DisposablePeer } from './collaboration-instance';
import { showQuickPick } from './utils/quick-pick';
import { CollaborationStatusViewDataProvider } from './collaboration-status-view';
import { ContextKeyService } from './context-key-service';

@injectable()
export class FollowService {

    @inject(CollaborationStatusViewDataProvider)
    private viewDataProvider: CollaborationStatusViewDataProvider;

    @inject(ContextKeyService)
    private contextKeyService: ContextKeyService;

    async followPeer(peer?: DisposablePeer): Promise<void> {
        if (!CollaborationInstance.Current) {
            return;
        }

        if (!peer) {
            const users = CollaborationInstance.Current.connectedUsers;
            const items = users.map(user => ({ key: user, label: user.peer.name, detail: user.peer.id }));
            peer = await showQuickPick(items);
        }

        if (!peer) {
            return;
        }

        CollaborationInstance.Current.followUser(peer.peer.id);
        this.viewDataProvider.update();
        this.contextKeyService.setFollowing(true);
    }

    async unfollowPeer() {
        if (!CollaborationInstance.Current) {
            return;
        }

        CollaborationInstance.Current.followUser(undefined);
        this.viewDataProvider.update();
        this.contextKeyService.setFollowing(false);
    }

}
