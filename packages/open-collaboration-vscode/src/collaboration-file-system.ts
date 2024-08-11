// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { ProtocolBroadcastConnection, Peer } from 'open-collaboration-protocol';
import * as vscode from 'vscode';
import * as Y from 'yjs';

export class CollaborationFileSystemProvider implements vscode.FileSystemProvider {

    private connection: ProtocolBroadcastConnection;
    private yjs: Y.Doc;
    private host: Peer;

    private encoder = new TextEncoder();

    private onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

    constructor(connection: ProtocolBroadcastConnection, yjs: Y.Doc, host: Peer) {
        this.connection = connection;
        this.yjs = yjs;
        this.host = host;
    }

    onDidChangeFile = this.onDidChangeFileEmitter.event;
    watch(): vscode.Disposable {
        return vscode.Disposable.from();
    }
    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const path = this.getHostPath(uri);
        const stat = await this.connection.fs.stat(this.host.id, path);
        return stat;
    }
    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const path = this.getHostPath(uri);
        const record = await this.connection.fs.readdir(this.host.id, path);
        return Object.entries(record);
    }
    createDirectory(uri: vscode.Uri): Promise<void> {
        const path = this.getHostPath(uri);
        return this.connection.fs.mkdir(this.host.id, path);
    }
    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const path = this.getHostPath(uri);
        if (this.yjs.share.has(path)) {
            const stringValue = this.yjs.getText(path);
            return this.encoder.encode(stringValue.toString());
        } else {
            const file = await this.connection.fs.readFile(this.host.id, path);
            return file.content;
        }
    }
    writeFile(uri: vscode.Uri, content: Uint8Array, _options: { readonly create: boolean; readonly overwrite: boolean; }): void {
        const path = this.getHostPath(uri);
        this.connection.fs.writeFile(this.host.id, path, { content });
    }
    delete(uri: vscode.Uri, _options: { readonly recursive: boolean; }): Promise<void> {
        return this.connection.fs.delete(this.host.id, this.getHostPath(uri));
    }
    rename(oldUri: vscode.Uri, newUri: vscode.Uri, _options: { readonly overwrite: boolean; }): Promise<void> {
        return this.connection.fs.rename(this.host.id, this.getHostPath(oldUri), this.getHostPath(newUri));
    }

    triggerEvent(changes: vscode.FileChangeEvent[]): void {
        this.onDidChangeFileEmitter.fire(changes);
    }

    protected getHostPath(uri: vscode.Uri): string {
        // When creating a URI as a guest, we always prepend it with the name of the workspace
        // This just removes the workspace name from the path to get the path expected by the protocol
        const path = uri.path.substring(1).split('/');
        return path.slice(1).join('/');
    }
}
