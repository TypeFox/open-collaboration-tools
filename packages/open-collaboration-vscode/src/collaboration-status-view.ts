import * as vscode from 'vscode';
import { CollaborationInstance, PeerWithColor } from './collaboration-instance';
import { injectable } from 'inversify';

@injectable()
export class CollaborationStatusViewDataProvider implements vscode.TreeDataProvider<PeerWithColor> {

    private onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    private instance: CollaborationInstance | undefined;

    onConnection(instance: CollaborationInstance) {
        this.instance = instance;
        instance.onDidUsersChange(() => {
            this.onDidChangeTreeDataEmitter.fire();
        });
        instance.onDidDispose(() => {
            this.instance = undefined;
            this.onDidChangeTreeDataEmitter.fire();
        });
        this.onDidChangeTreeDataEmitter.fire();
    }

    async getTreeItem(peer: PeerWithColor): Promise<vscode.TreeItem> {
        const self = await this.instance?.ownUserData;
        const treeItem = new vscode.TreeItem(peer.name);
        const tags: string[] = [];
        if (peer.id === self?.id) {
            tags.push('You');
        }
        if (peer.host) {
            tags.push('Host');
        }
        treeItem.description = tags.length ? ('(' + tags.join(' • ') + ')') : undefined;
        treeItem.id = peer.id;
        treeItem.contextValue = 'self';
        if (self?.id !== peer.id) {
            const themeColor = typeof peer.color === 'string' ? new vscode.ThemeColor(peer.color) : undefined;
            treeItem.iconPath = new vscode.ThemeIcon('circle-filled', themeColor);
            treeItem.contextValue = this.instance?.following === peer.id ? 'followedPeer' : 'peer';
        }
        return treeItem;
    }

    getChildren(element?: PeerWithColor): vscode.ProviderResult<PeerWithColor[]> {
        if (!element && this.instance) {
            return this.instance.connectedUsers;
        }
        return []
    }

    update() {
        this.onDidChangeTreeDataEmitter.fire();
    }

}
