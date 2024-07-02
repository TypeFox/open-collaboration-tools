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
import { LogLevelSymbol, checkLogLevel } from './utils/logging';

const container = new Container();
container.load(serverModule);
const server = container.get(CollaborationServer);

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const command = yargs.version('0.0.1').command<{
    port: number,
    hostname: string,
    logLevel: string
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
        const logLevel = checkLogLevel(args.logLevel);
        container.rebind(LogLevelSymbol).toConstantValue(logLevel);
        server.startServer(args);
    }
});
command.parse();
