import * as vscode from 'vscode';
import { inject, injectable } from "inversify";
import { ConnectionProvider } from 'open-collaboration-protocol';
import { WebSocketTransportProvider } from 'open-collaboration-rpc';
import { WebSocket } from 'ws';
import fetch from 'node-fetch';
import { ExtensionContext } from './inversify';

(global as any).WebSocket = WebSocket;

export const OCT_USER_TOKEN = 'oct.userToken';

@injectable()
export class CollaborationConnectionProvider {

    @inject(ExtensionContext)
    private context: vscode.ExtensionContext;

    async createConnection(userToken?: string): Promise<ConnectionProvider | undefined> {
        let version = 'unknown';
        try {
            version = require('../package.json').version;
        } catch (error) {
            console.error('Failed to get the extension version', error);
        }
        const serverUrl = vscode.workspace.getConfiguration().get<string>('oct.serverUrl');
        userToken ??= await this.context.secrets.get(OCT_USER_TOKEN);

        if (serverUrl) {
            return new ConnectionProvider({
                url: serverUrl,
                client: 'OCT-VSCode@' + version,
                opener: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
                transports: [WebSocketTransportProvider],
                userToken,
                fetch
            });
        }
        return undefined;
    }
}
