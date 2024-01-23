// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import * as types from './types';
import { BroadcastType, RequestType, NotificationType } from 'open-collaboration-rpc';

export namespace Messages {

    export namespace Peer {
        export const Join = new RequestType<[types.User], boolean>('peer/join');
        export const Info = new NotificationType<[types.Peer]>('peer/info');
        export const Init = new RequestType<[types.InitRequest], types.InitResponse>('peer/init');
    }

    export namespace Room {
        export const Joined = new BroadcastType<[types.Peer]>('room/joined');
        export const Left = new BroadcastType<[types.Peer]>('room/left');
        export const PermissionsUpdated = new BroadcastType<[types.Permissions]>('room/permissionsUpdated');
        export const Closed = new BroadcastType('room/closed');
    }

    export namespace Editor {
        export const Open = new NotificationType<[string]>('editor/open');
        export const TextChanged = new BroadcastType<[types.EditorChange]>('editor/textChanged');
        export const PresenceUpdated = new BroadcastType<[types.EditorPresenceUpdate]>('editor/presenceUpdated');
        export const PresenceRequest = new RequestType<[types.EditorPresenceRequestParams], types.EditorFilePresence>('editor/presenceRequest');
    }

    export namespace FileSystem {
        export const Stat = new RequestType<[string], types.FileSystemStat>('fileSystem/stat');
        export const Mkdir = new RequestType<[string], undefined>('fileSystem/mkdir');
        export const ReadFile = new RequestType<[string], string>('fileSystem/readFile');
        export const WriteFile = new RequestType<[string, string], undefined>('fileSystem/writeFile');
        export const ReadDir = new RequestType<[string], Record<string, types.FileType>>('fileSystem/readDir');
        export const Delete = new RequestType<[string], undefined>('fileSystem/delete');
        export const Rename = new RequestType<[string, string], undefined>('fileSystem/rename');
        export const Change = new BroadcastType<[types.FileChangeEvent]>('fileSystem/change');
    }

}
