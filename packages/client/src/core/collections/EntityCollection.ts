import "@utils/array-extensions";

/**
 * EntityCollection<T> — коллекция сущностей с гарантированно актуальным
 * индексом `id → позиция в массиве`.
 *
 * ## Концепция
 *
 * Главная задача коллекции — чтобы `indexMap` в любой момент времени
 * точно соответствовал `items`. Не «в основном», не «после ребилда»,
 * а всегда. Именно на это заточены все операции.
 *
 * ## Две ключевые идеи
 *
 * 1. **Стабильная ссылка на массив.**
 *    `items` не пересоздаётся — он мутируется на месте. Ссылка на массив
 *    остаётся одной и той же на протяжении жизни коллекции.
 *    Это позволяет:
 *    - отдавать `items` наружу без риска, что она «протухнет»;
 *    - держать внешние ссылки/наблюдатели, которые всегда видят актуальный срез;
 *    - использовать коллекцию как стабильный источник данных (например,
 *      для привязок, кэшей, мемоизации по ссылке).
 *
 * 2. **Удаление через swap-with-last, а не через shift.**
 *    При удалении элемента на его место встаёт последний элемент массива,
 *    длина уменьшается на 1. Это даёт:
 *    - переиндексацию ровно ОДНОГО элемента (переехавшего последнего),
 *      а не всех справа, как при `splice`;
 *    - O(1) на удаление вместо O(n);
 *    - сохранение стабильной ссылки на массив.
 *
 *    Плата — порядок элементов НЕ сохраняется. Это осознанный размен:
 *    актуальность `indexMap` и стабильность ссылки важнее порядка.
 *
 * ## Инвариант
 *
 * В любой момент после любой публичной операции:
 *   - `items.length === indexMap.size`;
 *   - для каждого `[id, idx]` из `indexMap`: `getId(items[idx]) === id`;
 *   - для каждого `i`: `indexMap.get(getId(items[i])) === i`.
 *
 * Проверяется методом `validate()`.
 */
export class EntityCollection<T> {
  /**
   * Массив сущностей.
   *
   * Ссылка стабильна на протяжении жизни коллекции — массив мутируется
   * на месте (push / swap / truncate), но не пересоздаётся.
   *
   * ВНИМАНИЕ: порядок элементов не является контрактом.
   * После `removes()` порядок может измениться из-за swap-with-last.
   */
  public items: T[] = [];

  /**
   * Карта: id сущности → текущий индекс в `items`.
   *
   * Всегда синхронизирована с `items`. Это главный инвариант коллекции.
   */
  public indexMap: Map<string, number> = new Map();

  /**
   * @param getId Функция извлечения строкового id из сущности.
   *              Используется как ключ в `indexMap`.
   */
  constructor(public getId: (p: T) => string) {}

  /**
   * Возвращает сущность по id или null, если её нет.
   *
   * @param sourceId id сущности. null/undefined → null.
   */
  public getById(sourceId?: string | null) {
    const index = sourceId != null ? this.indexMap.get(sourceId) : null;
    return index != null ? this.items[index] : null;
  }

  /**
   * Добавляет одну сущность.
   *
   * Если id уже есть — обновляет существующую сущность через `Object.assign`
   * (ссылка на сущность в массиве сохраняется, меняются только поля).
   * Если id нет — добавляет в конец `items` и регистрирует в `indexMap`.
   *
   * @param model добавляемая или обновляемая сущность.
   */
  public add(model: T) {
    this._setPoints([model], [], []);
  }

  /**
   * Внутренний пакетный метод добавления/обновления.
   *
   * Логика:
   * - id нет в indexMap → в `toInsert`;
   * - id есть → старая сущность обновляется через `Object.assign`,
   *   ссылка в массиве сохраняется, новая ссылка попадает в `toUpdate`;
   * - новые сущности добавляются в конец `items` (push, ссылка не меняется),
   *   для них регистрируется индекс в `indexMap`.
   *
   * @param points   сущности для обработки.
   * @param toInsert сюда складываются новые сущности.
   * @param toUpdate сюда складываются обновлённые сущности.
   */
  public _setPoints(points: T[], toInsert: T[], toUpdate: T[]) {
    for (const p of points) {
      const idx = this.indexMap.get(this.getId(p));

      if (idx == null) {
        toInsert.push(p);
        continue;
      }

      let old = this.items[idx];

      // Обновляем существующую сущность, сохраняя её ссылку в массиве.
      Object.assign(old!, p);
      toUpdate.push(p);
    }

    if (toInsert.length > 0) {
      const startIdx = this.items.length;
      this.items.push(...toInsert);
      const endIdx = this.items.length;

      // Регистрируем новые элементы в indexMap.
      for (let i = startIdx; i < endIdx; i++) {
        this.indexMap.set(this.getId(this.items[i]), i);
      }
    }
  }

