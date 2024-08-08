import * as vscode from 'vscode';
import { injectable } from "inversify";
import { CollaborationInstance } from './collaboration-instance';

@injectable()
export class ContextKeyService {

    set(key: string, value: any) {
        vscode.commands.executeCommand(
            'setContext',
            key,
            value
        );
    }

    setConnection(instance: CollaborationInstance | undefined): void {
        this.set('oct.connection', !!instance);
        this.set('oct.roomId', instance?.roomId);
    }

    setFollowing(following: boolean): void {
        this.set('oct.following', following);
    }

}
