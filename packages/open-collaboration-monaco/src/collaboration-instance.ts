import { Deferred, DisposableCollection, ProtocolBroadcastConnection } from "open-collaboration-protocol";
import * as Y from 'yjs';
import * as monaco from 'monaco-editor';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as types from 'open-collaboration-protocol';
import { LOCAL_ORIGIN, OpenCollaborationYjsProvider } from 'open-collaboration-yjs';
import { createMutex } from 'lib0/mutex';
import debounce from 'lodash/debounce';
import { MonacoCollabCallbacks } from "./monaco-api";

export interface Disposable {
    dispose(): void;
}

type PeerDecorationOptions = {
    before: monaco.editor.IModelDecorationOptions,
    after: monaco.editor.IModelDecorationOptions,
    nameTags: {
        default: monaco.editor.IModelDecorationOptions,
        inverted: monaco.editor.IModelDecorationOptions
    }
};

export class DisposablePeer implements Disposable {

    readonly peer: types.Peer;
    private disposables:  Disposable[] = [];
    private yjsAwareness: awarenessProtocol.Awareness;

    readonly decoration: PeerDecorationOptions;

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
        this.decoration = this.createDecorations();
    }

    private createDecorations(): PeerDecorationOptions {
        const color = createColor();
        const colorCss = typeof color === 'string' ? color : `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        const className = `peer-${this.peer.id}`;
        const cursorClassName = `${className}-cursor`;
        const selectionClassName = `${className}-selection`;
        const cursorCss = `.${cursorClassName} {
            background-color: ${color} !important;
            margin: 0px 0px 0px -0.25ch;
            fontWeight: bold;
            textDecoration: none;
            position: absolute;
            display: inline-block;
            top: 0;
            font-size: 200%;
            z-index: 1;
        }`;
        generateCSS(cursorClassName, cursorCss);
        const selectionCss = `.${selectionClassName} {
            backgroundColor: color-mix(in srgb, ${color} 25%, transparent);
            borderRadius: '0.1em';
        }`;
        generateCSS(selectionClassName, selectionCss);
        const cursor: monaco.editor.InjectedTextOptions = {
            inlineClassName: cursorClassName,
            content: 'ᛙ'
        };
        const beforeNameTag = this.createNameTag('default', colorCss, 'top: -1rem;')
        const beforeInvertedNameTag = this.createNameTag('inverted', colorCss, 'bottom: -1rem;');

        return {
            before: {
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                before: cursor,
                className: selectionClassName
            },
            after: {
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                after: cursor,
                className: selectionClassName
            },
            nameTags: {
                default: beforeNameTag,
                inverted: beforeInvertedNameTag
            }
        }
    }

    private createNameTag(prefix: string, color: string, textPosition?: string): monaco.editor.IModelDecorationOptions {
        const className = `peer-${this.peer.id}-nametag-${prefix}`;
        const inlineClassName = `${className}-inline`;
        const inlineCss = `.${inlineClassName} {
            text-decoration: none;
            position: absolute;
            border-radius: 0.15rem;
            padding: 0px 0.5ch;
            display: inline-block;
            pointer-events: none;
            color: #000;
            font-size: 0.7rem;
            z-index: 10;
            font-weight: bold;
            ${textPosition ?? ''}
        }`;
        generateCSS(inlineClassName, inlineCss);
        const options: monaco.editor.InjectedTextOptions = {
            content: this.peer.name,
            inlineClassName
        }
        const css = `.${className} {
            background-color: ${color};
        }`;
        generateCSS(className, css);
        return {
            className,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            before: options
        };
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }

}

let colorIndex = 0;
const defaultColors: ([number, number, number] | string)[] = [
    'yellow', // Yellow
    'green', // Green
    'magenta', // Magenta
    'lightGreen', // Light green
    [255, 178, 123], // Light orange
    [255, 157, 242], // Light magenta
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

function generateCSS(className: string, cssText: string) {
    const style: HTMLStyleElement = document.createElement('style');
    style.textContent = cssText;
    document.head.appendChild(style);
}

// export class ClientTextEditorDecorationType implements Disposable {
//     protected readonly toDispose: Disposable;
//     constructor(
//         readonly before: vscode.TextEditorDecorationType,
//         readonly after: vscode.TextEditorDecorationType,
//         readonly nameTags: {
//             default: vscode.TextEditorDecorationType,
//             inverted: vscode.TextEditorDecorationType
//         },
//         readonly color: [number, number, number] | string
//     ) {
//         this.toDispose = vscode.Disposable.from(
//             before, after,
//             nameTags.default,
//             nameTags.inverted,
//         );
//     }

//     dispose(): void {
//         this.toDispose.dispose();
//     }

//     // getThemeColor(): vscode.ThemeColor | undefined {
//     //     return typeof this.color === 'string' ?  new vscode.ThemeColor(this.color) : undefined;
//     // }
// }

export interface CollaborationInstanceOptions {
    connection: ProtocolBroadcastConnection;
    host: boolean;
    callbacks: MonacoCollabCallbacks;
    editor: monaco.editor.IStandaloneCodeEditor;
    hostId?: string;
    roomToken: string;
}

export class CollaborationInstance implements Disposable {
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
    private decorations = new Map<DisposablePeer, monaco.editor.IEditorDecorationsCollection>();

    private _following?: string;
    get following(): string | undefined {
        return this._following;
    }

    get connectedUsers(): DisposablePeer[] {
        return Array.from(this.peers.values());
    }

    get ownUserData(): Promise<types.Peer> {
        return this.identity.promise;
    }

    get host(): boolean {
        return this.options.host;
    }

    get roomToken(): string {
        return this.options.roomToken;
    }

    constructor(protected options: CollaborationInstanceOptions) {
        const connection = options.connection;
        this.yjsProvider = new OpenCollaborationYjsProvider(this.options.connection, this.yjs, this.yjsAwareness);
        this.yjsProvider.connect();

        this.toDispose.push(this.options.connection);
        this.toDispose.push(this.yjsProvider);
        this.toDispose.push({
            dispose: () => {
                this.yjs.destroy();
                this.yjsAwareness.destroy();
            }
        });

        connection.peer.onJoinRequest(async (_, user) => {
            const result = await this.options.callbacks.onUserRequestsAccess(user);
            return result ? {
                accessGranted: true,
                workspace: {
                    name: 'Collaboration ' + this.roomToken,
                    folders: []
                }
            } : {
                accessGranted: false,
                reason: 'Access denied'
            };
        });
        connection.room.onJoin(async (_, peer) => {
            this.peers.set(peer.id, new DisposablePeer(this.yjsAwareness, peer));
            const initData: types.InitData = {
                protocol: '0.0.1',
                host: await this.identity.promise,
                guests: Array.from(this.peers.values()).map(e => e.peer),
                capabilities: {},
                permissions: { readonly: false },
                workspace: {
                    name: 'Collaboration',
                    folders: []
                }
            };
            connection.peer.init(peer.id, initData);
            this.options.callbacks.onUsersChanged();
        });
        connection.room.onLeave(async (_, peer) => {
            const disposable = this.peers.get(peer.id);
            if (disposable) {
                disposable.dispose();
                this.peers.delete(peer.id);
                this.options.callbacks.onUsersChanged();
            }
            this.rerenderPresence();
        });
        connection.room.onClose(async () => {
            // vscode.workspace.updateWorkspaceFolders(0, vscode.workspace.workspaceFolders?.length ?? 0);
        });
        connection.peer.onInfo((_, peer) => {
            this.yjsAwareness.setLocalStateField('peer', peer.id);
            this.identity.resolve(peer);
        });
        connection.peer.onInit(async (_, initData) => {
            await this.initialize(initData);
        });
        connection.fs.onReadFile(async (_, path) => {
            const uri = this.getResourceUri(path);
            if (uri) {
                const text = this.options.editor.getModel()?.getValue();
                const encoder = new TextEncoder();
                const content = encoder.encode(text);
                return {
                    content
                };
            } else {
                throw new Error('Could not read file');
            }
        });
        this.registerEditorEvents();
    }

    dispose() {
        this.peers.forEach(e => e.dispose());
        this.peers.clear();
        this.documentDisposables.forEach(e => e.dispose());
        this.documentDisposables.clear();
        this.toDispose.dispose();
    }

    private pushDocumentDisposable(path: string, disposable: Disposable) {
        let disposables = this.documentDisposables.get(path);
        if (!disposables) {
            disposables = new DisposableCollection();
            this.documentDisposables.set(path, disposables);
        }
        disposables.push(disposable);
    }

    private registerEditorEvents() {
        const text = this.options.editor.getModel();
        if(text) {
            this.registerTextDocument(text);
        }

        // this.toDispose.push(vscode.workspace.onDidOpenTextDocument(document => {
        //     this.registerTextDocument(document);
        // }));

        this.toDispose.push(this.options.editor.onDidChangeModelContent(event => {
            if(text) {
                this.updateTextDocument(event, text);
            }
        }));

        // this.toDispose.push(vscode.window.onDidChangeVisibleTextEditors(() => {
        //     this.rerenderPresence();
        // }));

        // this.toDispose.push(vscode.workspace.onDidCloseTextDocument(document => {
        //     const uri = document.uri.toString();
        //     this.documentDisposables.get(uri)?.dispose();
        //     this.documentDisposables.delete(uri);
        // }));

        this.toDispose.push(this.options.editor.onDidChangeCursorSelection(_e => {
            this.updateTextSelection(this.options.editor);
        }));
        // this.toDispose.push(this.options.editor.onDidChangeTextEditorVisibleRanges(_e => {
        //     this.updateTextSelection(event.textEditor);
        // }));

        let awarenessTimeout: NodeJS.Timeout | undefined;

        let awarenessDebounce = debounce(() => {
            this.rerenderPresence();
        }, 2000);

        this.yjsAwareness.on('change', async (_: any, origin: string) => {
            if (origin !== LOCAL_ORIGIN) {
                this.updateFollow();
                this.rerenderPresence();
                clearTimeout(awarenessTimeout);
                awarenessDebounce();
            }
        });
    }

    followUser(id?: string) {
        this._following = id;
        if(id) {
            this.updateFollow();
        }
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
            const visibleRange = selection.visibleRanges[0];
            const range = new monaco.Range(visibleRange.start.line, visibleRange.start.character, visibleRange.end.line, visibleRange.end.character);
            this.options.editor.revealRange(range);
        }
    }

    protected updateTextSelection(editor: monaco.editor.IStandaloneCodeEditor): void {
        const document = editor.getModel();
        const selections = editor.getSelections();
        if(!document || !selections) {
            return;
        }
        const uri = document.uri;
        const path = this.getProtocolPath(uri);
        if (path) {
            const ytext = this.yjs.getText(path);
            const textSelections: types.RelativeTextSelection[] = [];
            for (const selection of selections) {
                const start = document.getOffsetAt(selection.getStartPosition());
                const end = document.getOffsetAt(selection.getEndPosition());
                const direction = selection.getDirection() === monaco.SelectionDirection.RTL
                    ? types.SelectionDirection.RightToLeft
                    : types.SelectionDirection.LeftToRight;
                const editorSelection: types.RelativeTextSelection = {
                    start: Y.createRelativePositionFromTypeIndex(ytext, start),
                    end: Y.createRelativePositionFromTypeIndex(ytext, end),
                    direction
                };
                textSelections.push(editorSelection);
            }
            const textSelection: types.ClientTextSelection = {
                path,
                textSelections,
                visibleRanges: editor.getVisibleRanges().map(range => ({
                    start: {
                        line: range.startLineNumber,
                        character: range.startColumn
                    },
                    end: {
                        line: range.endLineNumber,
                        character: range.endColumn
                    }
                }))
            };
            this.setSharedSelection(textSelection);
        }
    }

    protected async registerTextDocument(document: monaco.editor.ITextModel): Promise<void> {
        const uri = document.uri;
        const path = this.getProtocolPath(uri);
        if (path) {
            const text = document.getValue();
            const yjsText = this.yjs.getText(path);
            let ytextContent = '';
            if (this.host) {
                this.yjs.transact(() => {
                    yjsText.delete(0, yjsText.length);
                    yjsText.insert(0, text);
                });
                ytextContent = yjsText.toString();
            }
            if (text !== ytextContent) {
                document.setValue(ytextContent);
            }

            const resyncThrottle = this.getOrCreateThrottle(path, document);
            const observer = (textEvent: Y.YTextEvent) => {
                this.yjsMutex(async () => {
                    this.updates.add(path);
                    let index = 0;
                    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
                    textEvent.delta.forEach(delta => {
                        if (delta.retain !== undefined) {
                            index += delta.retain;
                        } else if (delta.insert !== undefined) {
                            const pos = document.getPositionAt(index);
                            const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
                            const insert = delta.insert as string;
                            edits.push({
                                range,
                                text: insert,
                                forceMoveMarkers: true
                            });
                            index += insert.length;
                        } else if (delta.delete !== undefined) {
                            const pos = document.getPositionAt(index);
                            const endPos = document.getPositionAt(index + delta.delete);
                            const range = new monaco.Range(pos.lineNumber, pos.column, endPos.lineNumber, endPos.column);
                            edits.push({
                                range,
                                text: '',
                                forceMoveMarkers: true
                            });
                        }
                    });
                    this.options.editor.executeEdits(document.id, edits);
                    this.updates.delete(path);
                    resyncThrottle();
                });
            };
            yjsText.observe(observer);
            this.pushDocumentDisposable(path, { dispose: () => yjsText.unobserve(observer) });
        }
    }

    protected updateTextDocument(event: monaco.editor.IModelContentChangedEvent, document: monaco.editor.ITextModel): void {
        const uri = document.uri;
        const path = this.getProtocolPath(uri);
        if (path) {
            if (this.updates.has(path)) {
                return;
            }
            const ytext = this.yjs.getText(path);
            this.yjsMutex(() => {
                this.yjs.transact(() => {
                    for (const change of event.changes) {
                        ytext.delete(change.rangeOffset, change.rangeLength);
                        ytext.insert(change.rangeOffset, change.text);
                    }
                });
                this.getOrCreateThrottle(path, document)();
            });
        }
    }

    private getOrCreateThrottle(path: string, document: monaco.editor.ITextModel): () => void {
        let value = this.throttles.get(path);
        if (!value) {
            value = debounce(() => {
                this.yjsMutex(async () => {
                    const yjsText = this.yjs.getText(path);
                    const newContent = yjsText.toString();
                    if (newContent !== document.getValue()) {
                        const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
                        edits.push({
                            range: new monaco.Range(0, 0, document.getLineCount(), 0),
                            text: newContent
                        });
                        this.updates.add(path);
                        this.options.editor.executeEdits(document.id, edits);
                        this.updates.delete(path);
                    }
                });
            }, 200, {
                leading: false,
                trailing: true
            });
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
                console.log('Selection', state.selection);
                this.renderTextPresence(peer, state.selection);
            }
        }
    }

    protected renderTextPresence(peer: DisposablePeer, selection: types.ClientTextSelection): void {
        const nameTagVisible = peer.lastUpdated !== undefined && Date.now() - peer.lastUpdated < 1900;
        const { path, textSelections } = selection;
        const uri = this.getResourceUri(path);
        if (uri) {
            const model = this.options.editor.getModel();
            const afterRanges: monaco.IRange[] = [];
            const beforeRanges: monaco.IRange[] = [];
            const beforeNameTags: monaco.IRange[] = [];
            const beforeInvertedNameTags: monaco.IRange[] = [];
            for (const selection of textSelections) {
                const forward = selection.direction === 1;
                console.log('Peer', peer.peer.name);
                console.log('Selection direction', this.options.host, selection.direction);
                const startIndex = Y.createAbsolutePositionFromRelativePosition(selection.start, this.yjs);
                const endIndex = Y.createAbsolutePositionFromRelativePosition(selection.end, this.yjs);
                console.log()
                if (model && startIndex && endIndex) {
                    const start = model.getPositionAt(startIndex.index);
                    const end = model.getPositionAt(endIndex.index);
                    console.log('Start', start);
                    console.log('End', end);
                    const inverted = (forward && end.lineNumber === 0) || (!forward && start.lineNumber === 0);
                    const range: monaco.IRange = {
                        startLineNumber: start.lineNumber,
                        startColumn: start.column,
                        endLineNumber: end.lineNumber,
                        endColumn: end.column
                    };
                    if (forward) {
                        afterRanges.push(range);
                        if (nameTagVisible) {
                            const endRange: monaco.IRange = {
                                startLineNumber:end.lineNumber,
                                startColumn: end.column,
                                endLineNumber: end.lineNumber,
                                endColumn: end.column
                            };
                            (inverted ? beforeInvertedNameTags : beforeNameTags).push(endRange);
                        }
                    } else {
                        beforeRanges.push(range);
                        if (nameTagVisible) {
                            const startRange: monaco.IRange = {
                                startLineNumber: start.lineNumber,
                                startColumn: start.column,
                                endLineNumber: start.lineNumber,
                                endColumn: start.column};
                            (inverted ? beforeInvertedNameTags : beforeNameTags).push(startRange);
                        }
                    }
                }
            }
            const beforeDecorations = beforeRanges.map<monaco.editor.IModelDeltaDecoration>(range => ({
                range,
                options: peer.decoration.before
            }));
            const afterDecorations = afterRanges.map<monaco.editor.IModelDeltaDecoration>(range => ({
                range,
                options: peer.decoration.after
            }));
            const beforeNameTagDecorations = beforeNameTags.map<monaco.editor.IModelDeltaDecoration>(range => ({
                range,
                options: peer.decoration.nameTags.default
            }));
            const beforeInvertedNameTagDecorations = beforeInvertedNameTags.map<monaco.editor.IModelDeltaDecoration>(range => ({
                range,
                options: peer.decoration.nameTags.inverted
            }));
            const decorations = beforeDecorations.concat(afterDecorations, beforeNameTagDecorations, beforeInvertedNameTagDecorations);

            console.log('before decorations', beforeDecorations);
            console.log('after decorations', afterDecorations);
            console.log('before name tag decorations', beforeNameTagDecorations);
            console.log('before inverted name tag decorations', beforeInvertedNameTagDecorations);

            this.setDecorations(peer, decorations);
            const decs = model?.getAllDecorations();
            console.log('All decorations', decs);
        }
    }

    private setDecorations(peer: DisposablePeer, decorations: monaco.editor.IModelDeltaDecoration[]): void {
        if(this.decorations.has(peer)) {
            this.decorations.get(peer)?.set(decorations);
        } else {
            this.decorations.set(peer, this.options.editor.createDecorationsCollection(decorations));
        }
    }

    private setSharedSelection(selection?: types.ClientSelection): void {
        this.yjsAwareness.setLocalStateField('selection', selection);
    }

    protected createSelectionFromRelative(selection: types.RelativeTextSelection, model: monaco.editor.ITextModel): monaco.Selection | undefined {
        const start = Y.createAbsolutePositionFromRelativePosition(selection.start, this.yjs);
        const end = Y.createAbsolutePositionFromRelativePosition(selection.end, this.yjs);
        if (start && end) {
            let anchor = model.getPositionAt(start.index);
            let head = model.getPositionAt(end.index);
            if (selection.direction === types.SelectionDirection.RightToLeft) {
                [anchor, head] = [head, anchor];
            }
            return new monaco.Selection(anchor.lineNumber, anchor.column, head.lineNumber, head.column);
        }
        return undefined;
    }

    protected createRelativeSelection(selection: monaco.Selection, model: monaco.editor.ITextModel, ytext: Y.Text): types.RelativeTextSelection {
        const start = Y.createRelativePositionFromTypeIndex(ytext, model.getOffsetAt(selection.getStartPosition()));
        const end = Y.createRelativePositionFromTypeIndex(ytext, model.getOffsetAt(selection.getEndPosition()));
        return {
            start,
            end,
            direction: types.SelectionDirection.LeftToRight // selection.isReversed ? types.SelectionDirection.RightToLeft : types.SelectionDirection.LeftToRight
        };
    }

    async initialize(data: types.InitData): Promise<void> {
        for (const peer of [data.host, ...data.guests]) {
            this.peers.set(peer.id, new DisposablePeer(this.yjsAwareness, peer));
        }
        // this.toDispose.push(vscode.workspace.registerFileSystemProvider('oct', new CollaborationFileSystemProvider(this.options.connection, this.yjs, data.host)));
    }

    getProtocolPath(uri?: monaco.Uri): string | undefined {
        if (!uri) {
            return undefined;
        }
        return uri.path.toString();
    }

    getResourceUri(path?: string): monaco.Uri | undefined {
        // if (!path) {
        //     return undefined;
        // }
        // const parts = path.split('/');
        // const root = parts[0];
        // const rest = parts.slice(1);
        // const stat = (vscode.workspace.workspaceFolders ?? []).find(e => e.name === root);
        // if (stat) {
        //     const uriPath = paths.join(stat.uri.path, ...rest).replaceAll('\\', '/');
        //     const uri = stat.uri.with({ path: uriPath });
        //     return uri;
        // } else {
        //     return undefined;
        // }
        // TODO implement this
        return new monaco.Uri().with({ path });
    }
}
