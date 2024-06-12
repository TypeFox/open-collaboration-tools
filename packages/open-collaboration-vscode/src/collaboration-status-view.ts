import * as vscode from 'vscode';
import { CollaborationInstance, DisposablePeer } from './collaboration-instance';

export class CollaborationStatusViewDataProvider implements vscode.TreeDataProvider<DisposablePeer> {

    
    private onDidChangeTreeDataEmitter = new vscode.EventEmitter<DisposablePeer[] | undefined>();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    
    instance: CollaborationInstance | undefined;

    onConnection(instance: CollaborationInstance) {
        this.instance = instance;
        instance.onUsersChanged(() => {
            this.onDidChangeTreeDataEmitter.fire(undefined);
        });
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }
    
    async getTreeItem(element: DisposablePeer): Promise<vscode.TreeItem> {
        const self = await this.instance?.ownUserData;
        const treeItem = new vscode.TreeItem(element.peer.id === self?.id ? `${element.peer.name} (you)` : element.peer.name);
        treeItem.id = element.peer.id;
        treeItem.contextValue = 'self';
        if(self?.id !== element.peer.id) {
            treeItem.iconPath = new vscode.ThemeIcon('circle-filled', element.decoration.getThemeColor());
            treeItem.contextValue = this.instance?.following === treeItem.id ? 'followedPeer' : 'peer';
        }
        return treeItem;
    }

    getChildren(element?: DisposablePeer): vscode.ProviderResult<DisposablePeer[]> {
        if(!element && this.instance) {
            return this.instance.connectedUsers
        }
        return []
    }

    updateAllPeers() {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

}