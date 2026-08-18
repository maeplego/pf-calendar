import { loadWorkerConfig, startWorker } from "./index.js";

await startWorker(loadWorkerConfig());
