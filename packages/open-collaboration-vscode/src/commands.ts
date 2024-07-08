import * as vscode from 'vscode';
import { inject, injectable } from "inversify";
import { FollowService } from './follow-service';
import { CollaborationInstance, DisposablePeer } from './collaboration-instance';
import { ExtensionContext } from './inversify';
import { CollaborationConnectionProvider, OCT_USER_TOKEN } from './collaboration-connection-provider';
import { showQuickPick } from './utils/quick-pick';
import { ContextKeyService } from './context-key-service';
import { CollaborationRoomService } from './collaboration-room-service';
import { CollaborationStatusService } from './collaboration-status-service';
import { closeSharedEditors, removeWorkspaceFolders } from './utils/workspace';

@injectable()
export class Commands {

    @inject(ExtensionContext)
    private context: vscode.ExtensionContext;

    @inject(FollowService)
    private followService: FollowService;

    @inject(ContextKeyService)
    private contextKeyService: ContextKeyService;

    @inject(CollaborationConnectionProvider)
    private connectionProvider: CollaborationConnectionProvider;

    @inject(CollaborationRoomService)
    private roomService: CollaborationRoomService;

    @inject(CollaborationStatusService)
    private statusService: CollaborationStatusService;

    initialize(): void {
        this.context.subscriptions.push(
            vscode.commands.registerCommand('oct.followPeer', (peer?: DisposablePeer) => this.followService.followPeer(peer)),
            vscode.commands.registerCommand('oct.stopFollowPeer', () => this.followService.unfollowPeer()),
            vscode.commands.registerCommand('oct.enter', async () => {
                const connectionProvider = await this.connectionProvider.createConnection();
                const instance = CollaborationInstance.Current;
                if (!connectionProvider) {
                    vscode.window.showInformationMessage('No OCT Server configured. Please set the server URL in the settings', 'Open Settings').then((selection) => {
                        if (selection === 'Open Settings') {
                            vscode.commands.executeCommand('workbench.action.openSettings', 'oct.serverUrl');
                        }
                    });
                } else if (instance) {
                    const quickPick = vscode.window.createQuickPick();
                    quickPick.placeholder = 'Select collaboration option';
                    const items: vscode.QuickPickItem[] = [
                        { label: '$(close) Close Current Session' },
                    ];
                    if (instance.host) {
                        items.push({ label: '$(copy) Copy Invite Code' });
                    }
                    quickPick.items = items;
                    const index = await showQuickPick(quickPick);
                    if (index === 0) {
                        vscode.commands.executeCommand('oct.closeConnection');
                    } else if (index === 1) {
                        vscode.env.clipboard.writeText(instance.roomId ?? '');
                        vscode.window.showInformationMessage(`Room ID ${instance.roomId} copied to clipboard`);
                    }
                } else {
                    const quickPick = vscode.window.createQuickPick();
                    quickPick.placeholder = 'Select collaboration option';
                    quickPick.items = [
                        { label: '$(add) Create New Collaboration Session' },
                        { label: '$(vm-connect) Join Collaboration Session' }
                    ];
                    const index = await showQuickPick(quickPick);
                    if (index === 0) {
                        try {
                            await this.roomService.createRoom(connectionProvider);
                        } catch (error) {
                            vscode.window.showErrorMessage('Failed to create room: ' + String(error));
                        }
                    } else if (index === 1) {
                        try {
                            await this.roomService.joinRoom(connectionProvider);
                        } catch (error) {
                            vscode.window.showErrorMessage('Failed to join room: ' + String(error));
                        
                        }
                    }
                }
            }),
            vscode.commands.registerCommand('oct.closeConnection', async () => {
                const instance = CollaborationInstance.Current;
                if (instance) {
                    instance.dispose();
                    this.contextKeyService.setConnection(undefined);
                    if (!instance.host) {
                        await closeSharedEditors();
                        removeWorkspaceFolders();
                    }
                }
            }),
            vscode.commands.registerCommand('oct.signOut', async () => {
                await vscode.commands.executeCommand('oct.closeConnection');
                await this.context.secrets.delete(OCT_USER_TOKEN);
                vscode.window.showInformationMessage('Signed out successfully');
            })
        );
        this.statusService.initialize('oct.enter');
    }

}
