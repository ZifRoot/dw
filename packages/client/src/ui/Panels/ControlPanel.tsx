import React, { useEffect, useState } from "react";
import { AppMediator } from "@core/AppMediator";
import * as fetch from "@clients/dew/fetch";
import styles from "./ControlPanel.module.scss"; // CSS Modules

interface Props {
  mediator: AppMediator;
}

export const ControlPanel: React.FC<Props> = ({ mediator }) => {
  const [temperature, setTemperature] = useState(mediator.temperature);
  const [progress, setProgress] = useState(mediator.progress);
  const [autoZoom, setAutoZoom] = useState(mediator.autoZoom);
  const [targetSize, setTargetSize] = useState(mediator.targetSize);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const actionsApi = new fetch.ActionsApi(
    new fetch.Configuration({ basePath: "/api" }),
  );

  const handleComputeEmbeddings = async () => {
    try {
      await actionsApi.actionsUpdateEmbeddingPost();
    } catch (error) {
      console.error("Ошибка при вычислении эмбеддингов:", error);
    }
  };

  useEffect(() => {
    const unsubTemp = mediator.onTemperature(setTemperature);
    const unsubProgress = mediator.onProgress(setProgress);
    const unsubTarget = mediator.onTargetSize(setTargetSize);
    const unsubAutoZoom = mediator.onAutoZoom(setAutoZoom);
    const unsubSaved = mediator.onPositionsSaved(() => {
      setSavedAt(new Date().toLocaleTimeString());
    });
    return () => {
      unsubTemp();
      unsubProgress();
      unsubTarget();
      unsubAutoZoom();
      unsubSaved();
    };
  }, [mediator]);

  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const handleTargetSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) mediator.targetSize = val;
  };

  return (
    <div className={styles.panel}>
      {/* <button className={styles.button} onClick={() => mediator.addPoint()}>
        Добавить точку
      </button>
      <button className={styles.button} onClick={() => mediator.clearPoints()}>
        Очистить
      </button> */}
      <button
        className={styles.button}
        onClick={() => mediator.startRepulsion()}
      >
        Старт репульсии
      </button>
      <button className={styles.button} onClick={() => mediator.startGraph()}>
        Старт Graph
      </button>
      <button
        className={styles.button}
        onClick={() => mediator.savePositions()}
      >
        Сохранить
      </button>
      <button className={styles.button} onClick={handleComputeEmbeddings}>
        Вычисление эмбеддингов
      </button>
      <button
        className={styles.button}
        onClick={() => mediator.modelManagerStep()}
      >
        ModelManager
      </button>
      {savedAt && <span className={styles.saved}>Сохранено в {savedAt}</span>}
      <div>Температура: {temperature.toFixed(4)}</div>
      <div>Прогресс: {progress.toFixed(4)}</div>
      <div>
        <label>AUTO ZOOM:</label>
        <input
          type="checkbox"
          checked={autoZoom}
          onChange={(e) => (mediator.autoZoom = e.target.checked)}
        />
      </div>
      <div>
        <label>Целевое кол-во точек:</label>
        <input
          type="number"
          min="1"
          max="1000"
          value={targetSize}
          onChange={handleTargetSizeChange}
        />
      </div>
    </div>
  );
};
