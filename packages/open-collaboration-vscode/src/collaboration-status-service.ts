import * as vscode from 'vscode';
import { inject, injectable, postConstruct } from "inversify";
import { CollaborationRoomService } from './collaboration-room-service';
import { CollaborationStatusViewDataProvider } from './collaboration-status-view';
import { ExtensionContext } from './inversify';
import { ContextKeyService } from './context-key-service';

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
                this.statusBarItem.text = '$(live-share) Share';
                break;
            case StatusBarState.Sharing:
                this.statusBarItem.text = '$(live-share) Sharing';
                break;
            case StatusBarState.Connected:
                this.statusBarItem.text = '$(live-share) Connected';
                break;
        }
    }

}
