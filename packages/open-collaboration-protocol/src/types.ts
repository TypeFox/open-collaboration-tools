// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

export type Path = string;

export interface User {
    name: string
    email?: string
}

export interface Peer {
    id: string
    host: boolean
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

export interface FileData {
    version: string
    /**
     * Base64 encoded content.
     */
    content: string
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
