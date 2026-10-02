(() => {
  const root          = document.documentElement;
  const form          = document.getElementById('reviewForm');
  const textarea      = document.getElementById('reviewText');
  const charCount     = document.getElementById('charCount');
  const exampleButton = document.getElementById('exampleButton');
  const clearButton   = document.getElementById('clearButton');
  const themeToggle   = document.querySelector('.theme-toggle');
  const resultCard    = document.getElementById('resultCard');
  const serverSentiment = document.getElementById('serverSentiment')?.value.trim();
  const serverScore     = document.getElementById('serverScore')?.value.trim();

  // ── Examples ─────────────────────────────
  const examples = [
    'A beautifully observed film with a real emotional pulse. The performances are nuanced, the pacing is confident, and the final act stayed with me long after the credits.',
    'A complete disappointment. The story drags, the dialogue feels forced, and even the talented cast cannot rescue a film that never finds its rhythm.',
    'Inventive, warm, and surprisingly funny. It is not perfect, but the world feels lived-in and the small details make the whole thing sing.'
  ];

  // ── Theme ─────────────────────────────────
  const savedTheme = localStorage.getItem('sentiai-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;

  function updateThemeIcon() {
    const isLight = root.dataset.theme === 'light';
    document.querySelector('.sun-icon').style.display  = isLight ? 'none'  : 'block';
    document.querySelector('.moon-icon').style.display = isLight ? 'block' : 'none';
    themeToggle?.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  }
  updateThemeIcon();

  themeToggle?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('sentiai-theme', root.dataset.theme);
    updateThemeIcon();
  });

  // ── Char counter ──────────────────────────
  function updateCount() { if (charCount && textarea) charCount.textContent = textarea.value.length; }
  textarea?.addEventListener('input', updateCount);
  updateCount();

  // ── Toolbar buttons ───────────────────────
  exampleButton?.addEventListener('click', () => {
    textarea.value = examples[Math.floor(Math.random() * examples.length)];
    updateCount();
    textarea.focus();
  });

  clearButton?.addEventListener('click', () => {
    textarea.value = '';
    updateCount();
    textarea.focus();
  });

  // ── Single-review form submit ─────────────
  form?.addEventListener('submit', (event) => {
    if (!textarea.value.trim()) {
      event.preventDefault();
      textarea.focus();
      textarea.closest('.input-panel').animate(
        [{ boxShadow: '0 0 0 2px var(--amber)' }, { boxShadow: 'none' }],
        { duration: 500 }
      );
      return;
    }
    document.getElementById('analyzeButton')?.classList.add('is-loading');
  });

  // ── Render single-review result ───────────
  function renderResult(sentiment, score) {
    if (!sentiment || score === '') return;
    const numericScore = Math.max(0, Math.min(100, parseFloat(score)));
    if (isNaN(numericScore)) return;

    const positive = /positive/i.test(sentiment) || numericScore > 50;

    const label       = document.getElementById('resultLabel');
    const verdict     = document.getElementById('resultVerdict');
    const confidence  = document.getElementById('resultConfidence');
    const emoji       = document.getElementById('resultEmoji');
    const value       = document.getElementById('confidenceValue');
    const fill        = document.getElementById('confidenceFill');
    const tone        = document.getElementById('toneValue');
    const keywords    = document.getElementById('keywordsValue');
    const objectivity = document.getElementById('objectivityValue');
    const rating      = document.getElementById('ratingValue');

    // Colours from new palette
    const colPos = 'var(--fill-pos)';   // cognac amber
    const colNeg = 'var(--fill-neg)';   // deep amber-dark

    label.textContent       = positive ? 'POSITIVE SIGNAL DETECTED' : 'NEGATIVE SIGNAL DETECTED';
    verdict.textContent     = positive ? 'Overwhelmingly positive'  : 'Predominantly negative';
    confidence.textContent  = `${numericScore.toFixed(2)}% model confidence`;
    emoji.textContent       = positive ? '✦' : '×';
    value.textContent       = `${numericScore.toFixed(2)}%`;
    fill.style.width        = `${numericScore}%`;
    fill.style.background   = positive ? colPos : colNeg;

    label.style.color       = positive ? colPos : colNeg;
    emoji.style.color       = positive ? colPos : colNeg;
    emoji.style.borderColor = positive
      ? 'color-mix(in srgb, var(--fill-pos) 40%, transparent)'
      : 'color-mix(in srgb, var(--fill-neg) 40%, transparent)';
    value.style.color       = positive ? colPos : colNeg;

    tone.textContent        = positive ? 'Enthusiastic'            : 'Critical';
    keywords.textContent    = positive ? 'Cinematic · Assured'     : 'Uneven · Disappointing';
    objectivity.textContent = `Subjective ${Math.round(numericScore)}%`;

    const stars = numericScore > 80 ? 5 : numericScore > 60 ? 4 : numericScore > 40 ? 3 : numericScore > 20 ? 2 : 1;
    rating.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);

    resultCard.classList.add('is-visible');
    setTimeout(() => resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  }

  renderResult(serverSentiment, serverScore);

  // ── Bulk upload dropzone ──────────────────
  const dropzone       = document.getElementById('dropzone');
  const fileInput      = document.getElementById('fileInput');
  const browseButton   = document.getElementById('browseButton');
  const removeFile     = document.getElementById('removeFile');
  const dropzoneContent  = document.getElementById('dropzoneContent');
  const dropzonePreview  = document.getElementById('dropzonePreview');
  const fileChipName   = document.getElementById('fileChipName');
  const fileChipSize   = document.getElementById('fileChipSize');
  const bulkButton     = document.getElementById('bulkButton');

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function showFilePreview(file) {
    if (!dropzoneContent || !dropzonePreview) return;
    fileChipName.textContent = file.name;
    fileChipSize.textContent = formatBytes(file.size);
    dropzoneContent.style.display  = 'none';
    dropzonePreview.style.display  = 'block';
    if (bulkButton) bulkButton.disabled = false;
  }

  function clearFilePreview() {
    if (!dropzoneContent || !dropzonePreview) return;
    dropzoneContent.style.display  = 'block';
    dropzonePreview.style.display  = 'none';
    if (fileInput) fileInput.value = '';
    if (bulkButton) bulkButton.disabled = true;
  }

  fileInput?.addEventListener('change', () => {
    if (fileInput.files.length > 0) showFilePreview(fileInput.files[0]);
  });

  browseButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  removeFile?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFilePreview();
  });

  // Drag-and-drop
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) {
      // Transfer to the real input via DataTransfer
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      showFilePreview(file);
    }
  });

  // Keyboard accessibility on dropzone div
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });

  // Bulk form submit — show loading state
  document.getElementById('bulkForm')?.addEventListener('submit', () => {
    bulkButton?.classList.add('is-loading');
    if (bulkButton) bulkButton.disabled = true;
  });

})();
