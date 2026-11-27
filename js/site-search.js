/* global CONFIG, LocalSearch */
'use strict';

(() => {
  const dialog = document.querySelector('#site-search');
  if (!dialog) return;

  const input = dialog.querySelector('.search-input');
  const full = dialog.querySelector('.site-search__full');
  const retry = dialog.querySelector('.site-search__retry');
  const status = dialog.querySelector('.site-search__status');
  const results = dialog.querySelector('.site-search__results');
  const english = document.documentElement.lang === 'en';
  const previewPath = dialog.dataset.preview;
  const selectedPath = () => full.checked ? CONFIG.path : previewPath;
  const indexes = new Map();
  const escapeText = document.createElement('span');
  let opener;

  function textForMarkup(text) {
    escapeText.textContent = text;
    return escapeText.innerHTML;
  }

  function render() {
    const state = indexes.get(selectedPath());
    results.replaceChildren();
    retry.hidden = !state?.error;
    if (state?.error) {
      status.textContent = english ? 'Could not load the search index.' : '搜索索引加载失败，请重试。';
      return;
    }
    if (!state?.search) {
      status.textContent = english ? 'Loading search index…' : '正在加载搜索索引…';
      return;
    }

    const query = input.value.trim().toLowerCase();
    const keywords = query.split(/[-\s]+/).filter(Boolean);
    if (!keywords.length) {
      status.textContent = full.checked
        ? (english ? 'Enter a keyword to search article text.' : '输入关键词搜索文章正文。')
        : (english ? 'Search titles, summaries, and topics.' : '输入技术名词、故障现象或文章标题。');
      return;
    }

    const matches = state.search.getResultItems(keywords);
    if (!matches.length) {
      status.textContent = full.checked
        ? (english ? 'No results. Try another keyword.' : '没有匹配的文章，试试其他关键词。')
        : (english ? 'No results. Try searching article text.' : '没有匹配的文章，可以勾选「搜索正文」扩大范围。');
      return;
    }

    matches.sort((a, b) => b.includedCount - a.includedCount || b.hitCount - a.hitCount || b.id - a.id);
    status.textContent = english ? `${matches.length} results` : `找到 ${matches.length} 篇文章`;
    const list = document.createElement('ul');
    list.className = 'search-result-list';
    list.innerHTML = matches.map(match => match.item).join('');
    results.append(list);
  }

  async function loadIndex() {
    const path = selectedPath();
    if (indexes.has(path)) {
      render();
      return;
    }
    const state = {};
    indexes.set(path, state);
    render();
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Search index: ${response.status}`);
      const records = await response.json();
      const search = new LocalSearch({ top_n_per_article: CONFIG.localsearch.top_n_per_article, unescape: true });
      // Reuse NexT's matching and snippets; load each index separately so the
      // full text remains available without fetching it for short searches.
      search.datas = records.flatMap(({ title, url, content }) => {
        const target = new URL(url, location.origin);
        if (!title || target.origin !== location.origin) return [];
        return [{ title: textForMarkup(title), url: target.href, content: textForMarkup(content || '') }];
      });
      state.search = search;
    } catch (error) {
      state.error = error;
    }
    if (dialog.open && path === selectedPath()) render();
  }

  function open(trigger) {
    if (dialog.open) return;
    opener = trigger;
    dialog.showModal();
    input.focus();
    loadIndex();
  }

  document.querySelectorAll('[aria-controls="site-search"]').forEach(button => {
    button.addEventListener('click', () => open(button));
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
    event.preventDefault();
    open(document.activeElement);
  });
  dialog.addEventListener('close', () => opener?.focus());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    dialog.close();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const { top, right, bottom, left } = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
  });
  input.addEventListener('input', render);
  full.addEventListener('change', loadIndex);
  retry.addEventListener('click', () => {
    indexes.delete(selectedPath());
    input.focus();
    loadIndex();
  });

  if (typeof LocalSearch === 'function') new LocalSearch().highlightSearchWords(document.querySelector('.post-body'));
})();
