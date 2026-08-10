import type { StatsEntry } from "../lib/db";
import { derivePlateSelection } from "../components/stats/plate/plate-data";
import type {
  StatsDatasetSlot,
  StatsWorkerDeriveMessage,
  StatsWorkerRequest,
  StatsWorkerResponse,
} from "./stats-worker-protocol";

interface StoredDataset {
  version: number;
  year: string;
  entries: StatsEntry[];
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<StatsWorkerRequest>) => void) | null;
  postMessage(message: StatsWorkerResponse): void;
}

const workerScope = self as unknown as WorkerScope;
let activeDataset: StoredDataset | null = null;
let comparisonDataset: StoredDataset | null = null;
let latestRequestId = 0;
let pendingDerivation: StatsWorkerDeriveMessage | null = null;
let deriveTimer: number | null = null;

function setDataset(slot: StatsDatasetSlot, dataset: StoredDataset | null): void {
  if (slot === "active") {
    activeDataset = dataset;
  } else {
    comparisonDataset = dataset;
  }
}

function postError(requestId: number, message: string): void {
  if (requestId !== latestRequestId) return;
  workerScope.postMessage({ type: "error", requestId, message });
}

function processLatestDerivation(): void {
  deriveTimer = null;
  const request = pendingDerivation;
  pendingDerivation = null;
  if (!request || request.requestId !== latestRequestId) return;

  const active = activeDataset;
  if (!active || active.version !== request.activeVersion) {
    postError(request.requestId, "The active Stats dataset is unavailable.");
    return;
  }

  let comparison: StoredDataset | null = null;
  if (request.comparisonVersion !== null) {
    if (
      !comparisonDataset ||
      comparisonDataset.version !== request.comparisonVersion ||
      comparisonDataset.year !== request.comparisonYear
    ) {
      postError(request.requestId, "The comparison Stats dataset is unavailable.");
      return;
    }
    comparison = comparisonDataset;
  }

  try {
    const result = derivePlateSelection(
      active.entries,
      request.activeYear,
      request.selectedTypes,
      request.range,
      comparison ? { entries: comparison.entries, year: comparison.year } : null,
    );

    // The main thread also rejects stale IDs. This worker-side check prevents a
    // superseded request from transferring a large aggregate payload.
    if (request.requestId !== latestRequestId) return;
    workerScope.postMessage({
      type: "result",
      requestId: request.requestId,
      activeVersion: request.activeVersion,
      comparisonVersion: request.comparisonVersion,
      plate: result.plate,
      comparison: result.comparison,
    });
  } catch (error) {
    postError(request.requestId, error instanceof Error ? error.message : String(error));
  }
}

function scheduleLatestDerivation(request: StatsWorkerDeriveMessage): void {
  latestRequestId = request.requestId;
  pendingDerivation = request;
  if (deriveTimer !== null) return;

  // A task boundary lets a burst of queued brush messages collapse to its most
  // recent request before any expensive in-memory derivation begins.
  deriveTimer = setTimeout(processLatestDerivation, 0);
}

workerScope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case "set-dataset":
      setDataset(message.slot, {
        version: message.version,
        year: message.year,
        entries: message.entries,
      });
      break;
    case "clear-dataset":
      setDataset(message.slot, null);
      break;
    case "derive":
      scheduleLatestDerivation(message);
      break;
  }
};
