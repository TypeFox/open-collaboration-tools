// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import * as vscode from 'vscode';
import 'reflect-metadata';
import { CollaborationInstance } from './collaboration-instance';
import { CollaborationRoomService } from './collaboration-room-service';
import { closeSharedEditors, removeWorkspaceFolders } from './utils/workspace';
import { createContainer } from './inversify';
import { Commands } from './commands';
import { Fetch } from './collaboration-connection-provider';
import fetch from 'node-fetch';

export async function activate(context: vscode.ExtensionContext) {
    const container = createContainer(context);
    container.bind(Fetch).toConstantValue(fetch);
    const commands = container.get(Commands);
    commands.initialize();
    const roomService = container.get(CollaborationRoomService);

    roomService.tryConnect().then(value => {
        if (!value) {
            closeSharedEditors();
            removeWorkspaceFolders();
        }
    });
}

export async function deactivate(): Promise<void> {
    await CollaborationInstance.Current?.leave();
    CollaborationInstance.Current?.dispose();
    await closeSharedEditors();
    removeWorkspaceFolders();
}
