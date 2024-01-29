import type { HTMLElementMouseEvent } from "./util/event";
import { expandToWord } from "./util/expandToWord";
import { getPathTo } from "./util/getXPath";
import { hash } from "./util/hash";
import { LocalStorage } from "./util/localStorage";
import { serialize } from "./util/serialize";
import { queryStringToJSON } from "./util/qsToJson";
import "./highlights.scss";

export type HighlightType =
  | "local"
  | "remote"
  | "blacklisted"
  | "highlightable"
  | "uploadable"
  | "upvoted";

export interface TargetAttributes {
  type: HighlightType;
  startOffset: number;
  endOffset: number;
  text: string;
  xPath: string;
  id?: number;
}
export interface Highlight {
  id?: number;
  pageId?: number;
  text: string;
  xPath: string;
  startOffset: number;
  endOffset: number;
  userId?: string;
}

export interface LocalizedHighlight extends Highlight {
  type: HighlightType;
}

export type HighlightsProps = {
  apiUrl: string;
  apiKey?: string;
  uploadInterval?: number;
  selectableElements?: string[];
  unselectableElements?: string[];
  minSelectionLength?: number;
  onCopy?: (attrs: TargetAttributes) => void;
  onShare?: (attrs: TargetAttributes) => void;
  shareButtonContent?: string;
  highlightButtonContent?: string;
  unhighlightButtonContent?: string;
  copyButtonContent?: string;
  blacklistButtonContent?: string;
  upvoteButtonContent?: string;
};

export default class Highlights {
  private uploadTimer: Timer | null = null;
  private uploadInterval: number;
  private selectableElements: string[];
  private unselectableElements: string[];
  private apiUrl: string;
  private apiKey?: string;
  private minSelectionLength: number;
  private onCopy: (attrs: TargetAttributes) => void;
  private onShare: (attrs: TargetAttributes) => void;
  private initialized: boolean = false;
  private domManipulated: boolean = false;
  private shareButtonContent: string;
  private highlightButtonContent: string;
  private unhighlightButtonContent: string;
  private copyButtonContent: string;
  private blacklistButtonContent: string;
  private upvoteButtonContent: string;

  private mouseDownTarget: HTMLElement | null = null;

  private attrs: TargetAttributes | null = null;

  private tooltipElem: HTMLElement | null = null;

  private localHighlightStore = new LocalStorage<Highlight>("local-highlights");
  private remoteHighlightStore = new LocalStorage<Highlight>(
    "remote-highlights"
  );
  private uploadableHighlightStore = new LocalStorage<Highlight>(
    "uploadable-highlights"
  );
  private upvotedHighlightStore = new LocalStorage<Highlight>(
    "upvoted-highlights"
  );
  private blacklistedHighlightStore = new LocalStorage<number>(
    "blacklisted-highlights"
  );

  constructor(props: HighlightsProps) {
    this.apiUrl = props.apiUrl;
    this.apiKey = props.apiKey;
    this.uploadInterval = props.uploadInterval || 5000;
    this.selectableElements = props.selectableElements || ["p", "span"];
    this.unselectableElements = props.unselectableElements || ["a", "button"];
    this.minSelectionLength = props.minSelectionLength || 3;
    this.onCopy =
      props.onCopy || ((attrs) => navigator.clipboard.writeText(attrs.text));
    this.onShare =
      props.onShare ||
      (({ xPath }) => {
        const url = new URL(window.location.href);
        url.searchParams.set("xPath", xPath);
        navigator.clipboard.writeText(url.toString());
      });

    this.shareButtonContent = props.shareButtonContent || "Share";
    this.highlightButtonContent = props.highlightButtonContent || "Highlight";
    this.unhighlightButtonContent =
      props.unhighlightButtonContent || "Unhighlight";
    this.copyButtonContent = props.copyButtonContent || "Copy";
    this.blacklistButtonContent = props.blacklistButtonContent || "Blacklist";
    this.upvoteButtonContent = props.upvoteButtonContent || "Upvote";
  }

  public enable = () => {
    if (this.initialized) this.onDomContentLoaded();
    else {
      this.init();
    }
  };

  private init = () => {
    window.addEventListener("load", this.onDomContentLoaded);
    window.addEventListener("unload", () => {});
  };

  private onDomContentLoaded = () => {
    // Add tooltip to DOM
    this.createTooltip();

    // DOM Events
    document.addEventListener("mousedown", (e) =>
      this.onMouseDown(e as HTMLElementMouseEvent)
    );
    document.addEventListener("mouseup", (e) =>
      this.onMouseUp(e as HTMLElementMouseEvent)
    );
    window.addEventListener("resize", this.onResize);

    // Set uploadTimer
    this.uploadTimer = setInterval(
      this.pushLocalHighlights,
      this.uploadInterval
    );

    this.initialized = true;
    void this.fetchRemoteHighlights();
  };

