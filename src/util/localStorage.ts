export class LocalStorage<T = any> {
  constructor(private key: string) {
    this.key = key;
  }

  get(): T[] {
    const item = localStorage.getItem(this.key);
    if (item) {
      return Array.from(new Set(JSON.parse(item)));
    }
    return [];
  }

  set(item: T[]) {
    localStorage.setItem(this.key, JSON.stringify(item));
  }

  push(item: T | T[]) {
    let list = this.get();
    if (Array.isArray(item)) {
      if (!list) list = item;
      else list.push(...item);
    } else {
      if (!list) list = [item];
      else list.push(item);
    }
    list = Array.from(new Set(list));
    this.set(list);
  }

  remove(index: number) {
    let list = this.get();
    console.log({ index });
    if (index === -1) return;
    if (!list) return;
    console.log({ oldList: JSON.stringify(list) });
    list.splice(index, 1);
    console.log({ newList: JSON.stringify(list) });
    this.set(list);
  }
}
