export function expandToWord(range: Range) {
  if (range.collapsed) {
    return;
  }

  while (range.startOffset > 0 && range.toString()[0].match(/\w/)) {
    range.setStart(range.startContainer, range.startOffset - 1);
  }

  while (
    range.endOffset < (range.endContainer.textContent?.length || 0) &&
    range.toString()[range.toString().length - 1].match(/\w/)
  ) {
    range.setEnd(range.endContainer, range.endOffset + 1);
  }

  return range;
}
