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
        export const Open = new NotificationType<[types.Path]>('editor/open');
        export const Close = new BroadcastType<[types.Path]>('editor/close');
    }

    export namespace Sync {
        export const DataUpdate = new BroadcastType<[string]>('sync/dataUpdate');
        export const DataNotify = new NotificationType<[string]>('sync/dataNotify');
        export const AwarenessUpdate = new BroadcastType<[string]>('sync/awarenessUpdate');
        export const AwarenessQuery = new BroadcastType<[]>('sync/awarenessQuery');
        export const AwarenessNotify = new NotificationType<[string]>('sync/awarenessNotify');
    }

    export namespace FileSystem {
        export const Stat = new RequestType<[types.Path], types.FileSystemStat>('fileSystem/stat');
        export const Mkdir = new RequestType<[types.Path], undefined>('fileSystem/mkdir');
        export const ReadFile = new RequestType<[types.Path], string>('fileSystem/readFile');
        export const WriteFile = new RequestType<[types.Path, string], undefined>('fileSystem/writeFile');
        export const ReadDir = new RequestType<[types.Path], Record<string, types.FileType>>('fileSystem/readDir');
        export const Delete = new RequestType<[types.Path], undefined>('fileSystem/delete');
        export const Rename = new RequestType<[types.Path, types.Path], undefined>('fileSystem/rename');
        export const Change = new BroadcastType<[types.FileChangeEvent]>('fileSystem/change');
    }

}
