/* global NexT */
'use strict';

(() => {
  const navigation = document.querySelector('.site-nav-toggle .toggle');
  document.addEventListener('DOMContentLoaded', () => {
    navigation?.addEventListener('click', () => {
      navigation.setAttribute('aria-expanded', String(document.body.classList.contains('site-nav-on')));
    });
  });

  if (typeof NexT === 'undefined' || !NexT.utils) return;
  const english = document.documentElement.lang === 'en';
  let status;

  // NexT still locates the code and initializes each block. Supply a native
  // button so the same copy action works through touch and keyboard input.
  NexT.utils.registerCopyButton = (target, block, code) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.setAttribute('aria-label', english ? 'Copy code' : '复制代码');
    button.title = button.getAttribute('aria-label');
    const icon = document.createElement('i');
    icon.className = 'fa fa-copy fa-fw';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    target.append(button);

    if (!status) {
      status = document.createElement('span');
      status.className = 'site-copy-status';
      status.setAttribute('role', 'status');
      document.body.append(status);
    }
    let reset;
    button.addEventListener('click', async () => {
      const text = code || (block.querySelector('.code, code') || block).innerText;
      try {
        await navigator.clipboard.writeText(text);
        icon.className = 'fa fa-check-circle fa-fw';
        status.textContent = english ? 'Code copied.' : '已复制代码。';
      } catch {
        icon.className = 'fa fa-times-circle fa-fw';
        status.textContent = english ? 'Could not copy code.' : '复制失败，请手动选择代码。';
      }
      clearTimeout(reset);
      reset = setTimeout(() => { icon.className = 'fa fa-copy fa-fw'; }, 1200);
    });
  };
})();
