import React, { useEffect, useState } from "react";
import { AppMediator } from "@core/AppMediator";
import type { PipelineViewState } from "@ui/dto/PipelineViewState";

interface PipelinePanelProps {
  mediator: AppMediator;
}

/**
 * Панель управления конфигурацией Animation Engine Pipeline.
 *
 * UI не изменяет Pipeline и конфигурации алгоритмов напрямую.
 * Изменения конфигурации передаются через AppMediator.
 */
export const PipelinePanel: React.FC<PipelinePanelProps> = ({ mediator }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [states, setStates] = useState<ReadonlyArray<PipelineViewState>>(
    mediator.pipelineStates,
  );

  useEffect(() => {
    setStates(mediator.pipelineStates);
    return mediator.onPipelineStateChanged((state) => {
      setStates((current) => {
        const withoutCurrent = current.filter((item) => item.name !== state.name);
        return [...withoutCurrent, state];
      });
    });
  }, [mediator]);

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
    mediator.pipelineEngineEnabledChanged(pipelineName, engineName, enabled);
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

            <div>Температура: {pipeline.temperature.toFixed(4)}</div>
            <div>Состояние: {pipeline.running ? "выполняется" : "остановлен"}</div>
            <div>Агрегация температуры: {pipeline.temperatureAggregation}</div>

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

                    <div>Температура physics: {engine.temperature.toFixed(4)}</div>
                    <div>Пропуск кадров: {engine.skipFrames}</div>

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
