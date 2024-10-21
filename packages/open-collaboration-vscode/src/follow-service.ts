// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import * as vscode from 'vscode';
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

    async followPeer(peer?: string): Promise<void> {
        if (!CollaborationInstance.Current) {
            return;
        }

        if (!peer) {
            const quickPick = vscode.window.createQuickPick();
            const users = await CollaborationInstance.Current.connectedUsers;
            quickPick.items = users.map(user => ({ label: user.name, detail: user.id }));
            peer = users[(await showQuickPick(quickPick))]?.id;
        }

        if (!peer) {
            return;
        }

        CollaborationInstance.Current.followUser(peer);
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
