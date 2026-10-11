export interface PipelineEngineViewState {
  name: string;
  enabled: boolean;
  config: Readonly<Record<string, unknown>>;
  temperature: number;
  skipFrames: number;
}

export interface PipelineViewState {
  running: boolean;
  temperature: number;
  temperatureAggregation: "maximum" | "average";
  engines: ReadonlyArray<PipelineEngineViewState>;
}