  /**
   * Удаляет сущности по массиву id.
   *
   * Использует swap-with-last (см. `removeByIndices` в array-extensions):
   * на место удаляемого встаёт последний элемент, длина уменьшается.
   * Благодаря этому:
   * - переиндексируется ровно один элемент (переехавший) на каждое удаление;
   * - ссылка на `items` остаётся прежней;
   * - порядок элементов НЕ сохраняется — это плата за O(1) и стабильность.
   *
   * Колбэки:
   * - `del` — удаляемый элемент, чистим его id из `indexMap`;
   * - `add` — переехавший последний элемент, пишем его новый индекс.
   *
   * @param ids массив id для удаления.
   */
  public removes(ids: string[]) {
    this.items.removeByIndices(
      // Индексы удаляемых. Если id нет — будет undefined, removeByIndices отфильтрует.
      ids.map((id) => this.indexMap.get(id)!),

      // Удаляемый: убираем его из indexMap.
      (p) => this.indexMap.delete(this.getId(p)),

      // Переехавший: обновляем его индекс в indexMap.
      (p, ind) => this.indexMap.set(this.getId(p), ind),
    );
  }

  /**
   * Возвращает сущность по id или undefined.
   *
   * @param id id сущности.
   */
  public getPointById(id: string): T | undefined {
    const idx = this.indexMap.get(id);
    return idx !== undefined ? this.items[idx] : undefined;
  }

  /**
   * Полностью очищает коллекцию.
   * Массив очищается через splice — ссылка на `items` сохраняется.
   */
  clear(): void {
    this.items.splice(0, this.items.length);
    this.indexMap.clear();
  }

  /**
   * Проверяет инвариант консистентности:
   * - размеры items и indexMap совпадают;
   * - каждый индекс из indexMap указывает на правильный id;
   * - каждый элемент items присутствует в indexMap с правильным индексом.
   *
   * @returns { ok, errors }.
   */
  validate(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Размеры
    if (this.items.length !== this.indexMap.size) {
      errors.push(`Size mismatch: items.length=${this.items.length}, indexMap.size=${this.indexMap.size}`);
    }

    // 2. Все индексы из indexMap указывают на правильный id
    for (const [id, idx] of this.indexMap.entries()) {
      if (idx < 0 || idx >= this.items.length) {
        errors.push(`Index out of bounds for id ${id}: idx=${idx}`);
      } else if (!this.items[idx] || this.getId(this.items[idx]) !== id) {
        const foundId = this.items[idx] ? this.getId(this.items[idx]) : "null";
        errors.push(`Mismatch at index ${idx}: expected id ${id}, found ${foundId}`);
      }
    }

    // 3. Все элементы массива присутствуют в indexMap с верным индексом
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) {
        errors.push(`Null item at index ${i}`);
        continue;
      }

      const id = this.getId(item);
      const storedIdx = this.indexMap.get(id);

      if (storedIdx !== i) {
        errors.push(`Item ${id} at index ${i} has indexMap value ${storedIdx}`);
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Поверхностная копия коллекции.
   *
   * - сущности копируются через `{ ...item }` — вложенные объекты общие;
   * - `getId` переиспользуется;
   * - `indexMap` копируется отдельно;
   * - ссылка на новый `items` — своя, от исходной коллекции не зависит.
   *
   * @returns Новая EntityCollection<T>.
   */
  clone(): EntityCollection<T> {
    const newCollection = new EntityCollection<T>(this.getId);

    // Shallow copy каждой сущности.
    newCollection.items = this.items.map((item) => ({ ...item }));

    // Копия indexMap.
    newCollection.indexMap = new Map(this.indexMap);

    return newCollection;
  }
}
