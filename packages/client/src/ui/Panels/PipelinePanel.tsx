import React, { useState } from "react";
import { AppMediator } from "@core/AppMediator";
import { EnginePipeline } from "@core/Engines/EnginePipeline";

interface PipelinePanelProps {
  pipelines: EnginePipeline[];
  mediator: AppMediator;
}

interface PipelineState {
  name: string;
  engines: Array<{
    name: string;
    enabled: boolean;
    config: Record<string, unknown>;
  }>;
}

/**
 * Панель управления конфигурацией Animation Engine Pipeline.
 *
 * UI не изменяет Pipeline и конфигурации алгоритмов напрямую.
 * Изменения конфигурации передаются через AppMediator.
 */
export const PipelinePanel: React.FC<PipelinePanelProps> = ({
  pipelines,
  mediator,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [states, setStates] = useState<PipelineState[]>(() =>
    pipelines.map((pipeline) => ({
      name: pipeline.pipelineName,
      engines: pipeline.getConfiguration().map((engine) => ({
        name: engine.name,
        enabled: engine.enabled,
        config: { ...engine.config },
      })),
    })),
  );

  const toggleExpanded = (pipelineName: string) => {
    setExpanded((current) => ({
      ...current,
      [pipelineName]: !(current[pipelineName] ?? true),
    }));
  };

  const setEngineEnabled = (
    pipelineName: string,
    engineName: string,
    enabled: boolean,
  ) => {
    const pipeline = pipelines.find(
      (item) => item.pipelineName === pipelineName,
    );
    if (!pipeline) return;

    mediator.pipelineEngineEnabledChanged(pipelineName, engineName, enabled);

    setStates((current) =>
      current.map((state) =>
        state.name !== pipelineName
          ? state
          : {
              ...state,
              engines: state.engines.map((engine) =>
                engine.name === engineName ? { ...engine, enabled } : engine,
              ),
            },
      ),
    );
  };

  const setConfigValue = (
    pipelineName: string,
    engineName: string,
    key: string,
    value: unknown,
  ) => {
    mediator.pipelineEngineConfigChanged(pipelineName, engineName, {
      [key]: value,
    });

    setStates((current) =>
      current.map((state) =>
        state.name !== pipelineName
          ? state
          : {
              ...state,
              engines: state.engines.map((engine) =>
                engine.name !== engineName
                  ? engine
                  : {
                      ...engine,
                      config: { ...engine.config, [key]: value },
                    },
              ),
            },
      ),
    );
  };

  return (
    <div>
      <h3>Pipeline</h3>

      {states.map((pipeline) => {
        const isExpanded = expanded[pipeline.name] ?? true;

        return (
          <section key={pipeline.name}>
            <button type="button" onClick={() => toggleExpanded(pipeline.name)}>
              {isExpanded ? "▼" : "▶"} {pipeline.name}
            </button>

            {isExpanded && (
              <div>
                {pipeline.engines.map((engine) => (
                  <div key={engine.name} className={"engine_x"}>
                    <label>
                      <input
                        type="checkbox"
                        checked={engine.enabled}
                        onChange={(event) =>
                          setEngineEnabled(
                            pipeline.name,
                            engine.name,
                            event.target.checked,
                          )
                        }
                      />
                      {engine.name}
                    </label>

                    {engine.enabled && (
                      <div>
                        {Object.entries(engine.config).map(([key, value]) => (
                          <label key={key} className={"engine_config"}>
                            {key}
                            {typeof value === "boolean" ? (
                              <input
                                type="checkbox"
                                checked={value}
                                onChange={(event) =>
                                  setConfigValue(
                                    pipeline.name,
                                    engine.name,
                                    key,
                                    event.target.checked,
                                  )
                                }
                              />
                            ) : typeof value === "number" ? (
                              <input
                                type="number"
                                value={value}
                                onChange={(event) =>
                                  setConfigValue(
                                    pipeline.name,
                                    engine.name,
                                    key,
                                    Number(event.target.value),
                                  )
                                }
                              />
                            ) : typeof value === "string" ? (
                              <input
                                type="text"
                                value={value}
                                onChange={(event) =>
                                  setConfigValue(
                                    pipeline.name,
                                    engine.name,
                                    key,
                                    event.target.value,
                                  )
                                }
                              />
                            ) : (
                              <span>{String(value)}</span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
