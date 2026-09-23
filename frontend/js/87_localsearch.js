function initLocalSearchLogic() {
    const widget = document.getElementById('local-search-widget');
    const input = document.getElementById('local-search-input');
    const countEl = document.getElementById('local-search-count');
    const btnNext = document.getElementById('local-search-next');
    const btnPrev = document.getElementById('local-search-prev');
    const btnClose = document.getElementById('local-search-close');
    const renderDiv = document.getElementById('task-desc-render');
    const scrollParent = document.querySelector('.task-detail-body');

    let matchRanges = [];
    let cachedTextNodes = null;

    let cmMatches = [];
    let cmMarkers = [];
    let cmActiveMarker = null;

    let currentMatchIndex = -1;
    let searchId = 0;
    let searchDebounce = null;

    const isEditMode = () => {
        return !!(cmEditor && cmEditor.getWrapperElement().style.display !== 'none');
    };

    window.openLocalSearch = () => {
        widget.classList.add('show');
        setTimeout(() => { input.focus(); input.select(); }, 50);

        if (isEditMode()) {
            cachedTextNodes = null;
        } else {
            cachedTextNodes = [];
            const walker = document.createTreeWalker(renderDiv, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                const text = node.nodeValue.toLowerCase();
                if (text.trim()) {
                    cachedTextNodes.push({ node, text });
                }
            }
        }

        if (input.value.trim()) performLocalSearch(input.value);
    };

    window.closeLocalSearch = () => {
        widget.classList.remove('show');
        clearLocalSearch();
        input.value = '';
        cachedTextNodes = null;
        searchId++;
        if (isEditMode() && cmEditor) {
            cmEditor.focus();
        }
    };

    function clearLocalSearch() {
        if (CSS.highlights) {
            CSS.highlights.clear();
        }
        matchRanges = [];

        if (cmEditor) {
            cmEditor.operation(() => {
                cmMarkers.forEach(m => m.clear());
                if (cmActiveMarker) {
                    cmActiveMarker.clear();
                    cmActiveMarker = null;
                }
            });
        }
        cmMatches = [];
        cmMarkers = [];

        currentMatchIndex = -1;
        countEl.textContent = '0/0';
    }

    function performLocalSearch(query) {
        clearLocalSearch();
        const textLower = query.trim().toLowerCase();
        if (!textLower) return;

        const currentSearchId = ++searchId;

        if (isEditMode()) {
            cmEditor.operation(() => {
                const lineCount = cmEditor.lineCount();
                for (let line = 0; line < lineCount; line++) {
                    const text = cmEditor.getLine(line).toLowerCase();
                    let pos = 0;
                    while ((pos = text.indexOf(textLower, pos)) !== -1) {
                        const from = { line, ch: pos };
                        const to = { line, ch: pos + textLower.length };
                        cmMatches.push({ from, to });

                        const marker = cmEditor.markText(from, to, { className: 'local-search-highlight' });
                        cmMarkers.push(marker);

                        pos += textLower.length;
                    }
                }
            });

            if (cmMatches.length > 0) {
                currentMatchIndex = 0;
                updateLocalSearchUI();
            } else {
                countEl.textContent = '0/0';
            }
        } else {
            if (!renderDiv.textContent.toLowerCase().includes(textLower)) {
                countEl.textContent = '0/0';
                return;
            }

            function searchNextChunk(startIndex) {
                if (currentSearchId !== searchId) return;

                const startTime = performance.now();
                let i = startIndex;

                for (; i < cachedTextNodes.length; i++) {
                    if (performance.now() - startTime > 12) break;

                    const item = cachedTextNodes[i];
                    if (!item.text.includes(textLower)) continue;

                    let pos = 0;
                    while ((pos = item.text.indexOf(textLower, pos)) !== -1) {
                        const range = new Range();
                        range.setStart(item.node, pos);
                        range.setEnd(item.node, pos + query.length);
                        matchRanges.push(range);
                        pos += query.length;
                    }

                    if (matchRanges.length >= 10000) break;
                }

                if (i < cachedTextNodes.length && matchRanges.length < 10000) {
                    requestAnimationFrame(() => searchNextChunk(i));
                } else {
                    if (matchRanges.length > 0) {
                        currentMatchIndex = 0;
                        if (CSS.highlights) {
                            CSS.highlights.set('local-search', new Highlight(...matchRanges));
                        }
                        updateLocalSearchUI();

                        if (matchRanges.length >= 10000) {
                            countEl.textContent = `1/10000+`;
                        }
                    } else {
                        countEl.textContent = '0/0';
                    }
                }
            }
            requestAnimationFrame(() => searchNextChunk(0));
        }
    }

    function updateLocalSearchUI() {
        if (isEditMode()) {
            if (cmActiveMarker) {
                cmActiveMarker.clear();
                cmActiveMarker = null;
            }
            if (cmMatches.length === 0 || currentMatchIndex < 0) return;

            const activeMatch = cmMatches[currentMatchIndex];
            cmActiveMarker = cmEditor.markText(activeMatch.from, activeMatch.to, { className: 'local-search-highlight active' });

            cmEditor.scrollIntoView(activeMatch.from, 150);
            countEl.textContent = `${currentMatchIndex + 1}/${cmMatches.length}`;
        } else {
            if (matchRanges.length === 0 || currentMatchIndex < 0) return;

            const activeRange = matchRanges[currentMatchIndex];

            if (CSS.highlights) {
                const highlightActive = new Highlight(activeRange);
                CSS.highlights.set('local-search-active', highlightActive);
            }

            let block = activeRange.startContainer.parentElement;
            while (block && block !== renderDiv) {
                if (block.classList.contains('is-hidden-by-fold')) {
                    let prev = block.previousElementSibling;
                    while (prev) {
                        if (prev.classList.contains('foldable-heading') && prev.classList.contains('is-folded')) {
                            prev.click();
                        }
                        prev = prev.previousElementSibling;
                    }
                }
                block = block.parentElement;
            }

            requestAnimationFrame(() => {
                const innerScroll = renderDiv;
                const outerScroll = scrollParent;
                const descWrapper = document.querySelector('.description-wrapper');

                let rangeRect = activeRange.getBoundingClientRect();

                if (rangeRect.top === 0 || rangeRect.height === 0) {
                    const parentEl = activeRange.startContainer.parentElement;
                    if (parentEl) {
                        rangeRect = parentEl.getBoundingClientRect();
                    }
                }

                if (rangeRect.top === 0) return;

                if (innerScroll) {
                    const innerRect = innerScroll.getBoundingClientRect();
                    const relativeTop = rangeRect.top - innerRect.top + innerScroll.scrollTop;
                    innerScroll.scrollTo({
                        top: relativeTop - (innerRect.height / 2),
                        behavior: 'auto'
                    });
                }

                if (outerScroll && descWrapper) {
                    const wrapperRect = descWrapper.getBoundingClientRect();
                    const outerRect = outerScroll.getBoundingClientRect();

                    if (wrapperRect.top < outerRect.top + 16 || wrapperRect.bottom > outerRect.bottom - 16) {
                        const relativeWrapperTop = wrapperRect.top - outerRect.top + outerScroll.scrollTop;
                        outerScroll.scrollTo({
                            top: relativeWrapperTop - 16,
                            behavior: 'auto'
                        });
                    }
                }
            });

            if (matchRanges.length < 10000) {
                countEl.textContent = `${currentMatchIndex + 1}/${matchRanges.length}`;
            }
        }
    }

    function nextMatch() {
        const length = isEditMode() ? cmMatches.length : matchRanges.length;
        if (length === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % length;
        updateLocalSearchUI();
    }

    function prevMatch() {
        const length = isEditMode() ? cmMatches.length : matchRanges.length;
        if (length === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + length) % length;
        updateLocalSearchUI();
    }

    input.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => performLocalSearch(input.value), 120);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prevMatch() : nextMatch(); }
        if (e.key === 'Escape') { e.preventDefault(); window.closeLocalSearch(); }
    });

    btnNext.addEventListener('click', nextMatch);
    btnPrev.addEventListener('click', prevMatch);
    btnClose.addEventListener('click', window.closeLocalSearch);
}

initTaskDescriptionLogic();
initLocalSearchLogic();

