import { ProtocolBroadcastConnection } from "open-collaboration-protocol";
import * as vscode from 'vscode';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as types from 'open-collaboration-protocol';
import { CollaborationFileSystemProvider } from "./collaboration-file-system";
import { Deferred, DisposableCollection } from "open-collaboration-rpc";
import * as paths from 'path';
import { LOCAL_ORIGIN, OpenCollaborationYjsProvider } from 'open-collaboration-yjs';
import { createMutex } from 'lib0/mutex';
import debounce from 'lodash/debounce';
import { inject, injectable, postConstruct } from "inversify";
import { removeWorkspaceFolders } from "./utils/workspace";

export class DisposablePeer implements vscode.Disposable {

    readonly peer: types.Peer;
    private disposables: vscode.Disposable[] = [];
    private yjsAwareness: awarenessProtocol.Awareness;

    readonly decoration: ClientTextEditorDecorationType;

    get clientId(): number | undefined {
        const states = this.yjsAwareness.getStates() as Map<number, types.ClientAwareness>;
        for (const [clientID, state] of states.entries()) {
            if (state.peer === this.peer.id) {
                return clientID;
            }
        }
        return undefined;
    }

    get lastUpdated(): number | undefined {
        const clientId = this.clientId;
        if (clientId !== undefined) {
            const meta = this.yjsAwareness.meta.get(clientId);
            if (meta) {
                return meta.lastUpdated;
            }
        }
        return undefined;
    }

    constructor(yAwareness: awarenessProtocol.Awareness, peer: types.Peer) {
        this.peer = peer;
        this.yjsAwareness = yAwareness;
        this.decoration = this.createDecorationType();
        this.disposables.push(this.decoration);
    }

    private createDecorationType(): ClientTextEditorDecorationType {
        const color = createColor();
        const colorCss = typeof color === 'string' ? `var(--vscode-${color.replaceAll('.', '-')})` : `rgb(${color[0]}, ${color[1]}, ${color[2]})`
        const selection: vscode.DecorationRenderOptions = {
            backgroundColor: `color-mix(in srgb, ${colorCss} 25%, transparent)`,
            borderRadius: '0.1em'
        };
        const cursor: vscode.ThemableDecorationAttachmentRenderOptions = {
            color: colorCss,
            contentText: 'ᛙ',
            margin: '0px 0px 0px -0.25ch',
            fontWeight: 'bold',
            textDecoration: 'none; position: absolute; display: inline-block; top: 0; font-size: 200%; font-weight: bold; z-index: 1;'
        };
        const before = vscode.window.createTextEditorDecorationType({
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            ...selection,
            before: cursor
        });
        const after = vscode.window.createTextEditorDecorationType({
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            ...selection,
            after: cursor
        });
        const beforeNameTag = this.createNameTag(colorCss, 'top: -1rem;')
        const beforeInvertedNameTag = this.createNameTag(colorCss, 'bottom: -1rem;');

        return new ClientTextEditorDecorationType(before, after, {
            default: beforeNameTag,
            inverted: beforeInvertedNameTag
        }, color);
    }

    private createNameTag(color: string, textDecoration?: string): vscode.TextEditorDecorationType {
        const options: vscode.ThemableDecorationAttachmentRenderOptions = {
            contentText: this.peer.name,
            backgroundColor: color,
            textDecoration: `none; position: absolute; border-radius: 0.15rem; padding:0px 0.5ch; display: inline-block; 
                                pointer-events: none; color: #000; font-size: 0.7rem; z-index: 10; font-weight: bold;${textDecoration ?? ''}`
        }
        return vscode.window.createTextEditorDecorationType({
            backgroundColor: color,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            before: options
        });
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }

}

let colorIndex = 0;
const defaultColors: ([number, number, number] | string)[] = [
    'oct.user.yellow', // Yellow 
    'oct.user.green', // Green
    'oct.user.magenta', // Magenta
    'oct.user.lightGreen', // Light green
    'oct.user.lightOrange', // Light orange
    'oct.user.lightMagenta', // Light magenta
    [92, 45, 145], // Purple
    [0, 178, 148], // Light teal
    [255, 241, 0], // Light yellow
    [180, 160, 255] // Light purple
];

