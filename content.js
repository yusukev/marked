(() => {
  "use strict";

  const COLORS = {
    blue: "#a8d1ff",
    red: "#ffb3b3",
    green: "#b3ffb8",
  };

  const STORAGE_KEY = "marked_highlights_" + location.href;

  // ── Toolbar ──

  let toolbar = null;
  let savedRange = null;

  function removeToolbar() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
  }

  function showToolbar(x, y) {
    removeToolbar();
    toolbar = document.createElement("div");
    toolbar.id = "marked-toolbar";

    for (const [name, color] of Object.entries(COLORS)) {
      const btn = document.createElement("button");
      btn.className = "marked-color-btn";
      btn.style.background = color;
      btn.title = name;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyHighlight(color);
      });
      toolbar.appendChild(btn);
    }

    document.body.appendChild(toolbar);

    // Position so it doesn't overflow viewport
    const rect = toolbar.getBoundingClientRect();
    let left = x - rect.width / 2;
    let top = y - rect.height - 8;
    left = Math.max(4, Math.min(left, window.innerWidth - rect.width - 4));
    if (top < 4) top = y + 20;

    toolbar.style.left = left + window.scrollX + "px";
    toolbar.style.top = top + window.scrollY + "px";
  }

  // ── Highlighting ──

  function applyHighlight(color) {
    if (!savedRange) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);

    wrapRange(savedRange, color);
    sel.removeAllRanges();
    removeToolbar();
    savedRange = null;
    saveHighlights();
  }

  function wrapRange(range, color) {
    // For ranges spanning multiple nodes, we need to walk through text nodes
    const nodes = getTextNodesIn(range);
    for (const textNode of nodes) {
      const start = textNode === range.startContainer ? range.startOffset : 0;
      const end =
        textNode === range.endContainer ? range.endOffset : textNode.length;

      if (start === end) continue;

      const highlightPart = textNode.splitText(start);
      const after = highlightPart.splitText(end - start);

      const mark = document.createElement("mark");
      mark.setAttribute("data-marked", "true");
      mark.style.backgroundColor = color;
      highlightPart.parentNode.replaceChild(mark, highlightPart);
      mark.appendChild(highlightPart);

      // Update range references since we split nodes
      if (textNode === range.startContainer) {
        range.setStart(after, 0);
      }
    }
  }

  function getTextNodesIn(range) {
    const nodes = [];
    const walker = document.createTreeWalker(
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_REJECT;
        },
      }
    );
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  // ── Persistence ──

  function saveHighlights() {
    const marks = document.querySelectorAll("mark[data-marked]");
    const data = [];

    for (const mark of marks) {
      const text = mark.textContent;
      const color = mark.style.backgroundColor;

      // Build an XPath-like locator: store surrounding context for matching
      const parent = mark.parentElement;
      const parentText = parent ? parent.textContent : "";
      const idx = parentText.indexOf(text);

      data.push({
        text,
        color,
        // Store context around the highlight for robust re-matching
        contextBefore: parentText.substring(Math.max(0, idx - 30), idx),
        contextAfter: parentText.substring(
          idx + text.length,
          idx + text.length + 30
        ),
      });
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }

  function restoreHighlights() {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return;
    }
    if (!Array.isArray(data) || data.length === 0) return;

    for (const entry of data) {
      findAndHighlight(entry);
    }
  }

  function findAndHighlight({ text, color, contextBefore, contextAfter }) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.textContent.indexOf(text);
      if (idx === -1) continue;

      // Verify context if available
      if (contextBefore || contextAfter) {
        const parentText = node.parentElement
          ? node.parentElement.textContent
          : "";
        const parentIdx = parentText.indexOf(text);
        if (parentIdx === -1) continue;

        const before = parentText.substring(
          Math.max(0, parentIdx - 30),
          parentIdx
        );
        const after = parentText.substring(
          parentIdx + text.length,
          parentIdx + text.length + 30
        );

        // Fuzzy match: at least one context side should match
        if (
          contextBefore &&
          contextAfter &&
          before !== contextBefore &&
          after !== contextAfter
        ) {
          continue;
        }
      }

      // Already highlighted — skip
      if (
        node.parentElement &&
        node.parentElement.tagName === "MARK" &&
        node.parentElement.hasAttribute("data-marked")
      ) {
        continue;
      }

      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);
      wrapRange(range, color);
      break; // Only restore first match per entry
    }
  }

  // ── Event listeners ──

  document.addEventListener("mouseup", (e) => {
    // Ignore clicks on our own toolbar
    if (toolbar && toolbar.contains(e.target)) return;

    // Small delay to let browser finalize selection
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.toString().trim() === "") {
        removeToolbar();
        savedRange = null;
        return;
      }

      savedRange = sel.getRangeAt(0).cloneRange();
      const rect = savedRange.getBoundingClientRect();
      showToolbar(rect.left + rect.width / 2, rect.top);
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (toolbar && !toolbar.contains(e.target)) {
      removeToolbar();
      savedRange = null;
    }
  });

  // ── Init ──

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", restoreHighlights);
  } else {
    restoreHighlights();
  }
})();
