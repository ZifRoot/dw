import { OpenAPIHono } from '@hono/zod-openapi';
import { Request, Response } from 'express';

/**
 * Превращает Hono-роутер в Express-обработчик.
 * Проксирует запрос и ответ, позволяя Hono работать внутри Express.
 */
export function honoToExpress(honoApp: OpenAPIHono) {
  return async (req: Request, res: Response) => {
    // Формируем URL и заголовки для Hono
    const url = `http://${req.hostname}${req.originalUrl}`;
    const headers = new Headers(req.headers as any);
    // Тело запроса (если есть)
    let body: any = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = req.body;
      // если тело уже распарсено Express как объект, передаём JSON-строку
      if (typeof body === 'object') {
        body = JSON.stringify(body);
        headers.set('content-type', 'application/json');
      }
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body,
    });

    try {
      const response = await honoApp.fetch(request);
      // Копируем статус и заголовки
      res.status(response.status);
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const text = await response.text();
      res.send(text);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Hono handler error' });
    }
  };
}