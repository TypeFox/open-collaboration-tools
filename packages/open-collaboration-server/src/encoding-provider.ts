// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { inject, injectable } from "inversify";
import { JsonMessageEncoding, MessageEncoding } from "open-collaboration-rpc";
import { Logger } from "./utils/logging";

@injectable()
export class EncodingProvider {

    @inject(Symbol('Logger')) protected logger: Logger;

    getEncoding(encoding: string): MessageEncoding {
        switch (encoding) {
            case 'json': return JsonMessageEncoding;
            default: throw this.logger.createErrorAndLog(`Unsupported encoding: ${encoding}`);
        }
    }

}