const knownColors = new Set<string>();
function createColor(): [number, number, number] | string {
    if (colorIndex < defaultColors.length) {
        return defaultColors[colorIndex++];
    }
    const o = Math.round, r = Math.random, s = 255;
    let color: [number, number, number];
    do {
        color = [o(r() * s), o(r() * s), o(r() * s)];
    } while (knownColors.has(JSON.stringify(color)));
    knownColors.add(JSON.stringify(color));
    return color;
}

export class ClientTextEditorDecorationType implements vscode.Disposable {
    protected readonly toDispose: vscode.Disposable;
    constructor(
        readonly before: vscode.TextEditorDecorationType,
        readonly after: vscode.TextEditorDecorationType,
        readonly nameTags: {
            default: vscode.TextEditorDecorationType,
            inverted: vscode.TextEditorDecorationType
        },
        readonly color: [number, number, number] | string
    ) {
        this.toDispose = vscode.Disposable.from(
            before, after,
            nameTags.default,
            nameTags.inverted,
        );
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    getThemeColor(): vscode.ThemeColor | undefined {
        return typeof this.color === 'string' ? new vscode.ThemeColor(this.color) : undefined;
    }
}

export const CollaborationInstanceFactory = Symbol('CollaborationInstanceFactory');

export const CollaborationInstanceOptions = Symbol('CollaborationInstanceOptions');

export interface CollaborationInstanceOptions {
    connection: ProtocolBroadcastConnection;
    host: boolean;
    hostId?: string;
    roomId: string;
}

export type CollaborationInstanceFactory = (options: CollaborationInstanceOptions) => CollaborationInstance;

@injectable()
export class CollaborationInstance implements vscode.Disposable {

    static Current: CollaborationInstance | undefined;

    private yjs: Y.Doc = new Y.Doc();
    private yjsAwareness = new awarenessProtocol.Awareness(this.yjs);
    private identity = new Deferred<types.Peer>();
    private toDispose = new DisposableCollection();
    protected yjsProvider: OpenCollaborationYjsProvider;
    private yjsMutex = createMutex();
    private updates = new Set<string>();
    private documentDisposables = new Map<string, DisposableCollection>();
    private peers = new Map<string, DisposablePeer>();
    private throttles = new Map<string, () => void>();

    private _following?: string;
    get following(): string | undefined {
        return this._following;
    }

    private readonly onDidUsersChangeEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidUsersChange: vscode.Event<void> = this.onDidUsersChangeEmitter.event;

    private readonly onDidDisposeEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidDispose: vscode.Event<void> = this.onDidDisposeEmitter.event;

    get connectedUsers(): DisposablePeer[] {
        return Array.from(this.peers.values());
    }

    get ownUserData(): Promise<types.Peer> {
        return this.identity.promise;
    }

    get host(): boolean {
        return this.options.host;
    }

    get roomId(): string {
        return this.options.roomId;
    }

    @inject(CollaborationInstanceOptions)
    private readonly options: CollaborationInstanceOptions;

    @postConstruct()
    protected init(): void {
        CollaborationInstance.Current = this;
        const connection = this.options.connection;
        this.yjsProvider = new OpenCollaborationYjsProvider(connection, this.yjs, this.yjsAwareness);
        this.yjsProvider.connect();
        this.toDispose.push(connection);
        this.toDispose.push(connection.onDisconnect(() => {
            this.dispose();
        }))
        this.toDispose.push(connection.onConnectionError(message => {
            vscode.window.showErrorMessage('Connection error: ' + message);
        }));
        this.toDispose.push(this.yjsProvider);
        this.toDispose.push({
            dispose: () => {
                this.yjs.destroy();
                this.yjsAwareness.destroy();
            }
        });
        this.toDispose.push(this.onDidUsersChangeEmitter);
        this.toDispose.push(this.onDidDisposeEmitter);

        connection.peer.onJoinRequest(async (_, user) => {
            const result = await vscode.window.showInformationMessage(
                `User '${user.email ? `${user.name} (${user.email})` : user.name}' ${user.authProvider ? `via ${user.authProvider} login ` : ''}wants to join the collaboration room`,
                'Allow',
                'Deny'
            );
            const roots = vscode.workspace.workspaceFolders ?? [];
            return result === 'Allow' ? {
                workspace: {
                    name: vscode.workspace.name ?? 'Collaboration',
                    folders: roots.map(e => e.name)
                }
            } : undefined;
        });
        connection.peer.onInit(async (_, initData) => {
            await this.initialize(initData);
        });
        connection.room.onJoin(async (_, peer) => {
            this.peers.set(peer.id, new DisposablePeer(this.yjsAwareness, peer));
            const roots = vscode.workspace.workspaceFolders ?? [];
            const initData: types.InitData = {
                protocol: '0.0.1',
                host: await this.identity.promise,
                guests: Array.from(this.peers.values()).map(e => e.peer),
                capabilities: {},
                permissions: { readonly: false },
                workspace: {
                    name: vscode.workspace.name ?? 'Collaboration',
                    folders: roots.map(e => e.name)
                }
            };
            connection.peer.init(peer.id, initData);
            this.onDidUsersChangeEmitter.fire();
        });
        connection.room.onLeave(async (_, peer) => {
            const disposable = this.peers.get(peer.id);
            if (disposable) {
                disposable.dispose();
                this.peers.delete(peer.id);
                this.onDidUsersChangeEmitter.fire();
            }
            this.rerenderPresence();
        });
        connection.room.onClose(async () => {
            if (!this.options.host) {
                vscode.window.showInformationMessage('Collaboration room closed');
                removeWorkspaceFolders();
                this.dispose();
            }
        });
        connection.peer.onInfo((_, peer) => {
            this.yjsAwareness.setLocalStateField('peer', peer.id);
            this.identity.resolve(peer);
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
                return {
                    content
                };
            } else {
                throw new Error('Could not read file');
            }
        });
        connection.editor.onOpen(async (_, path) => {
            const uri = this.getResourceUri(path);
            if (uri) {
                await vscode.workspace.openTextDocument(uri);
            } else {
                throw new Error('Could not open file');
            }
        });
        this.registerEditorEvents();
    }

