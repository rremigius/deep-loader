import { Event, OnMethod } from "event-interface-mixin";
declare type PromiseHandler = {
    resolve: (value?: unknown) => void;
    reject: (err: Error) => void;
    promise?: Promise<unknown>;
};
export declare class StartEvent extends Event<undefined> {
}
export declare class FinishEvent extends Event<any> {
}
export declare class ErrorEvent extends Event<Error> {
}
export default class Loader {
    private readonly _name;
    private _isLoading;
    private _loaded;
    private _promises;
    private _finalPromise;
    private _events;
    private _errors;
    private _lastError?;
    private _isFinished;
    private readonly _fire;
    readonly on: OnMethod;
    constructor(name?: string);
    private resetFinalPromise;
    private firstLoad;
    private startWaiting;
    private finishLoading;
    isLoading(name?: string): boolean;
    get errors(): Record<string, Error>;
    get lastError(): Error | undefined;
    start(name?: string, timeout?: number, promise?: Promise<unknown>): Promise<unknown>;
    wait(name?: string, timeout?: number): Promise<unknown>;
    finish(name?: string, result?: unknown): PromiseHandler | undefined;
    error(name: string | undefined, error: Error): void;
    isFinished(name?: string): boolean;
    addSubLoader(loader: Loader, name: string): void;
}
export {};
