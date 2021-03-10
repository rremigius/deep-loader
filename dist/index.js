"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorEvent = exports.FinishEvent = exports.StartEvent = void 0;
const event_interface_mixin_1 = __importStar(require("event-interface-mixin"));
const log_control_1 = __importDefault(require("log-control"));
const log = log_control_1.default.instance("loader");
const defaultTask = 'main';
class StartEvent extends event_interface_mixin_1.Event {
}
exports.StartEvent = StartEvent;
class FinishEvent extends event_interface_mixin_1.Event {
}
exports.FinishEvent = FinishEvent;
class ErrorEvent extends event_interface_mixin_1.Event {
}
exports.ErrorEvent = ErrorEvent;
class FirstLoadEvent extends event_interface_mixin_1.Event {
}
class Loader {
    constructor(name) {
        this._isLoading = false;
        this._loaded = {};
        this._promises = {};
        this._errors = {};
        this._lastError = undefined;
        this._isFinished = false;
        this._name = name || 'Loading';
        this.resetFinalPromise();
        this._events = new event_interface_mixin_1.default();
        this.on = this._events.getOnMethod();
        this._fire = this._events.getFireMethod();
    }
    resetFinalPromise() {
        const promise = new Promise((resolve, reject) => {
            this._finalPromise = { resolve, reject };
        });
        this._finalPromise.promise = promise;
        promise.catch(() => { }); // we don't care about the final promise here, but we need to catch it anyway
        return promise;
    }
    firstLoad() {
        this._isLoading = true;
        this._fire(StartEvent);
        this._fire(FirstLoadEvent, this._finalPromise.promise);
    }
    startWaiting(name, promise) {
        // Get promise result (or error)
        promise.then(result => {
            this.finish(name, result);
        }).catch(err => {
            this.finish(name, err);
            // @ts-ignore: Promise does have `finally` method
        }).finally(() => {
            delete this._promises[name];
            // If all promises are resolved or rejected, we're done loading.
            if (Object.keys(this._promises).length === 0) {
                this.finishLoading();
            }
        });
    }
    finishLoading() {
        if (Object.keys(this.errors).length > 0) {
            const error = new Error("Error(s) loading");
            this._finalPromise.reject(error);
            this._fire(ErrorEvent, error);
        }
        else {
            log.log(this._name + ": finished loading all tasks.");
            this._finalPromise.resolve(this._loaded);
            this._fire(FinishEvent, this._loaded);
        }
        this._isLoading = false;
        this._isFinished = true;
        this._promises = {};
    }
    isLoading(name) {
        if (!name) {
            return this._isLoading;
        }
        return name in this._promises && !(name in this._loaded);
    }
    get errors() {
        return this._errors;
    }
    get lastError() {
        return this._lastError;
    }
    start(name = defaultTask, timeout, promise) {
        this._isFinished = false;
        log.log(this._name + ": started loading: ", name);
        let loadingPromise = new Promise((resolve, reject) => {
            // Store reject/resolve methods outside of Promise
            this._promises[name] = {
                resolve: resolve,
                reject: reject
            };
            // Set timeout
            if (timeout) {
                setTimeout(() => {
                    if (!this.isFinished(name)) {
                        reject(new Error(`Task timed out (${timeout}ms).`));
                    }
                }, timeout);
            }
            // Wrap given promise
            if (promise instanceof Promise) {
                promise.catch(err => {
                    this._errors[name] = err;
                    reject(err);
                });
                promise.then(resolve).catch(() => { });
            }
        });
        loadingPromise.catch((err) => {
            log.error(this._name + ": failed loading: ", name, err);
            this._lastError = err;
            this._errors[name] = err;
        }); // we don't care about the promise here, but we need to catch it anyway
        this._promises[name].promise = loadingPromise;
        // First thing loading
        if (!this._isLoading) {
            this.firstLoad();
        }
        this.startWaiting(name, loadingPromise);
        return loadingPromise;
    }
    wait(name, timeout) {
        return new Promise((resolve, reject) => {
            const task = name === undefined ? this._finalPromise : this._promises[name];
            if (!task) {
                throw new Error(`Task not found` + (name ? ` ('${name}')` : ''));
            }
            let timer;
            if (timeout) {
                timer = setTimeout(() => {
                    const taskName = name ? ` (${name})` : '';
                    reject(new Error(`Waiting for ${this._name}${taskName} timed out (${timeout} ms).`));
                }, timeout);
            }
            // TS: promise initialized directly in `start` method
            task.promise.then(resolve).catch(() => { });
            task.promise.catch(reject);
            // TS: Promise *does* have `finally`
            task.promise.finally(() => {
                clearTimeout(timer);
            });
        });
    }
    finish(name = defaultTask, result) {
        if (this.isFinished(name))
            return;
        log.log(this._name + ": finished loading: ", name);
        this._loaded[name] = result;
        if (name in this._promises) {
            this._promises[name].resolve(result);
            return this._promises[name];
        }
    }
    error(name = defaultTask, error) {
        if (this.isFinished(name))
            return;
        if (name in this._promises) {
            this._promises[name].reject(error);
        }
    }
    isFinished(name) {
        if (!name) {
            return this._isFinished;
        }
        return name in this._errors || name in this._loaded;
    }
    addSubLoader(loader, name) {
        loader.on(StartEvent, () => this.start(name));
        loader.on(FinishEvent, () => this.finish(name));
        loader.on(ErrorEvent, error => this.error(name, error.data));
    }
}
exports.default = Loader;
