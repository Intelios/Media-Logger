import type { StatsEntry } from "../lib/db";
import type {
  PlateAggregateData,
  PlateComparison,
  StatsRange,
} from "../components/stats/plate/plate-data";

export type StatsDatasetSlot = "active" | "comparison";

export interface StatsWorkerSetDatasetMessage {
  type: "set-dataset";
  slot: StatsDatasetSlot;
  version: number;
  year: string;
  entries: StatsEntry[];
}

export interface StatsWorkerClearDatasetMessage {
  type: "clear-dataset";
  slot: StatsDatasetSlot;
}

export interface StatsWorkerDeriveMessage {
  type: "derive";
  requestId: number;
  activeVersion: number;
  comparisonVersion: number | null;
  activeYear: string;
  comparisonYear: string | null;
  selectedTypes: string[];
  range: StatsRange | null;
}

export type StatsWorkerRequest =
  | StatsWorkerSetDatasetMessage
  | StatsWorkerClearDatasetMessage
  | StatsWorkerDeriveMessage;

export interface StatsWorkerResultMessage {
  type: "result";
  requestId: number;
  activeVersion: number;
  comparisonVersion: number | null;
  plate: PlateAggregateData;
  comparison: PlateComparison | null;
}

export interface StatsWorkerErrorMessage {
  type: "error";
  requestId: number;
  message: string;
}

export type StatsWorkerResponse = StatsWorkerResultMessage | StatsWorkerErrorMessage;
