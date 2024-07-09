// ******************************************************************************
// Copyright 2024 TypeFox GmbH
// This program and the accompanying materials are made available under the
// terms of the MIT License, which is available in the project root.
// ******************************************************************************

import { Disposable, DisposableGroup, DisposableCollection } from './disposable';
import { MaybePromise } from './promise';

/**
 * Represents a typed event.
 */
export interface Event<T> {

    /**
     *
     * @param listener The listener function will be call when the event happens.
     * @param thisArgs The 'this' which will be used when calling the event listener.
     * @param disposables An array to which a {{IDisposable}} will be added.
     * @return a disposable to remove the listener again.
     */
    (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}

export namespace Event {
    const _disposable = { dispose(): void { } };
    export function getMaxListeners(event: Event<unknown>): number {
        const { maxListeners } = event as any;
        return typeof maxListeners === 'number' ? maxListeners : 0;
    }
    export function setMaxListeners<N extends number>(event: Event<unknown>, maxListeners: N): N {
        if (typeof (event as any).maxListeners === 'number') {
            return (event as any).maxListeners = maxListeners;
        }
        return maxListeners;
    }
    export function addMaxListeners(event: Event<unknown>, add: number): number {
        if (typeof (event as any).maxListeners === 'number') {
            return (event as any).maxListeners += add;
        }
        return add;
    }
    export const None: Event<any> = Object.assign(function (): { dispose(): void } { return _disposable; }, {
        get maxListeners(): number { return 0; },
        set maxListeners(maxListeners: number) { }
    });

    /**
     * Given an event, returns another event which only fires once.
     */
    export function once<T>(event: Event<T>): Event<T> {
        return (listener, thisArgs = undefined, disposables?) => {
            // we need this, in case the event fires during the listener call
            let didFire = false;
            let result: Disposable | undefined = undefined;
            result = event(e => {
                if (didFire) {
                    return;
                } else if (result) {
                    result.dispose();
                } else {
                    didFire = true;
                }

                return listener.call(thisArgs, e);
            }, undefined, disposables);

            if (didFire) {
                result.dispose();
            }

            return result;
        };
    }

    export function toPromise<T>(event: Event<T>): Promise<T> {
        return new Promise(resolve => once(event)(resolve));
    }

    /**
     * Given an event and a `map` function, returns another event which maps each element
     * through the mapping function.
     */
    export function map<I, O>(event: Event<I>, mapFunc: (i: I) => O): Event<O> {
        return Object.assign((listener: (e: O) => any, thisArgs?: any, disposables?: Disposable[]) => event(i => listener.call(thisArgs, mapFunc(i)), undefined, disposables), {
            get maxListeners(): number { return 0; },
            set maxListeners(maxListeners: number) { }
        });
    }

    /**
     * Given a collection of events, returns a single event which emits whenever any of the provided events emit.
     */
    export function any<T>(...events: Event<T>[]): Event<T>;
    export function any(...events: Event<any>[]): Event<void>;
    export function any<T>(...events: Event<T>[]): Event<T> {
        return (listener, thisArgs = undefined, disposables?: Disposable[]) =>
            new DisposableCollection(...events.map(event => event(e => listener.call(thisArgs, e), undefined, disposables)));
    }
}

type Callback = (...args: any[]) => any;
class CallbackList implements Iterable<Callback> {

    private _callbacks: Function[] | undefined;
    private _contexts: any[] | undefined;

    get length(): number {
        return this._callbacks && this._callbacks.length || 0;
    }

    public add(callback: Function, context: any = undefined, bucket?: Disposable[]): void {
        if (!this._callbacks) {
            this._callbacks = [];
            this._contexts = [];
        }
        this._callbacks.push(callback);
        this._contexts!.push(context);

        if (Array.isArray(bucket)) {
            bucket.push({ dispose: () => this.remove(callback, context) });
        }
    }

    public remove(callback: Function, context: any = undefined): void {
        if (!this._callbacks) {
            return;
        }

        let foundCallbackWithDifferentContext = false;
        for (let i = 0; i < this._callbacks.length; i++) {
            if (this._callbacks[i] === callback) {
                if (this._contexts![i] === context) {
                    // callback & context match => remove it
                    this._callbacks.splice(i, 1);
                    this._contexts!.splice(i, 1);
                    return;
                } else {
                    foundCallbackWithDifferentContext = true;
                }
            }
        }

        if (foundCallbackWithDifferentContext) {
            throw new Error('When adding a listener with a context, you should remove it with the same context');
        }
    }

    // tslint:disable-next-line:typedef
    public [Symbol.iterator]() {
        if (!this._callbacks) {
            return [][Symbol.iterator]();
        }
        const callbacks = this._callbacks.slice(0);
        const contexts = this._contexts!.slice(0);

        return callbacks.map((callback, i) =>
            (...args: any[]) => callback.apply(contexts[i], args)
        )[Symbol.iterator]();
    }

