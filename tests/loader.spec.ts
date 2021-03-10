import Loader, {StartEvent} from "../src/index";
import {assert} from "chai";

describe("Loader", () => {
	describe("start", () => {
		it("with promise argument resolves automatically when promise is resolved.", async () => {
			let loading = new Loader();
			loading.start('foo', 100, new Promise(resolve => {
				setTimeout(() => {
					resolve('bar');
				});
			}));
			let result = await loading.wait('foo');
			assert.equal(result, 'bar');
			assert.ok(loading.isFinished('foo'), "isFinished returns true");
			assert.ok(!loading.isLoading('foo'), "isLoading returns false");
		});
		it("with rejecting promise rejects final promise.", async () => {
			let loading = new Loader();
			loading.start('foo', 100, new Promise((resolve, reject) => {
				setTimeout(()=>reject(new Error('bar')));
			}));
			try {
				await loading.wait('foo');
				assert.ok(false, "Promise should not resolve.");
			} catch(error) {
				assert.equal(error.message, 'bar');
			}
		});
		it("first call emits StartEvent", async () => {
			let loading = new Loader();
			let alreadyCalled = false;
			loading.on(StartEvent, ()=>{
				assert.notOk(alreadyCalled, 'Called only one time.');
				alreadyCalled = true;
			});
			loading.start('foo');
		});
	});
	describe("isLoading", () => {
		it("without name argument returns `true` iff something is loading", () => {
			const loader = new Loader();
			assert.notOk(loader.isLoading());
			loader.start();
			assert.ok(loader.isLoading());
		});
	});
	describe("isFinished", () => {
		it("without name argument returns `true` iff all loading has finished", async () => {
			const loader = new Loader();
			assert.notOk(loader.isFinished());
			const promise = loader.start();
			assert.notOk(loader.isFinished());
			loader.finish();
			await promise;
			assert.ok(loader.isFinished());
		});
	});
	describe("done", () => {
		it("with name argument resolves the loading task started with the same name", async () => {
			const loader = new Loader();
			let shouldFinish = false;
			let count = 0;
			const promise = loader.start("foo").then(()=>{
				assert.equal(shouldFinish, true);
				count++;
			});
			loader.start("bar").then(()=>{
				assert.ok(false);
			});
			loader.finish("bar");
			shouldFinish = true;
			loader.finish("foo");

			await promise;
			assert.equal(count, 1);
		});
	});
	describe("wait", () => {
		it("with name argument returns promise that will resolve when the task with that name completed", async () => {
			let loading = new Loader();
			loading.start("foo");
			loading.finish('foo', 'bar');

			let result = await loading.wait('foo');
			assert.equal(result, 'bar');
		});
		it("without name argument returns promise that resolves when all tasks are completed", async () => {
			let loading = new Loader();
			loading.start('foo');
			loading.start('bar');

			loading.finish('foo', 123);
			loading.finish('bar', 321);

			let result = await loading.wait();
			assert.deepEqual(result, {
				foo: 123,
				bar: 321
			});
		});
		it("called before start should not resolve immediately.", async () => {
			let loading = new Loader();
			let started = false;
			const promise = new Promise<void>((resolve, reject) => {
				loading.wait().then(()=>{
					assert.ok(started, "Loading.wait resolved after start.");
					resolve();
				}).catch(reject)
			});

			loading.start('foo', 100, new Promise<void>(resolve =>
				setTimeout(()=>resolve())
			));
			started = true;
			await promise;
		});
	});
	describe("error", () => {
		it("rejects promise and finishes loading.", async () => {
			let loading = new Loader();
			loading.start('foo');
			loading.error('foo', new Error('bar'));
			try {
				await loading.wait('foo');
				assert.ok(false, "Promise should not resolve.");
			} catch(e) {
				assert.equal(e.message, 'bar');
				assert.ok(loading.isFinished('foo'));
			}
		});
	});
});
