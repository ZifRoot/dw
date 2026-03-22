import { customType } from "drizzle-orm/pg-core";

// 1. Оставляем только тип данных в дженерике <{ data: string }>
export const bytea = customType<{ data: string }>({
  dataType() {
    // 2. Возвращаем название типа для Postgres
    return "bytea";
  },
  toDriver(val: string) {
    let newVal = val;
    if (val.startsWith("0x")) {
      newVal = val.slice(2);
    }
    return Buffer.from(newVal, "hex");
  },
  fromDriver(val: unknown) {
    // Драйвер pg возвращает Buffer, приводим его к hex-строке
    if (Buffer.isBuffer(val)) {
      return val.toString("hex");
    }
    return val as string;
  },
});
