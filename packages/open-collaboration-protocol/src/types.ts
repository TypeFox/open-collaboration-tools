// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

export type Path = string;
export type Token = string;
export type Id = string;
export type Binary = Uint8Array;

// HTTP API

export interface CreateRoomResponse {
    roomId: Id;
    roomToken: Token;
    loginToken?: Token;
}

export interface JoinRoomResponse {
    roomId: Id;
    roomToken: Token;
    loginToken?: Token;
    workspace: Workspace;
    host: Peer;
}

export interface ProtocolServerMetaData {
    owner: string;
    version: string;
    transports: string[];
    publicKey: string;
}

// Transport based API

export interface User {
    name: string
    email?: string
}

export interface JoinResponse {
    workspace: Workspace
}

export interface Peer {
    id: Id
    host: boolean
    name: string
    publicKey: string
    email?: string
}

export interface InitRequest {
    protocol: string;
}

export interface InitResponse {
    protocol: string
    host: Peer
    guests: Peer[]
    permissions: Permissions
    capabilities: Capabilities
    workspace: Workspace
}

export interface Workspace {
    name: string
    folders: string[]
}

export interface Capabilities {

}

export interface Room {
    id: string
    host: Peer
    guests: Peer[]
    permissions: Permissions
}

export interface Permissions {
    readonly: boolean;
    [key: string]: string | boolean;
};

export interface FileSystemStat {
    type: FileType;
    mtime: number;
    ctime: number;
    size: number;
    permissions?: FilePermission;
}

export interface FileSystemDirectory {
    [name: string]: FileType
}

export interface FileData {
    content: Binary
}

export enum FilePermission {
    /**
     * File is readonly.
     */
    Readonly = 1
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64
}

export interface FileChangeEvent {
    changes: FileChange[]
}

export interface FileChange {
    type: FileChangeEventType
    path: Path
}

export enum FileChangeEventType {
    Create = 0,
    Update = 1,
    Delete = 2
}

export interface ClientAwareness {
    /**
     * The peer id of the client.
     */
    peer: string;
    /**
     * The client's current editor selection.
     */
    selection?: ClientSelection;
}

export interface ClientSelection {
    path: Path;
}

export interface ClientTextSelection extends ClientSelection {
    visibleRanges?: Range[];
    textSelections: RelativeTextSelection[];
}

export namespace ClientTextSelection {
    export function is(selection?: ClientSelection): selection is ClientTextSelection {
        if (!selection) {
            return false;
        }
        const textSelection = selection as ClientTextSelection;
        return Array.isArray(textSelection.textSelections);
    }
}

export namespace SelectionDirection {
    export const LeftToRight = 1;
    export const RightToLeft = 2;
}

export interface ClientId {
    client: number
    clock: number
}

export interface RelativeTextSelection {
    start: RelativeTextPosition;
    end: RelativeTextPosition;
    direction: SelectionDirection;
}

export interface RelativeTextPosition {
    type: ClientId | null
    tname: string | null
    item: ClientId | null
    assoc: number
}

export interface Position {
    line: number;
    character: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export type SelectionDirection = 1 | 2;
