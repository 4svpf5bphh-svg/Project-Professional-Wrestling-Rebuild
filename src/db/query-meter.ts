import { performance } from "node:perf_hooks";

export interface QuerySample {
  operation: string;
  queryCount: number;
  resultRows: number;
  encodedResultBytes: number;
  elapsedMs: number;
}

export interface QueryBudget {
  maxQueries: number;
  maxResultBytes: number;
}

/** Count only actual executed queries, never estimates from SQL text. */
export class MeasuredQuerySession {
  private queryCount = 0;
  private resultRows = 0;
  private encodedResultBytes = 0;
  private readonly started = performance.now();

  constructor(readonly operation: string) {}

  async execute<T extends readonly unknown[]>(
    query: () => Promise<T>,
  ): Promise<T> {
    this.queryCount += 1;
    const rows = await query();
    this.resultRows += rows.length;
    this.encodedResultBytes += Buffer.byteLength(JSON.stringify(rows), "utf8");
    return rows;
  }

  sample(): QuerySample {
    return {
      operation: this.operation,
      queryCount: this.queryCount,
      resultRows: this.resultRows,
      encodedResultBytes: this.encodedResultBytes,
      elapsedMs: Math.round((performance.now() - this.started) * 100) / 100,
    };
  }

  assertBudget(budget: QueryBudget): QuerySample {
    const sample = this.sample();
    if (sample.queryCount > budget.maxQueries) {
      throw new Error(`${this.operation}: ${sample.queryCount} queries exceeds ${budget.maxQueries}`);
    }
    if (sample.encodedResultBytes > budget.maxResultBytes) {
      throw new Error(`${this.operation}: ${sample.encodedResultBytes} result bytes exceeds ${budget.maxResultBytes}`);
    }
    return sample;
  }
}
