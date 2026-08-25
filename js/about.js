(function () {
  'use strict';

  var activeModal = null;
  var returnFocus = null;

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

    var focusable = focusableElements(modal);
    if (focusable.length) focusable[0].focus();
  }

  function closeModal() {
    if (!activeModal) return;
    activeModal.classList.remove('active');
    activeModal.hidden = true;
    document.body.classList.remove('modal-open');

    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    activeModal = null;
    returnFocus = null;
  }

  document.querySelectorAll('[data-modal-target]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      openModal(document.getElementById(trigger.getAttribute('data-modal-target')), trigger);
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
