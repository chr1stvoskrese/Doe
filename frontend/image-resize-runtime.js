/* Doe image resize runtime: image resize is isolated from the description divider. */
(function () {
    if (typeof document === 'undefined') return;

    const decode = (value) => {
        const ta = document.createElement('textarea');
        ta.innerHTML = value || '';
        return ta.value;
    };

    const getRender = () => document.getElementById('task-desc-render');
    const getDescription = () => document.querySelector('.description-wrapper');

    const getStoredSize = (wrapper) => {
        const md = decode(wrapper?.dataset?.md || '');
        const match = md.match(/\{\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\}\s*$/);
        if (!match) return null;
        const width = Number(match[1]);
        const height = Number(match[2]);
        return width > 0 && height > 0 ? { width, height } : null;
    };

    const maxVisibleWidth = (wrapper) => {
        const render = getRender();
        if (!render) return null;
        const rr = render.getBoundingClientRect();
        const wr = wrapper.getBoundingClientRect();
        return Math.max(1, rr.left + render.clientWidth - wr.left);
    };

    const syncImage = (wrapper) => {
        if (!wrapper || wrapper.classList.contains('is-resizing')) return;
        const saved = getStoredSize(wrapper);
        const maxWidth = maxVisibleWidth(wrapper);
        if (!saved || maxWidth == null) return;

        const width = Math.min(saved.width, maxWidth);
        const height = width < saved.width
            ? Math.max(1, width * saved.height / saved.width)
            : saved.height;

        wrapper.style.width = `${width}px`;
        wrapper.style.height = `${height}px`;
    };

    const syncAllImages = () => {
        document
            .querySelectorAll('.image-resizer-wrapper.has-custom-size')
            .forEach(syncImage);
    };

    const ensureDescriptionRoom = (description, imageWrapper, baseHeight) => {
        if (!description || !imageWrapper) return;

        const render = getRender();
        const descriptionRect = description.getBoundingClientRect();
        const imageRect = imageWrapper.getBoundingClientRect();
        const scrollTop = render ? render.scrollTop : 0;
        const required = Math.max(
            baseHeight || 0,
            imageRect.bottom - descriptionRect.top + scrollTop + 18
        );

        if (required > description.getBoundingClientRect().height + 0.5) {
            description.style.height = `${required}px`;
        }
    };

    const restoreDescriptionHeight = (description, hadExplicitHeight, baseHeight) => {
        if (!description) return;
        if (hadExplicitHeight) {
            description.style.height = `${Math.max(0, baseHeight || 0)}px`;
        } else {
            // No inline height existed before the drag: let the normal layout
            // determine the final height again instead of persisting a temporary expansion.
            description.style.height = '';
        }
    };

    const saveImageSize = async (wrapper, render, desiredWidth, desiredHeight) => {
        const originalMd = decode(wrapper.dataset.md || '');
        const match = originalMd.match(/!\[([^\]]*)\]\(([^)]+)\)(?:\{[^}]+\})?/);
        if (!match || typeof cmEditor === 'undefined' || !cmEditor) return;

        const newMd = originalMd.replace(
            match[0],
            `![${match[1]}](${match[2]}){${Math.round(desiredWidth)}, ${Math.round(desiredHeight)}}`
        );

        const text = cmEditor.getValue();
        const sameWrappers = Array.from(render.querySelectorAll('.image-resizer-wrapper'))
            .filter((candidate) => decode(candidate.dataset.md || '') === originalMd);
        const occurrence = sameWrappers.indexOf(wrapper);

        let index = -1;
        let searchFrom = 0;
        const targetOccurrence = occurrence >= 0 ? occurrence : 0;
        for (let i = 0; i <= targetOccurrence; i++) {
            index = text.indexOf(originalMd, searchFrom);
            if (index === -1) break;
            searchFrom = index + originalMd.length;
        }
        if (index === -1) return;

        const from = cmEditor.posFromIndex(index);
        const to = cmEditor.posFromIndex(index + originalMd.length);
        cmEditor.replaceRange(newMd, from, to);
        wrapper.dataset.md = typeof escapeHtml === 'function' ? escapeHtml(newMd) : newMd;
        if (typeof lastSavedValue !== 'undefined') lastSavedValue = cmEditor.getValue();

        const taskModal = document.getElementById('task-modal');
        const taskId = taskModal?.dataset.taskId;
        if (taskId && typeof updateTask === 'function') {
            await updateTask(taskId, { description: cmEditor.getValue() });
        }
        if (typeof bumpModalUpdatedDate === 'function') bumpModalUpdatedDate();
    };

    // Block the description divider when the pointer starts on an image.
    // This capture listener runs before app.js installs its divider listener.
    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (event.target.closest?.('.image-resizer-wrapper')) {
            event.stopImmediatePropagation();
        }
    }, true);

    const install = () => {
        const render = getRender();
        if (!render || render.__doeImageResizeInstalled) return;
        render.__doeImageResizeInstalled = true;

        const mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches?.('.image-resizer-wrapper.has-custom-size')) syncImage(node);
                    node.querySelectorAll?.('.image-resizer-wrapper.has-custom-size').forEach(syncImage);
                }
            }
        });
        mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(syncAllImages);
            observer.observe(render);
            render.__doeImageResizeObserver = observer;
        }
        window.addEventListener('resize', syncAllImages, { passive: true });
        syncAllImages();

        document.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            const handle = event.target.closest?.('.image-resize-handle');
            if (!handle) return;

            const wrapper = handle.closest('.image-resizer-wrapper');
            const description = getDescription();
            if (!wrapper || !render || wrapper.classList.contains('is-resizing')) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const saved = getStoredSize(wrapper);
            const rect = wrapper.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startWidth = rect.width;
            const startHeight = rect.height;
            const savedWidth = saved?.width || startWidth;
            const savedHeight = saved?.height || startHeight;
            const ratio = savedWidth / Math.max(1, savedHeight);
            const hadExplicitHeight = !!description?.style.height.trim();
            const baseHeight = hadExplicitHeight
                ? (parseFloat(description.style.height) || description.getBoundingClientRect().height)
                : null;

            let desiredWidth = startWidth;
            let desiredHeight = startHeight;
            let finished = false;
            const minSize = 50;

            wrapper.classList.add('is-resizing', 'has-custom-size');
            document.body.style.userSelect = 'none';

            const onMove = (moveEvent) => {
                if (finished) return;

                desiredWidth = Math.max(minSize, startWidth + moveEvent.clientX - startX);
                if (moveEvent.shiftKey) {
                    desiredHeight = Math.max(minSize, startHeight + moveEvent.clientY - startY);
                } else {
                    desiredHeight = Math.max(1, desiredWidth / ratio);
                }

                const availableWidth = maxVisibleWidth(wrapper) ?? desiredWidth;
                const visibleWidth = Math.min(desiredWidth, availableWidth);
                const visibleHeight = moveEvent.shiftKey
                    ? (visibleWidth < desiredWidth
                        ? Math.max(1, visibleWidth * desiredHeight / desiredWidth)
                        : desiredHeight)
                    : Math.max(1, visibleWidth / ratio);

                wrapper.style.width = `${visibleWidth}px`;
                wrapper.style.height = `${visibleHeight}px`;
                ensureDescriptionRoom(description, wrapper, baseHeight);
            };

            const finish = async () => {
                if (finished) return;
                finished = true;
                window.removeEventListener('blur', finish);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', finish);
                document.body.style.userSelect = '';

                try {
                    await saveImageSize(wrapper, render, desiredWidth, desiredHeight);
                } catch (error) {
                    console.error('[Image resize] save failed', error);
                }

                restoreDescriptionHeight(description, hadExplicitHeight, baseHeight);
                wrapper.classList.remove('is-resizing');
                wrapper.dataset.justResized = '1';
                setTimeout(() => delete wrapper.dataset.justResized, 300);
                syncImage(wrapper);
            };

            window.addEventListener('blur', finish, { once: true });
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', finish, { once: true });
            onMove(event);
        }, true);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
})();
