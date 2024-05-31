import { ProtocolBroadcastConnection } from "open-collaboration-protocol";
import * as vscode from 'vscode';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as types from 'open-collaboration-protocol';
import { CollaborationFileSystemProvider } from "./collaboration-file-system";
import { Deferred } from "open-collaboration-rpc";
import * as paths from 'path';
import { OpenCollaborationYjsProvider } from 'open-collaboration-yjs';
// import { createMutex } from 'lib0/mutex';

export interface RelativeSelection {
    date: number;
    start: Y.RelativePosition;
    end: Y.RelativePosition;
    direction: 'ltr' | 'rtl';
}

export interface AwarenessState {
    peer: string;
    currentSelection?: {
        path: string;
        selection: RelativeSelection;
    }
}

export class CollaborationInstance {

    private connection: ProtocolBroadcastConnection;
    private yjs: Y.Doc = new Y.Doc();
    private yjsAwareness = new awarenessProtocol.Awareness(this.yjs);
    private identity = new Deferred<types.Peer>();
    protected yjsProvider: OpenCollaborationYjsProvider;
    // private yjsMutex = createMutex();

    constructor(connection: ProtocolBroadcastConnection, private host: boolean) {
        this.connection = connection;
        this.yjsProvider = new OpenCollaborationYjsProvider(connection, this.yjs, this.yjsAwareness);
        this.yjsProvider.connect();

        connection.peer.onJoinRequest(() => {
            const roots = vscode.workspace.workspaceFolders ?? [];
            return {
                workspace: {
                    name: vscode.workspace.name ?? 'Collaboration',
                    folders: roots.map(e => e.name)
                }
            };
        });
        connection.peer.onInfo((_, peer) => {
            this.yjsAwareness.setLocalStateField('peer', peer.id);
            this.identity.resolve(peer);
        });
        connection.peer.onInit(async () => {
            const roots = vscode.workspace.workspaceFolders ?? [];
            const response: types.InitResponse = {
                protocol: '0.0.1',
                host: await this.identity.promise,
                guests: [],
                capabilities: {},
                permissions: { readonly: false },
                workspace: {
                    name: vscode.workspace.name ?? 'Collaboration',
                    folders: roots.map(e => e.name)
                }
            };
            return response;
        });
        connection.fs.onStat(async (_, path) => {
            const uri = this.getResourceUri(path);
            if (uri) {
                const stat = await vscode.workspace.fs.stat(uri);
                return {
                    type: stat.type === vscode.FileType.Directory ? types.FileType.Directory : types.FileType.File,
                    mtime: stat.mtime,
                    ctime: stat.ctime,
                    size: stat.size
                };
            } else {
                throw new Error('Could not stat file');
            }
        });
        connection.fs.onReaddir(async (_, path) => {
            const uri = this.getResourceUri(path);
            if (uri) {
                const result = await vscode.workspace.fs.readDirectory(uri);
                return result.reduce((acc, [name, type]) => { acc[name] = type; return acc; }, {} as types.FileSystemDirectory);
            } else {
                throw new Error('Could not read directory');
            }
        });
        connection.fs.onReadFile(async (_, path) => {
            const uri = this.getResourceUri(path);
            if (uri) {
                const content = await vscode.workspace.fs.readFile(uri);
                return content.toString();
            } else {
                throw new Error('Could not read file');
            }
        });
        this.registerEditorEvents();
    }

    private registerEditorEvents() {

        vscode.workspace.onDidOpenTextDocument(async document => {
            const uri = document.uri;
            const path = this.getProtocolPath(uri);
            if (path && this.host) {
                const text = document.getText();
                this.yjs.getText(path).insert(0, text);
            }
        });

        // let updates = new Set<string>();
        // vscode.workspace.onDidChangeTextDocument(async event => {
        //     const uri = event.document.uri;
        //     const path = this.getProtocolPath(uri);
        //     if (path) {
        //         const text = event.document.getText();
        //         this.yjs.getText(path).delete(0, this.yjs.getText(path).length);
        //         this.yjs.getText(path).insert(0, text);
        //     }
        // });
        vscode.window.onDidChangeTextEditorSelection(async event => {
            const uri = event.textEditor.document.uri;
            const path = this.getProtocolPath(uri);
            if (path) {
                const ytext = this.yjs.getText(path);
                const selection = event.selections[0];
                const start = event.textEditor.document.offsetAt(selection.start);
                const end = event.textEditor.document.offsetAt(selection.end);
                const direction = selection.isReversed ? 'rtl' : 'ltr';
                const editorSelection: RelativeSelection = {
                    // Force update the selection
                    date: Date.now(),
                    start: Y.createRelativePositionFromTypeIndex(ytext, start),
                    end: Y.createRelativePositionFromTypeIndex(ytext, end),
                    direction
                };
                this.setSharedSelection(path, editorSelection);
            }
        });

        this.yjsAwareness.on('change', () => {
            this.rerenderPresence();
        });
    }