    dispose() {
        CollaborationInstance.Current = undefined;
        this.peers.forEach(e => e.dispose());
        this.peers.clear();
        this.documentDisposables.forEach(e => e.dispose());
        this.documentDisposables.clear();
        this.onDidDisposeEmitter.fire();
        this.toDispose.dispose();
    }

    private pushDocumentDisposable(path: string, disposable: vscode.Disposable) {
        let disposables = this.documentDisposables.get(path);
        if (!disposables) {
            disposables = new DisposableCollection();
            this.documentDisposables.set(path, disposables);
        }
        disposables.push(disposable);
    }

    private registerEditorEvents() {

        vscode.workspace.textDocuments.forEach(document => {
            this.registerTextDocument(document);
        });

        this.toDispose.push(vscode.workspace.onDidOpenTextDocument(document => {
            this.registerTextDocument(document);
        }));

        this.toDispose.push(vscode.workspace.onDidChangeTextDocument(event => {
            this.updateTextDocument(event);
        }));

        this.toDispose.push(vscode.window.onDidChangeVisibleTextEditors(() => {
            this.rerenderPresence();
        }));

        this.toDispose.push(vscode.workspace.onDidCloseTextDocument(document => {
            const uri = document.uri.toString();
            this.documentDisposables.get(uri)?.dispose();
            this.documentDisposables.delete(uri);
        }));

        this.toDispose.push(vscode.window.onDidChangeTextEditorSelection(event => {
            this.updateTextSelection(event.textEditor);
        }));
        this.toDispose.push(vscode.window.onDidChangeTextEditorVisibleRanges(event => {
            this.updateTextSelection(event.textEditor);
        }));

        let awarenessDebounce = debounce(() => {
            this.rerenderPresence();
        }, 2000);

        this.yjsAwareness.on('change', async (_: any, origin: string) => {
            if (origin !== LOCAL_ORIGIN) {
                this.updateFollow();
                this.rerenderPresence();
                awarenessDebounce();
            }
        });
    }

    followUser(id?: string) {
        this._following = id;
        this.updateFollow();
    }

    protected updateFollow(): void {
        if (this._following) {
            let userState: types.ClientAwareness | undefined = undefined;
            const states = this.yjsAwareness.getStates() as Map<number, types.ClientAwareness>;
            for (const state of states.values()) {
                const peer = this.peers.get(state.peer);
                if (peer?.peer.id === this._following) {
                    userState = state;
                }
            }
            if (userState) {
                if (types.ClientTextSelection.is(userState.selection)) {
                    this.followSelection(userState.selection);
                }
            }
        }
    }

