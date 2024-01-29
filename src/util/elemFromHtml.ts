export function fromHTML(html: string, trim: boolean = true) {
  // Process the HTML string.
  html = trim ? html : html.trim();
  if (!html) return null;

  // Then set up a new template element.
  const template = document.createElement("template");
  template.innerHTML = html;
  const result = template.content.children;

  // Then return either an HTMLElement or HTMLCollection,
  // based on whether the input HTML had one or more roots.
  const returnValue = result[0];
  return returnValue;
}
