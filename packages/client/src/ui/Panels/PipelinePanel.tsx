import React, { useEffect, useState } from "react";
import { AppMediator } from "@core/AppMediator";
import type { PipelineViewState } from "@ui/dto/PipelineViewState";

interface PipelinePanelProps {
  mediator: AppMediator;
}

/**
 * Панель управления конфигурацией единственного Animation Engine Pipeline.
 *
 * UI не изменяет Pipeline и конфигурации алгоритмов напрямую.
 * Изменения конфигурации передаются через AppMediator.
 */
export const PipelinePanel: React.FC<PipelinePanelProps> = ({ mediator }) => {
  const [expanded, setExpanded] = useState(true);
  const [state, setState] = useState<PipelineViewState | null>(mediator.pipelineState);

  useEffect(() => {
    setState(mediator.pipelineState);
    return mediator.onPipelineStateChanged(setState);
  }, [mediator]);

  const setEngineEnabled = (engineName: string, enabled: boolean) => {
    mediator.pipelineEngineEnabledChanged(engineName, enabled);
  };

  const setConfigValue = (
    engineName: string,
    key: string,
    value: unknown,
  ) => {
    mediator.pipelineEngineConfigChanged(engineName, {
      [key]: value,
    });
  };

  return (
    <div>
      <h3>Pipeline</h3>

      {state && (
        <section>
          <button type="button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "▼" : "▶"} Pipeline
          </button>

          <div>Температура: {state.temperature.toFixed(4)}</div>
          <div>Состояние: {state.running ? "выполняется" : "остановлен"}</div>
          <div>Агрегация температуры: {state.temperatureAggregation}</div>

          {expanded && (
            <div>
              {state.engines.map((engine) => (
                <div key={engine.name} className={"engine_x"}>
                  <label>
                    <input
                      type="checkbox"
                      checked={engine.enabled}
                      onChange={(event) =>
                        setEngineEnabled(engine.name, event.target.checked)
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
      )}
    </div>
  );
};
