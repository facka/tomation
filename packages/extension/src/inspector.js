// inspector.js — content script for DOM element inspection
// Injected on-demand when the user activates inspect mode.
// Self-initializes immediately on injection; stays active for multi-select.
// Cleans up only on Escape key or REMOVE_INSPECTOR message from panel.
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
(function () {
  var api = typeof browser !== 'undefined' ? browser : chrome;
  var overlay = null;

  /**
   * Create the highlight overlay element.
   * Positioned absolute, colored border, high z-index, pointer-events:none.
   * @returns {HTMLDivElement}
   */
  function createOverlay() {
    var el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.border = '2px solid #4A90D9';
    el.style.backgroundColor = 'rgba(74, 144, 217, 0.1)';
    el.style.zIndex = '2147483647';
    el.style.pointerEvents = 'none';
    el.style.transition = 'top 0.05s, left 0.05s, width 0.05s, height 0.05s';
    el.setAttribute('data-tomation-inspector', 'true');
    document.body.appendChild(el);
    return el;
  }

  /**
   * Position the overlay to match the given element's bounding rect.
   * @param {Element} element
   */
  function positionOverlay(element) {
    if (!overlay || !element || !element.getBoundingClientRect) {
      return;
    }
    var rect = element.getBoundingClientRect();
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    overlay.style.top = (rect.top + scrollY) + 'px';
    overlay.style.left = (rect.left + scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  /**
   * Remove the overlay element from the DOM.
   */
  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
  }

  /**
   * Send a message to the background script via the browser messaging API.
   * @param {object} msg
   */
  function sendMessage(msg) {
    api.runtime.sendMessage(msg);
  }

  /**
   * Remove all event listeners, message listener, and the overlay. Self-cleanup.
   */
  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    api.runtime.onMessage.removeListener(onMessage);
    removeOverlay();
  }

  /**
   * Handle mousemove — position overlay on hovered element.
   * @param {MouseEvent} e
   */
  function onMouseMove(e) {
    positionOverlay(e.target);
  }

  /**
   * Handle click — capture node data, send NODE_SELECTED, stay active for multi-select.
   * @param {MouseEvent} e
   */
  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    var el = e.target;
    var attributes = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      attributes[attr.name] = attr.value;
    }

    var nodeData = {
      type: 'NODE_SELECTED',
      tagName: el.tagName,
      attributes: attributes,
      outerHTML: el.outerHTML,
      childElementCount: el.childElementCount
    };

    sendMessage(nodeData);
    // No cleanup() call — stay active for multi-select
  }

  /**
   * Handle keydown — if Escape, cancel inspection.
   * @param {KeyboardEvent} e
   */
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      sendMessage({ type: 'INSPECT_CANCELLED' });
      cleanup();
    }
  }

  /**
   * Handle messages from the panel (via background script).
   * REMOVE_INSPECTOR triggers cleanup to deactivate the inspector.
   * @param {object} message
   */
  function onMessage(message) {
    if (message && message.type === 'REMOVE_INSPECTOR') {
      cleanup();
    }
  }

  /**
   * Handle visibility change — cleanup when user leaves the tab.
   */
  function onVisibilityChange() {
    if (document.hidden) {
      sendMessage({ type: 'INSPECT_CANCELLED' });
      cleanup();
    }
  }

  // Self-initialize on injection
  overlay = createOverlay();
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('visibilitychange', onVisibilityChange);
  api.runtime.onMessage.addListener(onMessage);

  // Expose cleanup globally so background script can call it via REMOVE_INSPECTOR
  window.__tomationInspectorCleanup = cleanup;
})();
