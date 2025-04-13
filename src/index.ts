interface WorkerPoolOptions<T = unknown, U = unknown, V = T> {
  /**
   * A factory function that creates and returns a Worker instance.
   * Helps to correctly create Workers in bundler environments like Vite.
   */
  workerFactory: () => Worker;
  minPoolSize?: number;
  maxPoolSize?: number;
  /**
   * A function that transforms task data.
   * Takes the input Task's payload (type T) and returns data (type V) to be sent to the worker.
   * This function can be synchronous or asynchronous.
   */
  taskTransform?: (task: Task<T, U>) => V | Promise<V>;
}

type Task<T, U> = {
  id: string;
  payload: T;
  resolve: (result: U) => void;
  reject: (error: unknown) => void;
};

const CORE_COUNT = navigator.hardwareConcurrency || 4;

/**
 * The WorkerPool class manages a pool of pre-created Worker instances,
 * assigns tasks to available workers when task requests come in,
 * and stores tasks in a Map when all workers are busy.
 *
 * On pool creation, options like workerFactory, min/max pool sizes, and taskTransform functions
 * are used internally, and the pool size is automatically adjusted when tasks are added or completed.
 */
export class WorkerPool<T, U, V = T> {
  private pool: Worker[];
  private readonly queue: Map<string, Task<T, U>>;
  private readonly busy: Set<Worker>;
  private readonly taskTransform?: (task: Task<T, U>) => V | Promise<V>;
  private readonly workerFactory: () => Worker;
  private readonly minPoolSize: number;
  private readonly maxPoolSize: number;

  constructor({
    workerFactory,
    minPoolSize = 1,
    maxPoolSize = Math.floor(CORE_COUNT * 0.75),
    taskTransform,
  }: WorkerPoolOptions<T, U, V>) {
    this.workerFactory = workerFactory;
    this.minPoolSize = minPoolSize;
    this.maxPoolSize = maxPoolSize;
    this.taskTransform = taskTransform;
    this.pool = [];
    this.queue = new Map();
    this.busy = new Set();
    const initialSize = Math.min(minPoolSize, maxPoolSize);
    for (let i = 0; i < initialSize; i++) {
      const worker = this.workerFactory();
      worker.onmessage = () => {};
      this.pool.push(worker);
    }
  }

  /**
   * Map에서 첫 번째 작업을 꺼내고 삭제하는 헬퍼 메서드.
   * @returns 작업(Task) 또는 undefined.
   */
  private popQueueTask(): Task<T, U> | undefined {
    for (const [id, task] of this.queue) {
      this.queue.delete(id);
      return task;
    }
    return undefined;
  }

  /**
   * 워커에 transfarable 데이터를 전송합니다.
   * @param payload 워커가 받을 작업을 래핑한 객체
   */
  private getTransferables(payload: V): Transferable[] {
    if (this.isTransferable(payload)) {
      return [payload];
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      "transferables" in payload &&
      Array.isArray((payload as { transferables: Transferable[] }).transferables)
    ) {
      return [...(payload as { transferables: Transferable[] }).transferables];
    }

    return [];
  }

  private isTransferable(payload: any): payload is Transferable {
    return (
      payload instanceof ArrayBuffer ||
      payload instanceof ImageBitmap ||
      (typeof OffscreenCanvas !== "undefined" && payload instanceof OffscreenCanvas)
    );
  }

  /**
   * 사용 가능한 워커에 작업을 실행합니다.
   * @param worker 작업을 수행할 워커.
   * @param task 실행할 작업.
   */
  private async runTask(worker: Worker, task: Task<T, U>) {
    this.busy.add(worker);

    const handleMessage = (e: MessageEvent<U>) => {
      worker.removeEventListener("message", handleMessage);
      this.busy.delete(worker);
      task.resolve(e.data);
      this.checkQueue();
      this.updatePoolSize();
    };

    const handleError = (err: ErrorEvent) => {
      worker.removeEventListener("error", handleError);
      this.busy.delete(worker);
      task.reject(err);
      this.checkQueue();
      this.updatePoolSize();
    };

    worker.addEventListener("message", handleMessage, { once: true });
    worker.addEventListener("error", handleError, { once: true });

    try {
      const payloadToSend = await Promise.resolve(
        this.taskTransform ? this.taskTransform(task) : (task.payload as unknown as V)
      );
      const transferables = this.getTransferables(payloadToSend);
      worker.postMessage(payloadToSend, transferables);
    } catch (error) {
      this.busy.delete(worker);
      task.reject(error);
      this.checkQueue();
      this.updatePoolSize();
    }
  }

  /**
   * 대기 중인 작업이 있으면 사용 가능한 워커에 작업을 할당합니다.
   */
  private checkQueue() {
    if (this.queue.size === 0) return;
    const availableWorker = this.pool.find((worker) => !this.busy.has(worker));
    if (availableWorker) {
      const task = this.popQueueTask();
      if (task) {
        this.runTask(availableWorker, task);
      }
    }
  }

  /**
   * 작업 추가 또는 완료 시 자동으로 풀 크기를 조절합니다.
   * - 대기 작업이 있는 경우: 현재 큐 크기의 1.5배 만큼 추가하여 최대 풀 크기를 초과하지 않도록 합니다.
   * - 대기 작업이 없으면, 최소 풀 크기까지 idle 워커를 종료합니다.
   */
  private updatePoolSize() {
    if (this.queue.size > 0 && this.pool.length < this.maxPoolSize) {
      const targetSize = Math.min(this.pool.length + Math.max(1, Math.ceil(this.queue.size * 1.5)), this.maxPoolSize);
      const toAdd = targetSize - this.pool.length;
      for (let i = 0; i < toAdd; i++) {
        const worker = this.workerFactory();
        worker.onmessage = () => {};
        this.pool.push(worker);
      }
    } else if (this.queue.size === 0 && this.pool.length > this.minPoolSize) {
      for (let i = this.pool.length - 1; i >= 0 && this.pool.length > this.minPoolSize; i--) {
        const worker = this.pool[i];
        if (!this.busy.has(worker)) {
          worker.terminate();
          this.pool.splice(i, 1);
        }
      }
    }
  }

  /**
   * Executes a task.
   * If no available workers are found, the task is added to the queue (Map), and the pool size is automatically adjusted.
   * @param id The unique task identifier.
   * @param payload The original data (type T) to be sent to the worker.
   * @returns A promise that returns the worker's result (type U).
   */
  public execute(payload: T, id: string = this.getUniqueId()): Promise<U> {
    return new Promise((resolve, reject) => {
      const task: Task<T, U> = { id, payload, resolve, reject };
      const availableWorker = this.pool.find((worker) => !this.busy.has(worker));
      if (availableWorker) {
        this.runTask(availableWorker, task);
      } else {
        this.queue.set(id, task);
        this.updatePoolSize();
      }
    });
  }

  private getUniqueId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Removes a task from the queue using the specified id.
   * It cannot remove tasks that are currently being executed.
   * @param id The unique identifier of the task to remove.
   * @returns A boolean indicating whether the removal was successful.
   */
  public removeTaskById(id: string): boolean {
    return this.queue.delete(id);
  }

  /**
   * Terminates all workers in the pool and clears the queue and internal state.
   */
  public terminate() {
    this.pool.forEach((worker) => worker.terminate());
    this.pool = [];
    this.queue.clear();
    this.busy.clear();
  }
}