    protected rerenderPresence() {
        const decorations = new Map<string, vscode.DecorationRenderOptions[]>();
        const states = this.yjsAwareness.getStates() as Map<number, AwarenessState>;
        for (const [clientID, state] of states.entries()) {
            if (clientID === this.yjs.clientID) {
                // Ignore own awareness state
                continue;
            }
            const peer = state.peer;
            if (!state.currentSelection) {
                continue;
            }
            const { path, selection } = state.currentSelection;
            const uri = this.getResourceUri(path);
            if (uri) {
                const model = vscode.workspace.textDocuments.find(e => e.uri.toString() === uri.toString());
                if (model) {
                    let existing = decorations.get(path);
                    if (!existing) {
                        existing = [];
                        decorations.set(path, existing);
                    }
                    // const forward = selection.direction === 'ltr';
                    const startIndex = Y.createAbsolutePositionFromRelativePosition(selection.start, this.yjs);
                    const endIndex = Y.createAbsolutePositionFromRelativePosition(selection.end, this.yjs);
                    if (startIndex && endIndex) {
                        const start = model.positionAt(startIndex.index);
                        const end = model.positionAt(endIndex.index);
                        // const inverted = (forward && end.line === 0) || (!forward && start.line === 0);
                        const range = new vscode.Range(start, end);
                        const type = vscode.window.createTextEditorDecorationType({
                            before: {
                                contentText: peer,
                                color: new vscode.ThemeColor('editorLineNumber.foreground'),
                                margin: '0 0 0 0'
                            }
                        });
                        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString());
                        for (const editor of editors) {
                            editor.setDecorations(type, [range]);
                        }
                    }
                }
            }
        }
    }

    private setSharedSelection(path: string, selection: RelativeSelection): void {
        this.yjsAwareness.setLocalStateField('currentSelection', {
            path,
            selection
        });
    }

    protected createSelectionFromRelative(selection: RelativeSelection, model: vscode.TextDocument): vscode.Selection | undefined {
        const start = Y.createAbsolutePositionFromRelativePosition(selection.start, this.yjs);
        const end = Y.createAbsolutePositionFromRelativePosition(selection.end, this.yjs);
        if (start && end) {
            let anchor = model.positionAt(start.index);
            let head = model.positionAt(end.index);
            if (selection.direction === 'rtl') {
                [anchor, head] = [head, anchor];
            }
            return new vscode.Selection(anchor, head);
        }
        return undefined;
    }

    protected createRelativeSelection(selection: vscode.Selection, model: vscode.TextDocument, ytext: Y.Text): RelativeSelection {
        const start = Y.createRelativePositionFromTypeIndex(ytext, model.offsetAt(selection.start));
        const end = Y.createRelativePositionFromTypeIndex(ytext, model.offsetAt(selection.end));
        return {
            date: Date.now(),
            start,
            end,
            direction: selection.isReversed ? 'rtl' : 'ltr'
        };
    }

    async initialize(): Promise<void> {
        vscode.workspace.registerFileSystemProvider('collab', new CollaborationFileSystemProvider(this.connection, this.yjs));
        await this.connection.peer.init('', {
            protocol: '0.0.1'
        });
    }

    getProtocolPath(uri?: vscode.Uri): string | undefined {
        if (!uri) {
            return undefined;
        }
        const path = uri.path.toString();
        const roots = (vscode.workspace.workspaceFolders ?? []);
        for (const root of roots) {
            const rootUri = root.uri.path + '/';
            if (path.startsWith(rootUri)) {
                return root.name + '/' + path.substring(rootUri.length);
            }
        }
        return undefined;
    }

    getResourceUri(path?: string): vscode.Uri | undefined {
        if (!path) {
            return undefined;
        }
        const parts = path.split('/');
        const root = parts[0];
        const rest = parts.slice(1);
        const stat = (vscode.workspace.workspaceFolders ?? []).find(e => e.name === root);
        if (stat) {
            const uriPath = paths.join(stat.uri.path, ...rest).replaceAll('\\', '/');
            const uri = stat.uri.with({ path: uriPath });
            return uri;
        } else {
            return undefined;
        }
    }

}