  private fetch = async <Req = any, Res = any>(
    path: string,
    method: "GET" | "PUT",
    body?: Req
  ): Promise<Res> => {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Res;
  };

  private fetchRemoteHighlights = async () => {
    const slug = this.generateUploadUrl();
    const res = await this.fetch<undefined, Highlight[]>(
      `/highlights/${slug}`,
      "GET"
    );
    this.remoteHighlightStore.set(res);
    this.updateHighlights();
  };

  private generateUploadUrl = () => {
    const url = window.location.host + window.location.pathname;
    const urlHash = hash(url);
    return urlHash;
  };

  private pushLocalHighlights = async () => {
    try {
      const uploadableHighlights = this.uploadableHighlightStore.get();
      if (uploadableHighlights.length === 0) return;
      const highlightsToUpload = uploadableHighlights.slice(0, 10);
      const slug = this.generateUploadUrl();

      const newRemoteHighlights = await this.fetch<Highlight[], Highlight[]>(
        `/highlights/${slug}`,
        "PUT",
        highlightsToUpload
      );
      this.remoteHighlightStore.set(newRemoteHighlights);
      this.uploadableHighlightStore.set(uploadableHighlights.slice(10));
      this.localHighlightStore.push([...highlightsToUpload]);
      this.updateHighlights();
    } catch (e) {
      console.error("Error pushing local highlights", e);
    }
  };

  private highlightEquals = (a: Highlight, b: Highlight) => {
    return a.startOffset === b.startOffset && a.endOffset === b.endOffset;
  };

  private updateHighlights = () => {
    const upvotedHighlights = this.upvotedHighlightStore
      .get()
      .map((highlight) => ({
        ...highlight,
        type: "upvoted" as const,
      }));

    const localHighlights = this.localHighlightStore.get().map((highlight) => ({
      ...highlight,
      type: "local" as const,
    }));

    const blacklistedHighlightIds = this.blacklistedHighlightStore.get();
    const remoteHighlights = this.remoteHighlightStore
      .get()
      .filter((highlight) =>
        upvotedHighlights.every(
          (h) => h.xPath !== highlight.xPath && h.text !== highlight.text
        )
      )
      .map((highlight) => ({
        ...highlight,
        type: "remote" as const,
      }));

    const uploadableHighlights = this.uploadableHighlightStore
      .get()
      .map((highlight) => ({
        ...highlight,
        type: "uploadable" as const,
      }));

    const allHighlights = Array.from(
      new Set([
        ...localHighlights,
        ...remoteHighlights,
        ...upvotedHighlights,
        ...uploadableHighlights,
      ])
    );

    this.setHighlights(
      allHighlights.filter(
        (highlight) => !blacklistedHighlightIds.includes(highlight.id!)
      )
    );
  };

  private clearHighlights = () => {
    const highlights = document.querySelectorAll(".highlighted");
    for (const highlight in highlights) {
      if (highlights.hasOwnProperty(highlight)) {
        const element = highlights[highlight];
        element.outerHTML = element.innerHTML;
      }
    }
  };

