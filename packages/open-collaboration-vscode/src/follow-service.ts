import * as vscode from 'vscode';
import { inject, injectable } from "inversify";
import { CollaborationInstance, DisposablePeer } from "./collaboration-instance";
import { showQuickPick } from './utils/quick-pick';
import { CollaborationStatusViewDataProvider } from './collaboration-status-view';

@injectable()
export class FollowService {

    @inject(CollaborationStatusViewDataProvider)
    private viewDataProvider: CollaborationStatusViewDataProvider;

    async followPeer(peer?: DisposablePeer): Promise<void> {
        if (!CollaborationInstance.Current) {
            return;
        }

        if (!peer) {
            const quickPick = vscode.window.createQuickPick();
            const users = CollaborationInstance.Current.connectedUsers
            quickPick.items = users.map(user => ({ label: user.peer.name, detail: user.peer.id }));
            peer = users[(await showQuickPick(quickPick))];
        }

        if (!peer) {
            return;
        }

        CollaborationInstance.Current.followUser(peer.peer.id);
        this.viewDataProvider.update();
    }

    async unfollowPeer() {
        if (!CollaborationInstance.Current) {
            return;
        }

        CollaborationInstance.Current.followUser(undefined);
        this.viewDataProvider.update();
    }

}
