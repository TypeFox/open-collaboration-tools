import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	// const serverUrlConfig = vscode.workspace.getConfiguration('oct.serverUrl')
	
	context.subscriptions.push(
		vscode.commands.registerCommand('oct.login', () => {
			// TODO
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('oct.create-room', () => {
			// TODO
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('oct.join-room', () => {
			// TODO
		})
	);
}

export function deactivate() {
}
