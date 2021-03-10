import EventInterface, {Event, FireMethod, OnMethod} from "event-interface-mixin";
import Log from "log-control";

type PromiseHandler = {resolve:(value?:unknown)=>void, reject:(err:Error)=>void, promise?:Promise<unknown>};

const log = Log.instance("loader");

const defaultTask = 'main';

export class StartEvent extends Event<undefined> {}
export class FinishEvent extends Event<any> {}
export class ErrorEvent extends Event<Error> {}
class FirstLoadEvent extends Event<Promise<unknown>> {}

export default class Loader {
	private readonly _name:string;
	private _isLoading = false;
	private _loaded:Record<string, unknown> = {};
	private _promises:Record<string, PromiseHandler> = {};
	private _finalPromise!:PromiseHandler; // TS: initialized in `resetFinalPromise` (called from constructor)
	private _events:EventInterface;

	private _errors:Record<string, Error> = {};
	private _lastError?:Error = undefined;
	private _isFinished = false;

	private readonly _fire:FireMethod;
	public readonly on:OnMethod;

	constructor(name?:string) {
		this._name = name || 'Loading';
		this.resetFinalPromise();

		this._events = new EventInterface();
		this.on = this._events.getOnMethod();
		this._fire = this._events.getFireMethod();
	}

	private resetFinalPromise() {
		const promise = new Promise((resolve, reject) => {
			this._finalPromise = {resolve, reject};
		});
		this._finalPromise!.promise = promise;
		promise.catch(()=>{}); // we don't care about the final promise here, but we need to catch it anyway
		return promise;
	}

	private firstLoad() {
		this._isLoading = true;
		this._fire(StartEvent);
		this._fire(FirstLoadEvent, this._finalPromise.promise);
	}

	private startWaiting(name:string, promise:Promise<unknown>) {
		// Get promise result (or error)
		promise.then(result => {
			this.finish(name, result);
		}).catch(err => {
			this.finish(name, err);
		// @ts-ignore: Promise does have `finally` method
		}).finally(() => {
			delete this._promises[name];
			// If all promises are resolved or rejected, we're done loading.
			if(Object.keys(this._promises).length === 0) {
				this.finishLoading();
			}
		});
	}

	private finishLoading() {
		if(Object.keys(this.errors).length > 0) {
			const error = new Error("Error(s) loading");
			this._finalPromise.reject(error);
			this._fire(ErrorEvent, error);
		} else {
			log.log(this._name +": finished loading all tasks.");
			this._finalPromise.resolve(this._loaded);
			this._fire(FinishEvent, this._loaded);
		}

		this._isLoading = false;
		this._isFinished = true;
		this._promises = {};
	}

	isLoading(name?:string) {
		if(!name) {
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

	start(name = defaultTask, timeout?:number, promise?:Promise<unknown>) {
		this._isFinished = false;
		log.log(this._name +": started loading: ", name);

		let loadingPromise = new Promise( (resolve, reject) => {

			// Store reject/resolve methods outside of Promise
			this._promises[name] = {
				resolve: resolve,
				reject: reject
			};

			// Set timeout
			if(timeout) {
				setTimeout(()=>{
					if(!this.isFinished(name)) {
						reject(new Error(`Task timed out (${timeout}ms).`));
					}
				}, timeout);
			}

			// Wrap given promise
			if(promise instanceof Promise) {
				promise.catch(err=>{
					this._errors[name] = err;
					reject(err)
				});
				promise.then(resolve).catch(()=>{});
			}
		});
		loadingPromise.catch((err)=>{
			log.error(this._name +": failed loading: ", name, err);
			this._lastError = err;
			this._errors[name] = err;
		});  // we don't care about the promise here, but we need to catch it anyway

		this._promises[name].promise = loadingPromise;

		// First thing loading
		if(!this._isLoading) {
			this.firstLoad();
		}

		this.startWaiting(name, loadingPromise);

		return loadingPromise;
	}

	wait(name?:string, timeout?:number) {
		return new Promise((resolve, reject) => {
			const task = name === undefined ? this._finalPromise : this._promises[name];
			if(!task) {
				throw new Error(`Task not found` + (name ? ` ('${name}')` : ''));
			}
			let timer:number;
			if(timeout) {
				timer = setTimeout(()=>{
					const taskName = name ? ` (${name})` : '';
					reject(new Error(`Waiting for ${this._name}${taskName} timed out (${timeout} ms).`));
				}, timeout);
			}
			// TS: promise initialized directly in `start` method
			task.promise!.then(resolve).catch(()=>{});
			task.promise!.catch(reject);
			// TS: Promise *does* have `finally`
			(task.promise as any).finally(()=>{
				clearTimeout(timer);
			});
		});
	}

	finish(name = defaultTask, result?:unknown) {
		if(this.isFinished(name)) return;
		log.log(this._name +": finished loading: ", name);

		this._loaded[name] = result;
		if(name in this._promises) {
			this._promises[name].resolve(result);
			return this._promises[name];
		}
	}

	error(name = defaultTask, error:Error) {
		if(this.isFinished(name)) return;

		if(name in this._promises) {
			this._promises[name].reject(error);
		}
	}

	isFinished(name?:string) {
		if(!name) {
			return this._isFinished;
		}
		return name in this._errors || name in this._loaded;
	}

	addSubLoader(loader:Loader, name:string) {
		loader.on(StartEvent, ()=>this.start(name));
		loader.on(FinishEvent, ()=>this.finish(name));
		loader.on(ErrorEvent, error=>this.error(name, error.data));
	}
}