  private setHighlights = (highlights: LocalizedHighlight[]) => {
    this.clearHighlights();
    console.log(highlights.map((h) => ({ xPath: h.xPath, type: h.type })));
    highlights.forEach((highlight) => {
      const element = document.evaluate(
        highlight.xPath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue as HTMLElement;
      if (!element) return;
      const html = element.innerHTML;
      if (!html) return;
      const contentWithin = html.slice(
        highlight.startOffset,
        highlight.endOffset
      );
      if (contentWithin !== highlight.text) return;
      const contentBefore = html.slice(0, highlight.startOffset);
      const contentAfter = html.slice(highlight.endOffset);
      element.innerHTML = html
        .replace(
          contentBefore,
          `${contentBefore}<span class="highlighted" data-highlight-start-offset="${
            highlight.startOffset
          }" data-highlight-end-offset="${
            highlight.endOffset
          }" data-highlight-type="${highlight.type}" data-highlight-id="${
            highlight.id
          }" data-highlight-xpath="${highlight.xPath.replaceAll('"', "'")}">`
        )
        .replace(contentAfter, `</span>${contentAfter}`);
    });
    this.updateHighlightOnHover();

    // Scroll to element from query
    const query = new URLSearchParams(window.location.search);
    const xPath = query.get("xPath");
    if (!this.domManipulated && !!xPath) {
      this.scrollToElementByQuery(xPath);
    }

    this.domManipulated = true;
  };

  private updateHighlightOnHover = () => {
    const highlights = document.querySelectorAll(".highlighted");
    for (const highlight of highlights) {
      highlight.removeEventListener("mouseenter", (e) =>
        this.onHighlightableMouseEnter(e as HTMLElementMouseEvent)
      );
      highlight.addEventListener("mouseenter", (e) =>
        this.onHighlightableMouseEnter(e as HTMLElementMouseEvent)
      );
      highlight.removeEventListener("mouseleave", (e) =>
        this.onHighlightableMouseLeave(e as HTMLElementMouseEvent)
      );
      highlight.addEventListener("mouseleave", (e) =>
        this.onHighlightableMouseLeave(e as HTMLElementMouseEvent)
      );
    }
  };

  private scrollToElementByQuery = (xPath: string) => {
    const element = document.evaluate(
      xPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue as HTMLElement;
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth" });
    element.classList.add("queried");
  };

  private blacklistHighlight(id: number) {
    this.blacklistedHighlightStore.push(id);
    this.updateHighlights();

    void this.fetch(`/highlights/${id}/blacklist`, "PUT");
  }

  private upvoteHighlight(attrs: TargetAttributes) {
    this.upvotedHighlightStore.push(attrs);
    this.updateHighlights();

    void this.fetch(`/highlights/${attrs.id}/upvote`, "PUT");
  }

  private onShareButtonClick = () => {
    if (!this.attrs) return;
    this.onShare(this.attrs);
  };

  private onCopyButtonClick = () => {
    if (!this.attrs) return;
    return this.onCopy(this.attrs);
  };

  private onHighlightButtonClick = () => {
    if (!this.attrs) return;
    const highlight: Highlight = {
      startOffset: this.attrs.startOffset,
      endOffset: this.attrs.endOffset,
      text: this.attrs.text,
      xPath: this.attrs.xPath,
    };
    this.uploadableHighlightStore.push(highlight);
    this.updateHighlights();
    this.clearAttrs();
  };

  private onUnhighlightButtonClick = () => {
    if (!this.attrs) return;
    const removeIndex = this.localHighlightStore
      .get()
      .findIndex((highlightable) =>
        this.highlightEquals(highlightable, this.attrs as Highlight)
      );
    this.localHighlightStore.remove(removeIndex);
    this.updateHighlights();
  };

  private onBlacklistButtonClick = () => {
    if (!this.attrs || !this.attrs.id) return;
    void this.blacklistHighlight(this.attrs.id);
  };

  private onUpvoteButtonClick = () => {
    if (!this.attrs) return;
    void this.upvoteHighlight(this.attrs);
  };

  private createTooltip = () => {
    const tooltip = document.createElement("div");
    tooltip.classList.add("highlights-tooltip");

    const shareButton = document.createElement("button");
    shareButton.classList.add("share-button");
    shareButton.innerHTML = this.shareButtonContent;
    shareButton.onclick = this.onShareButtonClick;
    tooltip.appendChild(shareButton);

    const highlightButton = document.createElement("button");
    highlightButton.classList.add("highlight-button");
    highlightButton.innerHTML = this.highlightButtonContent;
    highlightButton.onclick = this.onHighlightButtonClick;
    tooltip.appendChild(highlightButton);

    const copyButton = document.createElement("button");
    copyButton.classList.add("copy-button");
    copyButton.innerHTML = this.copyButtonContent;
    copyButton.onclick = this.onCopyButtonClick;
    tooltip.appendChild(copyButton);

    const unhighlightButton = document.createElement("button");
    unhighlightButton.classList.add("unhighlight-button");
    unhighlightButton.innerHTML = this.unhighlightButtonContent;
    unhighlightButton.onclick = this.onUnhighlightButtonClick;
    tooltip.appendChild(unhighlightButton);

    const blacklistButton = document.createElement("button");
    blacklistButton.classList.add("blacklist-button");
    blacklistButton.innerHTML = this.blacklistButtonContent;
    blacklistButton.onclick = this.onBlacklistButtonClick;
    tooltip.appendChild(blacklistButton);

    const upvoteButton = document.createElement("button");
    upvoteButton.classList.add("upvote-button");
    upvoteButton.innerHTML = this.upvoteButtonContent;
    upvoteButton.onclick = this.onUpvoteButtonClick;
    tooltip.appendChild(upvoteButton);

    document.body.appendChild(tooltip);
    this.tooltipElem = tooltip;
  };

  private removeTooltip = () => {
    this.tooltipElem?.remove();
  };

  private showTooltip = () => {
    if (!this.attrs) return;
    [
      "local",
      "remote",
      "highlightable",
      "blacklisted",
      "upvoted",
      "uploadable",
    ].forEach((type) => {
      this.tooltipElem?.classList.remove(`type-${type}`);
    });
    this.tooltipElem?.classList.add(`type-${this.attrs.type}`);
    this.tooltipElem?.classList.add("open");
  };

  private hideTooltip = () => {
    this.tooltipElem?.classList.remove("open");
  };

  private onResize = () => {
    this.hideTooltip();
  };

  private updateTooltipPosOnHover = (elem: HTMLElement) => {
    if (!this.tooltipElem) return;
    this.tooltipElem.style.left = `${window.scrollX + elem.offsetLeft}px`;
    this.tooltipElem.style.top = `${window.scrollX + elem.offsetTop}px`;
  };

  private onMouseDown = (e: HTMLElementMouseEvent) => {
    // this.hideTooltip();
    // this.clearMouseDown();
    if (
      !this.selectableElements.includes(e.target?.tagName.toLowerCase()) ||
      this.unselectableElements.includes(e.target?.tagName.toLowerCase()) ||
      e.target.classList.contains("highlighted")
    )
      return;
    this.mouseDownTarget = e.target;
  };

  private clearAttrs = () => {
    this.attrs = null;
  };

  private onMouseUp = (e: HTMLElementMouseEvent) => {
    if (
      this.mouseDownTarget !== e.target ||
      !this.selectableElements.includes(e.target?.tagName.toLowerCase()) ||
      this.unselectableElements.includes(e.target?.tagName.toLowerCase()) ||
      e.target.classList.contains("highlighted")
    ) {
      return;
    }

    this.onSelection();
  };

  private getTargetAttributes(target: HTMLElement) {
    try {
      const startOffset = target.getAttribute("data-highlight-start-offset");
      const endOffset = target.getAttribute("data-highlight-end-offset");
      const text = target.innerText;
      const type = target.getAttribute("data-highlight-type");
      const id = target.getAttribute("data-highlight-id");
      const xPath = target.getAttribute("data-highlight-xpath");
      return {
        startOffset: Number(startOffset),
        endOffset: Number(endOffset),
        text: `${text}`,
        type: `${type}` as "local" | "remote" | "highlightable",
        xPath: xPath,
        id: id ? Number(id) : undefined,
      } as TargetAttributes;
    } catch (e) {
      console.error("Error getting target attributes", e);
    }
  }

  private onHighlightableMouseEnter = (e: HTMLElementMouseEvent) => {
    this.updateTooltipPosOnHover(e.target);
    const attrs = this.getTargetAttributes(e.target);
    if (!attrs) return;
    this.attrs = attrs;
    this.showTooltip();
  };

  private onHighlightableMouseLeave = (e: HTMLElementMouseEvent) => {
    this.hideTooltip();
  };

  private onSelection = () => {
    const selection = window.getSelection();
    this.clearHighlightables();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const range = selection.getRangeAt(0);
    const expandedRange = expandToWord(range) || range;
    const selectedHtml = expandedRange.cloneContents();

    const tpl = document.createElement("div");
    tpl.appendChild(selectedHtml.cloneNode(true));
    const selectedText = tpl.innerHTML;
    if (!selection.anchorNode?.parentElement?.innerHTML) return;
    const startOffset =
      selection.anchorNode?.parentElement?.innerHTML.indexOf(selectedText) ||
      -1;
    if (startOffset === -1) return;
    const endOffset = startOffset + selectedText.length;
    if (!selectedText) return;
    if (selectedText.length < this.minSelectionLength) return;
    const xPath = getPathTo(selection.anchorNode.parentElement);
    const newSpan = document.createElement("span");
    newSpan.classList.add("highlighted");
    newSpan.onmouseenter = (e) =>
      this.onHighlightableMouseEnter(e as HTMLElementMouseEvent);
    newSpan.onmouseleave = (e) =>
      this.onHighlightableMouseLeave(e as HTMLElementMouseEvent);
    newSpan.setAttribute("data-highlight-xpath", xPath);
    newSpan.setAttribute("data-highlight-start-offset", startOffset.toString());
    newSpan.setAttribute("data-highlight-end-offset", endOffset.toString());
    newSpan.setAttribute("data-highlight-text", selectedText);
    newSpan.setAttribute("data-highlight-type", "highlightable");
    expandedRange.surroundContents(newSpan);
  };

  private clearHighlightables = () => {
    const highlightables = document.querySelectorAll(
      ".highlighted[data-highlight-type=highlightable]"
    );
    for (const highlightable of highlightables) {
      highlightable.outerHTML = highlightable.innerHTML;
    }
  };

  public disable = () => {
    window.removeEventListener("load", this.onDomContentLoaded);
    window.removeEventListener("unload", () => {});
    document.removeEventListener("mousedown", (e) =>
      this.onMouseDown(e as HTMLElementMouseEvent)
    );
    document.removeEventListener("mouseup", (e) =>
      this.onMouseUp(e as HTMLElementMouseEvent)
    );
    window.removeEventListener("resize", this.onResize);
    this.removeTooltip();
    this.clearHighlights();
    this.clearAttrs();
    clearInterval(this.uploadTimer!);
  };
}
