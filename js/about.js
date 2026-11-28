(function () {
  'use strict';

  var activeModal = null;
  var returnFocus = null;

  // 打开弹窗时把背景整体 inert，读屏与键盘 Tab 才不会跑到弹窗外面。
  // 浏览器不支持 inert 时该属性被忽略，原有的焦点陷阱仍然兜底。
  function setBackgroundInert(state) {
    Array.prototype.forEach.call(document.body.children, function (child) {
      if (child.nodeType !== 1 || child.tagName === 'SCRIPT' || child.tagName === 'STYLE') return;
      if (state) {
        if (child.contains(activeModal)) return;
        if (child.hasAttribute('data-modal-inert')) return;
        child.setAttribute('data-modal-inert', '');
        child.setAttribute('inert', '');
      } else if (child.hasAttribute('data-modal-inert')) {
        child.removeAttribute('data-modal-inert');
        child.removeAttribute('inert');
      }
    });
  }

  function focusableElements(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (element) {
      return !element.hasAttribute('hidden');
    });
  }

  function openModal(modal, trigger) {
    if (!modal) return;
    activeModal = modal;
    returnFocus = trigger || document.activeElement;
    modal.hidden = false;
    modal.classList.add('active');
    document.body.classList.add('modal-open');
    setBackgroundInert(true);

    var focusable = focusableElements(modal);
    if (focusable.length) focusable[0].focus();
  }

  function closeModal() {
    if (!activeModal) return;
    setBackgroundInert(false);
    activeModal.classList.remove('active');
    activeModal.hidden = true;
    document.body.classList.remove('modal-open');

    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    activeModal = null;
    returnFocus = null;
  }

  document.querySelectorAll('[data-modal-target]').forEach(function (trigger) {
    var modal = document.getElementById(trigger.getAttribute('data-modal-target'));
    if (!modal) return;

    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', modal.id);
    trigger.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openModal(modal, trigger);
    });
  });

  document.querySelectorAll('[data-modal-close]').forEach(function (button) {
    button.addEventListener('click', closeModal);
  });

  document.querySelectorAll('.modal-overlay').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal();
    });
  });

  document.addEventListener('keydown', function (event) {
    if (!activeModal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;

    var focusable = focusableElements(activeModal);
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}());
