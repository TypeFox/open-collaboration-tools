// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import * as fflate from 'fflate';

export namespace Compression {

    export type Algorithm = 'none' | 'gzip' | (string & {});

    export function bestFit(algs: Algorithm[]): Algorithm;
    export function bestFit(algs: Algorithm[][]): Algorithm;
    export function bestFit(algs: Algorithm[][] | Algorithm[]): Algorithm {
        if (algs.length === 0) {
            return 'none';
        } else if (typeof algs[0] === 'string') {
            return algs[0];
        } else {
            const nested = algs as Algorithm[][];
            const ranking = new Map<Algorithm, number>();
            const first = algs[0];
            for (let i = 0; i < first.length; i++) {
                const alg = first[i];
                if (alg !== 'none') {
                    ranking.set(alg, i);
                }
            }
            for (let i = 1; i < nested.length; i++) {
                const list = nested[i];
                const found = new Set<Algorithm>();
                for (let j = 0; j < list.length; j++) {
                    const alg = list[j];
                    if (alg !== 'none' && ranking.has(alg)) {
                        const rank = ranking.get(alg) ?? 0;
                        ranking.set(alg, rank + j);
                        found.add(alg);
                    }
                }
                for (const alg of ranking.keys()) {
                    if (!found.has(alg)) {
                        ranking.delete(alg);
                    }
                }
                if (ranking.size === 0) {
                    break;
                }
            }
            let best: Algorithm = 'none';
            let bestScore = Infinity;
            for (const [alg, score] of ranking.entries()) {
                if (score < bestScore) {
                    best = alg;
                    bestScore = score;
                }
            }
            return best;
        }
    }

    export async function compress(data: Uint8Array, alg: Algorithm): Promise<Uint8Array> {
        if (alg === 'none' || alg === undefined) {
            return data;
        } else if (alg === 'gzip') {
            // The sync version is way faster than the async version
            // As each async call spawns a new worker - which is slow
            // Our message size is small enough to not block the main thread
            return fflate.gzipSync(data);
        }
        throw new Error('Unsupported compression algorithm: ' + alg);
    }
    export async function decompress(data: Uint8Array, alg: Algorithm): Promise<Uint8Array> {
        if (alg === 'none' || alg === undefined) {
            return data;
        } else if (alg === 'gzip') {
            return fflate.gunzipSync(data);
        }
        throw new Error('Unsupported compression algorithm: ' + alg);
    }
}