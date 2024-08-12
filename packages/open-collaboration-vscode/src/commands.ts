import * as vscode from 'vscode';
import { inject, injectable } from "inversify";
import { FollowService } from './follow-service';
import { CollaborationInstance, DisposablePeer } from './collaboration-instance';
import { ExtensionContext } from './inversify';
import { CollaborationConnectionProvider, OCT_USER_TOKEN } from './collaboration-connection-provider';
import { QuickPickItem, showQuickPick } from './utils/quick-pick';
import { ContextKeyService } from './context-key-service';
import { CollaborationRoomService } from './collaboration-room-service';
import { CollaborationStatusService } from './collaboration-status-service';
import { closeSharedEditors, removeWorkspaceFolders } from './utils/workspace';
import { ConnectionProvider } from 'open-collaboration-protocol';

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
                this.withConnectionProvider(async connectionProvider => {
                    const instance = CollaborationInstance.Current;
                    if (instance) {
                        const items: QuickPickItem<'invite' | 'stop'>[] = [
                            {
                                key: 'invite',
                                label: '$(clippy) ' + vscode.l10n.t('Invite Others (Copy Code)'),
                                detail: vscode.l10n.t('Copy the invitation code to the clipboard to share with others')
                            }
                        ];
                        if (instance.host) {
                            items.push({
                                key: 'stop',
                                label: '$(circle-slash) ' + vscode.l10n.t('Stop Collaboration Session'),
                                detail: vscode.l10n.t('Stop the collaboration session, stop sharing all content and remove all participants')
                            });
                        } else {
                            items.push({
                                key: 'stop',
                                label: '$(circle-slash) ' + vscode.l10n.t('Leave Collaboration Session'),
                                detail: vscode.l10n.t('Leave the collaboration session, closing the current workspace')
                            });
                        }
                        const result = await showQuickPick(items, {
                            placeholder: vscode.l10n.t('Select Collaboration Option')
                        });
                        if (result === 'invite') {
                            vscode.env.clipboard.writeText(instance.roomId);
                            vscode.window.showInformationMessage(vscode.l10n.t('Invitation code {0} copied to clipboard!', instance.roomId));
                        } else if (result === 'stop') {
                            vscode.commands.executeCommand('oct.closeConnection');
                        }
                    } else {
                        const items: QuickPickItem<'join' | 'create'>[] = [
                            {
                                key: 'join',
                                label: '$(vm-connect) ' + vscode.l10n.t('Join Collaboration Session'),
                                detail: vscode.l10n.t('Join an open collaboration session using an invitation code')
                            }
                        ];
                        if (vscode.workspace.workspaceFolders?.length) {
                            items.unshift({
                                key: 'create',
                                label: '$(add) ' + vscode.l10n.t('Create New Collaboration Session'),
                                detail: vscode.l10n.t('Become the host of a new collaboration session in your current workspace')
                            });
                        }
                        const index = await showQuickPick(items, {
                            placeholder: vscode.l10n.t('Select Collaboration Option')
                        });
                        if (index === 'create') {
                            await this.roomService.createRoom(connectionProvider);
                        } else if (index === 'join') {
                            await this.roomService.joinRoom(connectionProvider);
                        }
                    }
                });
            }),
            vscode.commands.registerCommand('oct.joinRoom', async () => {
                await this.withConnectionProvider(async connectionProvider => {
                    await this.roomService.joinRoom(connectionProvider);
                });
            }),
            vscode.commands.registerCommand('oct.createRoom', async () => {
                await this.withConnectionProvider(async connectionProvider => {
                    await this.roomService.createRoom(connectionProvider);
                });
            }),
            vscode.commands.registerCommand('oct.closeConnection', async () => {
                const instance = CollaborationInstance.Current;
                if (instance) {
                    await instance.leave();
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
                vscode.window.showInformationMessage(vscode.l10n.t('Signed out successfully!'));
            })
        );
        this.statusService.initialize('oct.enter');
    }

    private async withConnectionProvider(callback: (connectionProvider: ConnectionProvider) => (Promise<void> | void)): Promise<void> {
        const connectionProvider = await this.connectionProvider.createConnection();
        if (connectionProvider) {
            await callback(connectionProvider);
        } else {
            const message = vscode.l10n.t('No OCT Server configured. Please set the server URL in the settings.');
            const openSettings = vscode.l10n.t('Open Settings');
            vscode.window.showInformationMessage(message, openSettings).then((selection) => {
                if (selection === openSettings) {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'oct.serverUrl');
                }
            });
        }
    }

}
