// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import 'reflect-metadata';
import * as yargs from 'yargs';
import serverModule from './container';
import { Container } from 'inversify';
import { CollaborationServer } from './collaboration-server';

const container = new Container();
container.load(serverModule);
const server = container.get(CollaborationServer);

const command = yargs.version('0.0.1').command<{
    port: number,
    hostname: string
}>({
    command: 'start',
    describe: 'Start the server',
    // Disable this command's `--help` option so that it is forwarded to Theia's CLI
    builder: {
        'port': {
            type: 'number',
            default: 8100
        },
        'hostname': {
            type: 'string',
            default: 'localhost'
        }
    },
    handler: async args => {
        server.startServer(args);
    }
});
command.parse();
