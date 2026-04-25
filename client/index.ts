// index.ts
import { CanvasEngine } from "./src/core/CanvasEngine";
import { createUI } from "./src/ui/ui"; // функция, которая монтирует React в контейнер

function bootstrap() {
  // Создаем корневой элемент для всего приложения (может быть передан из HTML)
  const appContainer = document.getElementById("app");
  if (!appContainer) throw new Error("No #app element");

  // Создаем контейнер для Canvas (им полностью владеет движок)
  const canvasDiv = document.createElement("div");
  canvasDiv.id = "canvas-container";
  // Создаем контейнер для React UI
  const uiDiv = document.createElement("div");
  uiDiv.id = "ui-container";

  appContainer.appendChild(uiDiv);
  appContainer.appendChild(canvasDiv);

  // Инициализируем графическое ядро (оно сразу начинает работать)
  const engine = new CanvasEngine(canvasDiv);

  // Монтируем React UI, передавая ссылку на движок
  createUI(uiDiv, engine);
}

bootstrap();
