Deep Loader
====

Deep Loader is a class that helps keeping track of loading progress at several levels. For each loading task may
consist of several other tasks, and perhaps there is a hierarchy of components that all need their children to finish
their loading tasks before they are considered finished themselves.

## Usage

### Single loading task

```typescript
let loader = new Loader();
loader.isLoading(); // false
loader.isFinished(); // false

loader.start();

loader.isLoading(); // true
loader.isFinished(); // false

loader.done();

loader.isLoading(); // false
loader.isFinished(); // true
```

### Multiple loading tasks

Loaders can start multiple named tasks. Only if all of them are finished, the loader will be considered finished itself.

```typescript
let loader = new Loader();
loader.isLoading(); // false
loader.isFinished(); // false

loader.start('task1');
loader.start('task2');

loader.isLoading(); // true
loader.isFinished(); // false

loader.finish('task1');

loader.isLoading('task1'); // false
loader.isFinished('task1'); // true

loader.finish('task2');

loader.isLoading(); // false
loader.isFinished(); // true
```

### Nested loaders

Loaders can be nested, so that the parent needs to wait for the subloader to finish loading all its tasksbefore it can 
finish its own loading. 

```typescript
let loader = new Loader();
let subloader = new Loader();

loader.addSubLoader(subloader, 'sub');
subloader.start();

loader.isLoading(); // true

subloader.finish();

loader.isFinished(); // true

```

### Existing Promises

Loaders can use exisitng promises as tasks and wait for those to finish as part of their own loading.

```typescript
let loader = new Loader();
let pending = myAsynchronousFunction();
const promise = loader.start('task1', 5000, pending); // timeout of 5000 after which task is considered a failure
await promise; // will return a promise for the task, which will also include the timeout
```

### Waiting for a task

A Loader can provide a Promise to wait for a specific task that may or may not have been started.

```typescript
let loader = new Loader();
loader.wait('task1').then(()=>console.log("Finished task 1"));
loader.start('task1');
loader.finish('task1'); // will now resolve the wait
```

### Payloads and events

Loading tasks can provide output:

```typescript
let loader = new Loader();

loader.on(FinishEvent, value => console.log(value)); // "Result!"

loader.start('task1');
loader.finish('task1', "Result!");
```

### Errors

If any of its tasks fail, the loader itself will not finish loading. Errors can be retrieved from the loader.

```typescript
let loader = new Loader();
loader.start("task1");
loader.start("task2");

loader.on(ErrorEvent, error => console.error(error.message)); // "Loading failed"

loader.error("task1", new Error("Loading failed"));
loader.finish("task2");

console.log(loader.errors); // {task1: Error("Loading failed")}

```
