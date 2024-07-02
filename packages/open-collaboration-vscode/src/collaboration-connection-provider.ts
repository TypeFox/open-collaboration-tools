import * as vscode from 'vscode';
import { inject, injectable } from "inversify";
import { ConnectionProvider } from 'open-collaboration-protocol';
import { WebSocketTransportProvider } from 'open-collaboration-rpc';
import { WebSocket } from 'ws';
import fetch from 'node-fetch';
import { ExtensionContext } from './inversify';

(global as any).WebSocket = WebSocket;

@injectable()
export class CollaborationConnectionProvider {

    @inject(ExtensionContext)
    private context: vscode.ExtensionContext;

    async createConnection(userToken?: string): Promise<ConnectionProvider | undefined> {
        const serverUrl = vscode.workspace.getConfiguration().get<string>('oct.serverUrl');
        userToken ??= await this.context.secrets.get('oct.userToken');

        if (serverUrl) {
            return new ConnectionProvider({
                url: serverUrl,
                opener: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
                transports: [WebSocketTransportProvider],
                userToken,
                fetch
            });
        }
        return undefined;
    }
}
