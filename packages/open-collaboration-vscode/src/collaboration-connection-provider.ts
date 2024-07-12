import * as vscode from 'vscode';
import { inject, injectable } from "inversify";
import { ConnectionProvider, SocketIoTransportProvider } from 'open-collaboration-protocol'
import fetch from 'node-fetch';
import { ExtensionContext } from './inversify';
import { packageVersion } from './utils/package';

export const OCT_USER_TOKEN = 'oct.userToken';

@injectable()
export class CollaborationConnectionProvider {

    @inject(ExtensionContext)
    private context: vscode.ExtensionContext;

    async createConnection(userToken?: string): Promise<ConnectionProvider | undefined> {
        const serverUrl = vscode.workspace.getConfiguration().get<string>('oct.serverUrl');
        userToken ??= await this.context.secrets.get(OCT_USER_TOKEN);

        if (serverUrl) {
            return new ConnectionProvider({
                url: serverUrl,
                client: 'OCT-VSCode@' + packageVersion,
                opener: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
                transports: [SocketIoTransportProvider],
                userToken,
                fetch
            });
        }
        return undefined;
    }
}
