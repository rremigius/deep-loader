'use strict';

const Err  = require('./error');
const EventInterface = require('./event-interface');
const Log = require('./log');

const log = Log.instance('utils/loading');

const Loading = function (name) {
	this._name = name || 'Loading';
  this._isLoading = false;
  this._loadErrors = {};
  this._loaded = {};
  this._promises = {};
  this._lastError = undefined;
  this._isFinished = false;

  this._resetFinalPromise();

  this._eventInterface = new EventInterface();

  this.on = this._eventInterface.getOnMethod();
  this.fire = this._eventInterface.getFireMethod();
};

Loading.prototype._resetFinalPromise = function() {
  let promise = new Promise((resolve, reject) => {
    this._finalPromise = {resolve, reject};
  });
  promise.catch(()=>{}); // we don't care about the final promise here, but we need to catch it anyway
  this._finalPromise.promise = promise;
  return promise;
};

Loading.prototype.isLoading = function() {
  return this._isLoading;
};

Loading.prototype.getErrors = function() {
	return this._loadErrors;
};

Loading.prototype.getLastError = function() {
	return this._lastError;
};

/**
 *
 * @param {string} name       Name of the loading item.
 * @param {number} [timeout]  Timeout, after which the loading promise will be rejected.
 * @param {Promise} promise   Existing promise to wait for.
 * @return {Promise<any>}
 */
Loading.prototype.start = function(name = 'main', timeout = undefined, promise = undefined) {
	this._isFinished = false;
	log.log(this._name +": started loading: ", name);
  let loadingPromise = new Promise( (resolve, reject) => {

    // Store reject/resolve methods outside of Promise
    this._promises[name] = {
      resolve: resolve,
      reject: reject,
    };

    // Set timeout
    if(timeout) {
      setTimeout(()=>{
        if(!this.isFinished(name)) {
          reject(new Err(`Task timed out (${timeout}ms).`))
        }
      }, timeout);
    }

    // Wrap given promise
    if(promise instanceof Promise) {
      promise.catch(err=>{
					this._loadErrors[name] = err;
					reject(err)
				});
			promise.then(resolve).catch(()=>{});
    }
  });
  loadingPromise.catch((err)=>{
  	log.error(this._name +": failed loading: ", name, err);
		this._lastError = err;
		this._loadErrors[name] = err;
	});  // we don't care about the promise here, but we need to catch it anyway
  this._promises[name].promise = loadingPromise;

  // First thing loading
  if(!this._isLoading) {
    this._firstLoad();
  }

  this._startWaiting(name, loadingPromise);

  return loadingPromise;
};

Loading.prototype.wait = function(name, timeout = undefined) {
	return new Promise((resolve, reject) => {
		const task = name === undefined ? this._finalPromise : this._promises[name];
		let timer;
		if(timeout) {
			timer = setTimeout(()=>{
				const taskName = name ? ` (${name})` : '';
				reject(new Err(`Waiting for ${this._name}${taskName} timed out (${timeout} ms).`));
			}, timeout);
		}
		task.promise.then(resolve).catch(()=>{});
		task.promise.catch(reject);
		task.promise.finally(()=>{
			clearTimeout(timer);
		}).catch(e=>{});
	});
};

Loading.prototype.done = function(name, result) {
  if(this.isFinished(name)) return;
	log.log(this._name +": finished loading: ", name);

  this._loaded[name] = result;
  if(name in this._promises) {
    this._promises[name].resolve(result);
    return this._promises[name];
  }
};

Loading.prototype.error = function(name, err) {
  if(this.isFinished(name)) return;

  if(name in this._promises) {
    this._promises[name].reject(err);
  }
};

Loading.prototype.isFinished = function(name) {
	if(!name) {
		return this._isFinished;
	}
  return name in this._loadErrors || name in this._loaded;
};

Loading.prototype.subLoading = function(subLoading, name) {
	if(!(subLoading instanceof Loading)) {
		log.error("Can only listen to other Loading instance.", subLoading);
	}
	subLoading.on('start', ()=>this.start(name));
	subLoading.on('load', ()=>this.done(name));
	subLoading.on('error', ()=>this.error(name));
};

Loading.prototype._emitStart = function() {
  this.fire('start')
};

Loading.prototype._emitDone = function(loaded) {
  this.fire('load', loaded);
};

Loading.prototype._emitError = function(err) {
  this.fire('error', err);
};

Loading.prototype._firstLoad = function() {
  this._isLoading = true;
  this._emitStart();

  this.fire('firstLoad', this._finalPromise.promise);
};

Loading.prototype._startWaiting = function(name, promise) {
  // Get promise result (or error)
  promise.then(result => {
    this.done(name, result);
  }).catch(err => {
    this.done(name, err);
  }).finally(() => {
    delete this._promises[name];
    // If all promises are resolved or rejected, we're done loading.
    if(Object.keys(this._promises).length === 0) {
      this._finishLoading();
    }
  });
};

Loading.prototype._finishLoading = function() {
  if(Object.keys(this._loadErrors).length > 0) {
  	const error = new Err({message: "Error loading.", errorMap: this._loadErrors});
    this._finalPromise.reject(error);
    this._emitError(error);
  } else {
		log.log(this._name +": finished loading all tasks.");
    this._finalPromise.resolve(this._loaded);
    this._emitDone(this._loaded);
  }

  this._isLoading = false;
  this._isFinished = true;
  this._promises = {};
};

module.exports = Loading;
