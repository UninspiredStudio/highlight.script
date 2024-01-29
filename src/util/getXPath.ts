export function getPathTo(element: HTMLElement): any {
  if (element.id !== "") return 'id("' + element.id + '")';
  if (element === document.body) return element.tagName;

  let ix = 0;
  if (!element.parentNode) return "";
  const siblings = element.parentNode.childNodes;
  for (let i = 0; i < siblings.length; i++) {
    var sibling = siblings[i];
    if (sibling === element)
      return (
        // @ts-ignore
        getPathTo(element.parentNode) +
        "/" +
        element.tagName +
        "[" +
        (ix + 1) +
        "]"
      );
    // @ts-ignore
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
  }
}