    public invoke(...args: any[]): any[] {
        const ret: any[] = [];
        for (const callback of this) {
            try {
                ret.push(callback(...args));
            } catch (e) {
                console.error(e);
            }
        }
        return ret;
    }

    public isEmpty(): boolean {
        return !this._callbacks || this._callbacks.length === 0;
    }

    public dispose(): void {
        this._callbacks = undefined;
        this._contexts = undefined;
    }
}

export interface EmitterOptions {
    onFirstListenerAdd?: Function;
    onLastListenerRemove?: Function;
}

export class Emitter<T = any> {

    private static LEAK_WARNING_THRESHHOLD = 175;

    private static _noop = function (): void { };

    private _event: Event<T>;
    protected _callbacks: CallbackList | undefined;
    private _disposed = false;

    private _leakingStacks: Map<string, number> | undefined;
    private _leakWarnCountdown = 0;

    constructor(
        private _options?: EmitterOptions
    ) { }

    /**
     * For the public to allow to subscribe
     * to events from this Emitter
     */
    get event(): Event<T> {
        if (!this._event) {
            this._event = Object.assign((listener: (e: T) => any, thisArgs?: any, disposables?: DisposableGroup) => {
                if (!this._callbacks) {
                    this._callbacks = new CallbackList();
                }
                if (this._options && this._options.onFirstListenerAdd && this._callbacks.isEmpty()) {
                    this._options.onFirstListenerAdd(this);
                }
                this._callbacks.add(listener, thisArgs);
                const removeMaxListenersCheck = this.checkMaxListeners(Event.getMaxListeners(this._event));

                const result: Disposable = {
                    dispose: () => {
                        if (removeMaxListenersCheck) {
                            removeMaxListenersCheck();
                        }
                        result.dispose = Emitter._noop;
                        if (!this._disposed) {
                            this._callbacks!.remove(listener, thisArgs);
                            result.dispose = Emitter._noop;
                            if (this._options && this._options.onLastListenerRemove && this._callbacks!.isEmpty()) {
                                this._options.onLastListenerRemove(this);
                            }
                        }
                    }
                };
                if (DisposableGroup.canPush(disposables)) {
                    disposables.push(result);
                } else if (DisposableGroup.canAdd(disposables)) {
                    disposables.add(result);
                }

                return result;
            }, {
                maxListeners: Emitter.LEAK_WARNING_THRESHHOLD
            });
        }
        return this._event;
    }

    protected checkMaxListeners(maxListeners: number): (() => void) | undefined {
        if (maxListeners === 0 || !this._callbacks) {
            return undefined;
        }
        const listenerCount = this._callbacks.length;
        if (listenerCount <= maxListeners) {
            return undefined;
        }

        const popStack = this.pushLeakingStack();

        this._leakWarnCountdown -= 1;
        if (this._leakWarnCountdown <= 0) {
            // only warn on first exceed and then every time the limit
            // is exceeded by 50% again
            this._leakWarnCountdown = maxListeners * 0.5;

            let topStack: string;
            let topCount = 0;
            this._leakingStacks!.forEach((stackCount, stack) => {
                if (!topStack || topCount < stackCount) {
                    topStack = stack;
                    topCount = stackCount;
                }
            });

            // eslint-disable-next-line max-len
            console.warn(`Possible Emitter memory leak detected. ${listenerCount} listeners added. Use event.maxListeners to increase the limit (${maxListeners}). MOST frequent listener (${topCount}):`);
            console.warn(topStack!);
        }

        return popStack;
    }

    protected pushLeakingStack(): () => void {
        if (!this._leakingStacks) {
            this._leakingStacks = new Map();
        }
        const stack = new Error().stack!.split('\n').slice(3).join('\n');
        const count = (this._leakingStacks.get(stack) || 0);
        this._leakingStacks.set(stack, count + 1);
        return () => this.popLeakingStack(stack);
    }

    protected popLeakingStack(stack: string): void {
        if (!this._leakingStacks) {
            return;
        }
        const count = (this._leakingStacks.get(stack) || 0);
        this._leakingStacks.set(stack, count - 1);
    }

    /**
     * To be kept private to fire an event to
     * subscribers
     */
    fire(event: T): any {
        if (this._callbacks) {
            return this._callbacks.invoke(event);
        }
    }

    /**
     * Process each listener one by one.
     * Return `false` to stop iterating over the listeners, `true` to continue.
     */
    async sequence(processor: (listener: (e: T) => any) => MaybePromise<boolean>): Promise<void> {
        if (this._callbacks) {
            for (const listener of this._callbacks) {
                if (!await processor(listener)) {
                    break;
                }
            }
        }
    }

    dispose(): void {
        if (this._leakingStacks) {
            this._leakingStacks.clear();
            this._leakingStacks = undefined;
        }
        if (this._callbacks) {
            this._callbacks.dispose();
            this._callbacks = undefined;
        }
        this._disposed = true;
    }
}
