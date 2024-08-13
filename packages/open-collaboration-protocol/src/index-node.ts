// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { setCryptoModule } from './utils/crypto';
import crypto from 'node:crypto';
setCryptoModule(crypto.webcrypto);

export * from './index';
