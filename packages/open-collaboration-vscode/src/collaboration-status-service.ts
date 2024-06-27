import * as vscode from 'vscode';
import { inject, injectable, postConstruct } from "inversify";
import { CollaborationRoomService } from './collaboration-room-service';
import { CollaborationStatusViewDataProvider } from './collaboration-status-view';
import { ExtensionContext } from './inversify';
import { ContextKeyService } from './context-key-service';
import { closeSharedEditors, removeWorkspaceFolders } from './utils/workspace';

export enum StatusBarState {
    Idle,
    Sharing,
    Connected
}

@injectable()
export class CollaborationStatusService {

    @inject(ExtensionContext)
    private context: vscode.ExtensionContext;

    @inject(CollaborationRoomService)
    private roomService: CollaborationRoomService;

    @inject(CollaborationStatusViewDataProvider)
    private viewDataProvider: CollaborationStatusViewDataProvider;

    @inject(ContextKeyService)
    private contextKeyService: ContextKeyService;

    private statusBarItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5);

    @postConstruct()
    protected init(): void {
        this.roomService.onDidJoinRoom(instance => {
            this.setState(instance.host ? StatusBarState.Sharing : StatusBarState.Connected);
            this.viewDataProvider.onConnection(instance);
            this.contextKeyService.setConnection(instance);
            instance.onDidDispose(() => {
                this.setState(StatusBarState.Idle);
                this.contextKeyService.setConnection(undefined);
                if (!instance.host) {
                    closeSharedEditors();
                    removeWorkspaceFolders();
                }
            });
        });
        this.context.subscriptions.push(
            vscode.window.registerTreeDataProvider('oct-room-view', this.viewDataProvider),
            this.statusBarItem
        );
    }

    initialize(commandId: string): void {
        this.setState(StatusBarState.Idle);
        this.statusBarItem.command = commandId;
        this.statusBarItem.show();
    }

    setState(state: StatusBarState) {
        switch (state) {
            case StatusBarState.Idle:
                this.statusBarItem.text = '$(git-compare) Collaborate';
                break;
            case StatusBarState.Sharing:
                this.statusBarItem.text = '$(broadcast) Sharing';
                break;
            case StatusBarState.Connected:
                this.statusBarItem.text = '$(broadcast) Collaborating';
                break;
        }
    }

}
