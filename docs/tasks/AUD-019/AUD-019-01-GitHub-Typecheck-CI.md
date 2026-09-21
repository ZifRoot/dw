# AUD-019-01 — Базовый GitHub CI: TypeScript typecheck

## Родительская задача

AUD-019 — архитектура тестирования проекта `dw`.

## Цель

Создать минимальный рабочий **GitHub Actions CI**, чтобы проверить базовый механизм CI на реальной проверке проекта.

В качестве первой проверки использовать уже существующую root-команду:

```bash
npm run typecheck
```

Это позволяет не создавать искусственный `Hello World` workflow, а сразу проверить CI на существующей проверке проекта.

---

## Что требуется сделать

Создать GitHub Actions workflow в:

```text
.github/workflows/
```

Workflow должен:

1. запускаться при каждом `push`;
2. запускаться при каждом `pull_request`;
3. использовать Ubuntu runner;
4. установить фиксированную версию Node.js, принятую проектом;
5. установить зависимости проекта;
6. выполнить:

```bash
npm run typecheck
```

Результат `typecheck` должен определять успешность или неуспешность CI job.

---

## Целевая схема

```text
push / pull request
        |
        v
GitHub Actions
        |
        v
Ubuntu
        |
        v
Node.js
        |
        v
npm install
        |
        v
npm run typecheck
        |
   +----+----+
   |         |
 success    failure
```

---

## Что НЕ входит в задачу

На этом этапе специально **не добавлять**:

- unit tests;
- Jest;
- coverage;
- lint;
- E2E;
- integration tests;
- PostgreSQL;
- build;
- deployment;
- сложную CI-матрицу;
- дополнительные quality gates.

Это минимальная первая CI-задача.

---

## Почему используется `npm run typecheck`

В root `package.json` уже существует:

```json
"typecheck": "npm run typecheck:client && npm run typecheck:server"
```

Поэтому один вызов проверяет TypeScript обоих основных workspace:

```text
root typecheck
    |
    +--> client typecheck
    |
    +--> server typecheck
```

CI не должен самостоятельно знать детали запуска client/server typecheck. Он должен использовать существующий root-level контракт:

```bash
npm run typecheck
```

---

## Учебная цель

Эта задача является первым практическим экспериментом в рамках AUD-019.

После её выполнения должно быть понятно:

- где находится GitHub Actions workflow;
- из чего состоит workflow;
- что такое trigger;
- что такое job;
- что такое runner;
- как выбирается Node.js;
- как CI устанавливает зависимости;
- как CI запускает npm script;
- как exit code команды влияет на результат job;
- где в GitHub посмотреть успешный/неуспешный запуск.

Особенно важно намеренно проверить оба сценария:

### Успешный запуск

```text
npm run typecheck
        |
        v
exit code 0
        |
        v
GitHub Actions: success
```

### Неуспешный запуск

Если `typecheck` завершается с ошибкой:

```text
npm run typecheck
        |
        v
non-zero exit code
        |
        v
GitHub Actions: failure
```

Таким образом проверяется не только факт запуска workflow, но и то, что CI действительно контролирует результат проверки.

---

## Definition of Done

- [ ] Создан workflow в `.github/workflows/`.
- [ ] Workflow запускается на `push`.
- [ ] Workflow запускается на `pull_request`.
- [ ] Используется Ubuntu runner.
- [ ] Используется фиксированная версия Node.js.
- [ ] Зависимости устанавливаются перед проверкой.
- [ ] Выполняется `npm run typecheck`.
- [ ] Успешный typecheck приводит к успешному CI job.
- [ ] Ошибка typecheck приводит к failed CI job.
- [ ] Workflow реально запущен в GitHub Actions.
- [ ] Проверен успешный запуск.
- [ ] Проверено поведение при ошибке typecheck.
- [ ] В задаче/PR зафиксировано, как посмотреть результат workflow.

---

## Результат

После выполнения задачи проект получает самый простой рабочий CI-контур:

```text
GitHub
  |
  +-- push
  |
  +-- pull request
          |
          v
   GitHub Actions
          |
          v
 npm run typecheck
```

Следующие CI-задачи AUD-019 смогут постепенно добавлять новые проверки, не смешивая их с первоначальной проверкой самого механизма GitHub Actions.
