import * as vscode from 'vscode';
import { inject, injectable } from "inversify";
import { CollaborationInstance } from "./collaboration-instance";
import { showQuickPick } from './utils/quick-pick';
import { CollaborationStatusViewDataProvider } from './collaboration-status-view';

@injectable()
export class FollowService {

    @inject(CollaborationStatusViewDataProvider)
    private viewDataProvider: CollaborationStatusViewDataProvider;

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
    }

    async unfollowPeer() {
        if (!CollaborationInstance.Current) {
            return;
        }

        CollaborationInstance.Current.followUser(undefined);
        this.viewDataProvider.update();
    }

}