    protected async followSelection(selection: types.ClientTextSelection): Promise<void> {
        const uri = this.getResourceUri(selection.path);
        if (uri && selection.visibleRanges && selection.visibleRanges.length > 0) {
            let editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
            if (!editor) {
                const document = await vscode.workspace.openTextDocument(uri);
                editor = await vscode.window.showTextDocument(document);
            }
            const visibleRange = selection.visibleRanges[0];
            const range = new vscode.Range(visibleRange.start.line, visibleRange.start.character, visibleRange.end.line, visibleRange.end.character);
            editor.revealRange(range);
        }
    }

    protected updateTextSelection(editor: vscode.TextEditor): void {
        const uri = editor.document.uri;
        const path = this.getProtocolPath(uri);
        if (path) {
            const ytext = this.yjs.getText(path);
            const selections: types.RelativeTextSelection[] = [];
            for (const selection of editor.selections) {
                const start = editor.document.offsetAt(selection.start);
                const end = editor.document.offsetAt(selection.end);
                const direction = selection.isReversed
                    ? types.SelectionDirection.RightToLeft
                    : types.SelectionDirection.LeftToRight;
                const editorSelection: types.RelativeTextSelection = {
                    start: Y.createRelativePositionFromTypeIndex(ytext, start),
                    end: Y.createRelativePositionFromTypeIndex(ytext, end),
                    direction
                };
                selections.push(editorSelection);
            }
            const textSelection: types.ClientTextSelection = {
                path,
                textSelections: selections,
                visibleRanges: editor.visibleRanges.map(range => ({
                    start: {
                        line: range.start.line,
                        character: range.start.character
                    },
                    end: {
                        line: range.end.line,
                        character: range.end.character
                    }
                }))
            };
            this.setSharedSelection(textSelection);
        }
    }

