// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

export interface User {
    name: string
    email?: string
}

export interface Peer {
    id: string
    name: string
    email?: string
}

export interface InitRequest {
    protocol: string;
}

export interface InitResponse {
    protocol: string;
    host: Peer;
    guests: Peer[];
    permissions: Permissions;
    capabilities: Capabilities;
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
    path: string
}

export enum FileChangeEventType {
    Create = 0,
    Update = 1,
    Delete = 2
}

export interface EditorChange {
    path: string
    content: EditorContentUpdate[]
}

export interface EditorContentUpdate {
    range: EditorRange
    text: string
}

export interface EditorRange {
    start: EditorPosition
    end: EditorPosition
}

export interface EditorPosition {
    line: number
    character: number
}

export interface EditorPresenceRequestParams {
    path: string
}

export interface EditorPresenceUpdate {
    path: string
    selection: EditorSelection[]
}

export interface EditorFilePresence {
    path: string
    presences: EditorPeerPresence[]
}

export interface EditorPeerPresence {
    peerId: string
    selection: EditorSelection[]
}

export interface EditorSelection {
    direction: EditorSelectionDirection
    range: EditorRange
}

export enum EditorSelectionDirection {
    Forward = 0,
    Backward = 1
}
