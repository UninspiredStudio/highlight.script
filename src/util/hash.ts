export function hash(str: string) {
  let hash = 5381,
    index = str.length;

  while (index) {
    hash = (hash * 33) ^ str.charCodeAt(--index);
  }

  return hash >>> 0;
}
