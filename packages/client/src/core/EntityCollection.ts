import "@utils/array-extensions";

export class EntityCollection<T> {
  public items: T[] = [];
  public indexMap: Map<string, number> = new Map(); // id → индекс в массиве

  constructor(public getId: (p: T) => string) {}

  public getById(sourceId?: string | null) {
    const index = sourceId != null ? this.indexMap.get(sourceId) : null;
    return index != null ? this.items[index] : null;
  }
  public add(model: T) {
    this._setPoints([model], [], []);
  }
  public _setPoints(points: T[], toInsert: T[], toUpdate: T[]) {
    for (const p of points) {
      const idx = this.indexMap.get(this.getId(p));

      if (idx == null) {
        toInsert.push(p);
        continue;
      }

      let old = this.items[idx];

      Object.assign(old!, p);
      toUpdate.push(p);
    }

    if (toInsert.length > 0) {
      const startIdx = this.items.length;
      this.items.push(...toInsert);
      const endIdx = this.items.length;
      for (let i = startIdx; i < endIdx; i++) this.indexMap.set(this.getId(this.items[i]), i);
    }
  }
  public removes(ids: string[]) {
    this.items.removeByIndices(
      ids.map((id) => this.indexMap.get(id)!),
      (p) => this.indexMap.delete(this.getId(p)),
      (p, ind) => this.indexMap.set(this.getId(p), ind),
    );
  }
  public getPointById(id: string): T | undefined {
    const idx = this.indexMap.get(id);
    return idx !== undefined ? this.items[idx] : undefined;
  }
  clear(): void {
    this.items.splice(0, this.items.length);
    this.indexMap.clear();
  }

  /** Проверка консистентности: размеры, индексы, ссылки */
  validate(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    // 1. Размеры
    if (this.items.length !== this.indexMap.size) {
      errors.push(`Size mismatch: items.length=${this.items.length}, indexMap.size=${this.indexMap.size}`);
    }
    // 2. Проверка, что все индексы в indexMap указывают на правильные id
    for (const [id, idx] of this.indexMap.entries()) {
      if (idx < 0 || idx >= this.items.length) {
        errors.push(`Index out of bounds for id ${id}: idx=${idx}`);
      } else if (!this.items[idx] || this.getId(this.items[idx]) !== id) {
        const foundId = this.items[idx] ? this.getId(this.items[idx]) : "null";
        errors.push(`Mismatch at index ${idx}: expected id ${id}, found ${foundId}`);
      }
    }
    // 3. Проверка, что все элементы массива присутствуют в indexMap
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
  clone(): EntityCollection<T> {
    const newCollection = new EntityCollection<T>(this.getId);
    // Копируем каждую сущность (shallow copy)
    newCollection.items = this.items.map((item) => ({ ...item }));
    // Копируем indexMap
    newCollection.indexMap = new Map(this.indexMap);
    return newCollection;
  }
}
