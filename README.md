# work-queue-pool

> A simple and efficient worker pool implementation for JavaScript/TypeScript projects.

> 자바스크립트/타입스크립트 프로젝트를 위한 간단하고 효율적인 워커 풀 구현.

🧠 **Workload-aware auto scaling**

Automatically adjusts the number of workers based on the current task queue status, allowing efficient use of system resources. (Minimum and maximum pool size configurable)

🧾 **Direct queue management**

Uses a Map-based queue where each task is identified by a unique ID, making it possible to track or remove individual tasks when needed.

🛠️ **Customizable task preprocessing**

Supports both synchronous and asynchronous preprocessing of task data via taskTransform, enabling flexible handling of complex data structures before they're sent to workers.

📦 **Automatic handling of transferable objects**

Automatically detects transferable objects like ArrayBuffer, ImageBitmap, and OffscreenCanvas, allowing zero-copy transfer to workers for optimal performance.

---

🧠 **워크로드 기반 자동 크기 조절**

현재 작업 큐의 상태에 따라 워커 수를 자동으로 조절하여 리소스를 효율적으로 사용합니다. (최소/최대 풀 사이즈 지정 가능)

🧾 **작업 큐 직접 관리**

Map 기반 큐를 사용하여 각 작업을 고유 ID로 식별하고, 필요 시 개별 작업을 제거하거나 추적할 수 있습니다.

🛠️ **전처리 커스터마이징**

워커에 전달할 데이터를 taskTransform을 통해 동기/비동기적으로 전처리할 수 있어, 복잡한 데이터 가공도 유연하게 처리할 수 있습니다.

📦 **Transferable 객체 자동 처리**

ArrayBuffer, ImageBitmap, OffscreenCanvas 등을 자동으로 식별하여 메모리 복사 없이 워커에 전달합니다.

## 📌 Introduction

`Simple WorkerPool` is a library that manages a pool of pre-created workers to process tasks concurrently. When a task is requested, it assigns the task to an available worker, and if all workers are busy, it stores the task in a queue for later processing.

The pool dynamically adjusts its size based on the task queue, and it automatically handles the transfer of data to and from workers.

It also works properly in bundler environments such as Vite for creating workers.

---

`Simple WorkerPool`은 여러 작업을 병렬로 처리하기 위해 미리 생성된 워커 풀을 관리하는 라이브러리입니다. 작업이 요청될 때, 사용 가능한 워커가 있으면 해당 워커에게 작업을 할당하고, 모든 워커가 바쁠 경우 작업을 대기열에 저장하여 처리합니다.

`Simple WorkerPool`은 작업 처리 시 동적으로 워커 풀의 크기를 조정하며, 각 워커에게 전달할 데이터를 자동으로 전송하고 처리합니다.

`Simple WorkerPool`은 Vite와 같은 번들러 환경에서도 올바르게 워커를 생성할 수 있도록 지원합니다.

## 🚀 Getting Started

### Installation

```bash
npm install simple-workerpool
```

### Usage

#### Create a Worker Pool

```ts
import { WorkerPool } from "simple-workerpool";

const pool = new WorkerPool({
  workerFactory: () => new Worker("yourWorker.js"),
  minPoolSize: 2,
  maxPoolSize: 10,
  taskTransform: async (task) => {
    // A function to transform input data as needed - Optional
    return task.payload;
  },
});
```

#### Run a Task

```ts
const taskPayload = { data: "example" };
const taskId = "task-id";

pool
  .execute(taskPayload, taskId)
  .then((result) => {
    console.log("Task result:", result);
  })
  .catch((error) => {
    console.error("Task failed:", error);
  });
```

#### Cancel a Task

Only tasks that have not yet started (i.e., tasks still in the queue) can be cancelled.

```ts
const taskId = "task-1";
pool.execute(taskPayload, taskId);
pool.removeTaskById(taskId);
```

> Tasks that are already being processed by a worker cannot be cancelled.

#### Terminate the Worker Pool

```ts
pool.terminate();
```
