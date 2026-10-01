# ObservableArray

ObservableArray<T> — расширение стандартного JavaScript Array, которое сообщает об изменениях содержимого через события.

Класс находится в packages/shared/src/utils/observable-array.ts и предназначен для случаев, когда массив является источником состояния для других частей приложения: подписчик получает информацию о добавленных, удалённых и изменённых элементах без необходимости самостоятельно сравнивать массив целиком.

## Основная идея

ObservableArray сохраняет обычную семантику массива, но добавляет три типа событий:

| Событие | Когда возникает |
| --- | --- |
| add | появились новые позиции массива |
| remove | позиции были удалены из массива |
| update | существующее значение изменилось |

Каждое событие передаёт массив объектов с индексом и значением:

    interface ObservableArrayItem<T> {
      index: number;
      value: T;
    }

Для add и remove значение также может быть undefined, поскольку массив может содержать holes.

## Создание

Конструктор сохраняет семантику стандартного Array.

    const empty = new ObservableArray<number>();

    const values = new ObservableArray(1, 2, 3);
    // [1, 2, 3]

    const sparse = new ObservableArray<number[]>(3);
    // массив длины 3 с пустыми позициями

Важно: new ObservableArray(1) означает массив длины 1, а не массив [1], точно так же, как new Array(1).

Начальное создание массива не генерирует события. Это позволяет создать начальное состояние, а затем подписаться на последующие изменения.

## Подписка

Для каждого типа события есть отдельный метод подписки:

    const array = new ObservableArray(1, 2, 3);

    const disposeUpdate = array.onUpdate((items) => {
      console.log("update", items);
    });

    const disposeAdd = array.onAdd((items) => {
      console.log("add", items);
    });

    const disposeRemove = array.onRemove((items) => {
      console.log("remove", items);
    });

Методы подписки возвращают функцию отписки:

    disposeUpdate();
    disposeAdd();
    disposeRemove();

После вызова функции отписки соответствующий обработчик больше не получает события.

## Изменение по индексу

Изменение существующего значения создаёт update:

    const array = new ObservableArray(10, 20);

    array.onUpdate((items) => console.log(items));

    array[1] = 30;
    // [{ index: 1, value: 30 }]

Повторная запись того же значения событие не создаёт.

    array[1] = 30;
    // событие не возникает

### Запись за пределами текущей длины

Если индекс выходит за пределы массива, создаются все промежуточные позиции. Для них значение считается undefined:

    const array = new ObservableArray(10);

    array.onAdd((items) => console.log(items));

    array[3] = 40;
    // [
    //   { index: 1, value: undefined },
    //   { index: 2, value: undefined },
    //   { index: 3, value: 40 },
    // ]

## Изменение length

Увеличение длины создаёт add для каждой новой позиции:

    const array = new ObservableArray(1, 2);

    array.length = 5;
    // add:
    // [
    //   { index: 2, value: undefined },
    //   { index: 3, value: undefined },
    //   { index: 4, value: undefined },
    // ]

Уменьшение длины создаёт remove для удалённых позиций.

## delete

Удаление элемента через delete не уменьшает длину массива и не считается remove.

Вместо этого возникает update со значением undefined:

    const array = new ObservableArray(10, 20, 30);

    array.onUpdate((items) => console.log(items));

    delete array[1];
    // [{ index: 1, value: undefined }]

    array.length;
    // 3

    1 in array;
    // false

Таким образом, сохраняется стандартная семантика sparse array.

## Методы изменения массива

Поддерживаются стандартные методы изменения массива:

- push
- pop
- shift
- unshift
- splice
- fill
- reverse
- sort
- copyWithin

При этом события описывают логическое изменение элементов, а не каждое внутреннее перемещение индексов.

### push

Добавленные элементы получают свои конечные индексы:

    const array = new ObservableArray(1);

    array.onAdd(console.log);

    array.push(2, 3);
    // [
    //   { index: 1, value: 2 },
    //   { index: 2, value: 3 },
    // ]

### pop

Удаляется один элемент с его предыдущим индексом:

    array.pop();
    // remove:
    // [{ index: 2, value: 3 }]

### shift и unshift

При перемещении существующих элементов события для изменения их индексов не создаются.

Для shift сообщается только удалённый элемент:

    array.shift();
    // remove:
    // [{ index: 0, value: 1 }]

Для unshift сообщаются только добавленные элементы:

    array.unshift(1);
    // add:
    // [{ index: 0, value: 1 }]

То есть перемещение элементов из старых индексов в новые не трактуется как множество update.

### splice

splice аналогично разделяет удаление и добавление.

    const array = new ObservableArray(1, 2, 3, 4);

    array.splice(1, 1, 20, 30);

Результат:

- remove: { index: 1, value: 2 }
- add: { index: 1, value: 20 }, { index: 2, value: 30 }
- update: отсутствуют

Перемещение существующих элементов после точки вставки не генерирует update.

### fill

fill создаёт update только для позиций, значение которых действительно изменилось.

    const array = new ObservableArray(1, 2, 3);

    array.fill(9, 1);
    // update:
    // [
    //   { index: 1, value: 9 },
    //   { index: 2, value: 9 },
    // ]

Если значение позиции уже равно передаваемому значению, событие для неё не создаётся.

### reverse, sort и copyWithin

Эти методы сообщают update для позиций, значения которых изменились.

    const array = new ObservableArray(1, 2, 3);

    array.reverse();
    // update:
    // [
    //   { index: 0, value: 3 },
    //   { index: 2, value: 1 },
    // ]

Текущая реализация этих методов использует снимок массива для определения изменений.

## Семантика событий

Главное правило — событие описывает изменение содержимого или структуры массива, а не внутренние операции JavaScript.

Например, после:

    array.unshift(0);

элемент, который был на индексе 0, физически перемещается на индекс 1, но отдельного update для него нет.

Это позволяет подписчикам реагировать на реальные добавления, удаления и изменения данных, не обрабатывая большое количество технических перемещений.

## Пустые операции

Операции, которые ничего не изменяют, не генерируют событий:

- push()
- unshift()
- pop() для пустого массива
- shift() для пустого массива
- пустой splice
- fill с пустым диапазоном
- reverse без изменений
- sort без изменений
- copyWithin без изменений

## Типизация

Текущая версия ограничивает элементы массива типом Primitive:

    type Primitive =
      | string
      | number
      | boolean
      | bigint
      | symbol
      | null
      | undefined;

Например:

    const numbers = new ObservableArray<number[]>();
    const strings = new ObservableArray<string[]>();

Ограничение является частью текущего API и в этой версии намеренно не заменяется на произвольный пользовательский тип.

## Совместимость с Array

ObservableArray является наследником стандартного Array:

    const array = new ObservableArray(1, 2, 3);

    array instanceof Array;
    // true

    array.length;
    // 3

    array[0];
    // 1

Поэтому обычные операции чтения, итерация и стандартные свойства массива сохраняют привычную семантику.

## Принцип использования

Типичный сценарий:

    const points = new ObservableArray(1, 2, 3);

    points.onAdd((items) => {
      // добавить новые элементы в зависимую структуру
    });

    points.onRemove((items) => {
      // удалить соответствующие элементы
    });

    points.onUpdate((items) => {
      // обновить изменившиеся элементы
    });

ObservableArray следует рассматривать как источник событий для производных структур. Подписчик получает только информацию, необходимую для обработки изменения, и не обязан сравнивать старое и новое состояние всего массива.
