import { createCloud } from './cloud.js';
import { startWorker } from './worker-engine.js';
startWorker(createCloud());
