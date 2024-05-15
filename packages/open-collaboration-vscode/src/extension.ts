import * as vscode from 'vscode';
import { ConnectionProvider } from 'open-collaboration-protocol';
import { JsonMessageEncoding, WebSocketTransportProvider } from 'open-collaboration-rpc';

export function activate(context: vscode.ExtensionContext) {
  const serverUrl = vscode.workspace.getConfiguration().get<string>('oct.serverUrl');

  let connectionProvider: ConnectionProvider | undefined;
  if (serverUrl) {
    connectionProvider = createConnectionProvider(serverUrl);
  } else {
    vscode.window.showInformationMessage('No OCT Server configured. Please set the server URL in the settings', 'Open Settings').then((selection) => {
      if (selection === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'oct.serverUrl');
      }
    });
  }

  vscode.workspace.onDidChangeConfiguration((event) => {
    if(event.affectsConfiguration('oct.serverUrl')) {
      const newUrl = vscode.workspace.getConfiguration().get<string>('oct.serverUrl')
      connectionProvider = newUrl ? createConnectionProvider(newUrl) : undefined;
    }
  });

	
	context.subscriptions.push(
		vscode.commands.registerCommand('oct.login', () => {
			connectionProvider?.login();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('oct.create-room', () => {
			connectionProvider?.createRoom();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('oct.join-room', async () => {
      const roomId = await vscode.window.showInputBox({placeHolder: 'Enter the room ID'})
      if(roomId) {
			  connectionProvider?.joinRoom(roomId);
      }
		})
	);
}

export function deactivate() {
}

function createConnectionProvider(url: string): ConnectionProvider {
  return new ConnectionProvider({
    url,
    opener: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
    transports: [WebSocketTransportProvider],
    encodings: [JsonMessageEncoding]
  });
}