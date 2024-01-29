export type HTMLElementMouseEvent<T extends HTMLElement = HTMLElement> =
  MouseEvent & {
    target: T;
  };