    protected registerTextDocument(document: vscode.TextDocument): void {
        const uri = document.uri;
        const path = this.getProtocolPath(uri);
        if (path) {
            const text = document.getText();
            const yjsText = this.yjs.getText(path);
            if (this.host) {
                this.yjs.transact(() => {
                    yjsText.delete(0, yjsText.length);
                    yjsText.insert(0, text);
                });
            } else {
                this.options.connection.editor.open(this.options.hostId, path);
            }
            const ytextContent = yjsText.toString();
            if (text !== ytextContent) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(uri, new vscode.Range(0, 0, document.lineCount, 0), ytextContent);
                vscode.workspace.applyEdit(edit);
            }

            const resyncThrottle = this.getOrCreateThrottle(path, document);
            const observer = (textEvent: Y.YTextEvent) => {
                this.yjsMutex(async () => {
                    this.updates.add(path);
                    let index = 0;
                    const edit = new vscode.WorkspaceEdit();
                    textEvent.delta.forEach(delta => {
                        if (delta.retain !== undefined) {
                            index += delta.retain;
                        } else if (delta.insert !== undefined) {
                            const pos = document.positionAt(index);
                            const insert = delta.insert as string;
                            edit.insert(uri, pos, insert);
                            index += insert.length;
                        } else if (delta.delete !== undefined) {
                            const pos = document.positionAt(index);
                            const endPos = document.positionAt(index + delta.delete);
                            const range = new vscode.Range(pos.line, pos.character, endPos.line, endPos.character);
                            edit.delete(uri, range);
                        }
                    });
                    await vscode.workspace.applyEdit(edit);
                    this.updates.delete(path);
                    resyncThrottle();
                });
            };
            yjsText.observe(observer);
            this.pushDocumentDisposable(path, { dispose: () => yjsText.unobserve(observer) });
        }
    }

    protected updateTextDocument(event: vscode.TextDocumentChangeEvent): void {
        const uri = event.document.uri;
        const path = this.getProtocolPath(uri);
        if (path) {
            if (this.updates.has(path)) {
                return;
            }
            const ytext = this.yjs.getText(path);
            this.yjsMutex(() => {
                this.yjs.transact(() => {
                    for (const change of event.contentChanges) {
                        ytext.delete(change.rangeOffset, change.rangeLength);
                        ytext.insert(change.rangeOffset, change.text);
                    }
                });
                this.getOrCreateThrottle(path, event.document)();
            });
        }
    }

    private getOrCreateThrottle(path: string, document: vscode.TextDocument): () => void {
        let value = this.throttles.get(path);
        if (!value) {
            value = debounce(() => {
                this.yjsMutex(async () => {
                    const yjsText = this.yjs.getText(path);
                    const newContent = yjsText.toString();
                    if (newContent !== document.getText()) {
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newContent);
                        this.updates.add(path);
                        await vscode.workspace.applyEdit(edit);
                        this.updates.delete(path);
                    }
                });
            }, 200);
            this.throttles.set(path, value);
        }
        return value;
    }

    protected rerenderPresence() {
        const states = this.yjsAwareness.getStates() as Map<number, types.ClientAwareness>;
        for (const [clientID, state] of states.entries()) {
            if (clientID === this.yjs.clientID) {
                // Ignore own awareness state
                continue;
            }
            const peerId = state.peer;
            const peer = this.peers.get(peerId);
            if (!state.selection || !peer) {
                continue;
            }
            if (types.ClientTextSelection.is(state.selection)) {
                this.renderTextPresence(peer, state.selection);
            }
        }
    }

    protected renderTextPresence(peer: DisposablePeer, selection: types.ClientTextSelection): void {
        const nameTagVisible = peer.lastUpdated !== undefined && Date.now() - peer.lastUpdated < 1900;
        const { path, textSelections } = selection;
        const uri = this.getResourceUri(path);
        if (uri) {
            const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString());
            if (editors.length > 0) {
                const model = editors[0].document;
                const afterRanges: vscode.Range[] = [];
                const beforeRanges: vscode.Range[] = [];
                const beforeNameTags: vscode.Range[] = [];
                const beforeInvertedNameTags: vscode.Range[] = [];
                for (const selection of textSelections) {
                    const forward = selection.direction === 1;
                    const startIndex = Y.createAbsolutePositionFromRelativePosition(selection.start, this.yjs);
                    const endIndex = Y.createAbsolutePositionFromRelativePosition(selection.end, this.yjs);
                    if (startIndex && endIndex) {
                        const start = model.positionAt(startIndex.index);
                        const end = model.positionAt(endIndex.index);
                        const inverted = (forward && end.line === 0) || (!forward && start.line === 0);
                        const range = new vscode.Range(start, end);
                        if (forward) {
                            afterRanges.push(range);
                            if (nameTagVisible) {
                                const endRange = new vscode.Range(end, end);
                                (inverted ? beforeInvertedNameTags : beforeNameTags).push(endRange);
                            }
                        } else {
                            beforeRanges.push(range);
                            if (nameTagVisible) {
                                const startRange = new vscode.Range(start, start);
                                (inverted ? beforeInvertedNameTags : beforeNameTags).push(startRange);
                            }
                        }
                    }
                }
                for (const editor of editors) {
                    editor.setDecorations(peer.decoration.before, beforeRanges);
                    editor.setDecorations(peer.decoration.after, afterRanges);
                    editor.setDecorations(peer.decoration.nameTags.default, beforeNameTags);
                    editor.setDecorations(peer.decoration.nameTags.inverted, beforeInvertedNameTags);
                }
            }
        }
    }

    private setSharedSelection(selection?: types.ClientSelection): void {
        this.yjsAwareness.setLocalStateField('selection', selection);
    }

    protected createSelectionFromRelative(selection: types.RelativeTextSelection, model: vscode.TextDocument): vscode.Selection | undefined {
        const start = Y.createAbsolutePositionFromRelativePosition(selection.start, this.yjs);
        const end = Y.createAbsolutePositionFromRelativePosition(selection.end, this.yjs);
        if (start && end) {
            let anchor = model.positionAt(start.index);
            let head = model.positionAt(end.index);
            if (selection.direction === types.SelectionDirection.RightToLeft) {
                [anchor, head] = [head, anchor];
            }
            return new vscode.Selection(anchor, head);
        }
        return undefined;
    }

    protected createRelativeSelection(selection: vscode.Selection, model: vscode.TextDocument, ytext: Y.Text): types.RelativeTextSelection {
        const start = Y.createRelativePositionFromTypeIndex(ytext, model.offsetAt(selection.start));
        const end = Y.createRelativePositionFromTypeIndex(ytext, model.offsetAt(selection.end));
        return {
            start,
            end,
            direction: selection.isReversed ? types.SelectionDirection.RightToLeft : types.SelectionDirection.LeftToRight
        };
    }

    async initialize(data: types.InitData): Promise<void> {
        for (const peer of [data.host, ...data.guests]) {
            this.peers.set(peer.id, new DisposablePeer(this.yjsAwareness, peer));
        }
        this.toDispose.push(vscode.workspace.registerFileSystemProvider('oct', new CollaborationFileSystemProvider(this.options.connection, this.yjs, data.host)));
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
