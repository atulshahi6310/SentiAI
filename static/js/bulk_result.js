/* ==========================================
   SentiAI — Bulk Result Page JS
   Renders donut + bar charts via Chart.js
   Handles table filtering + search
   ========================================== */
(() => {
  // ── Theme ────────────────────────────────
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('sentiai-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;

  const themeToggle = document.querySelector('.theme-toggle');
  function updateThemeIcon() {
    const isLight = root.dataset.theme === 'light';
    const sun  = document.querySelector('.sun-icon');
    const moon = document.querySelector('.moon-icon');
    if (sun)  sun.style.display  = isLight ? 'none'  : 'block';
    if (moon) moon.style.display = isLight ? 'block' : 'none';
    themeToggle?.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  }
  updateThemeIcon();
  themeToggle?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('sentiai-theme', root.dataset.theme);
    updateThemeIcon();
    redrawCharts(); // re-render charts for new theme colours
  });

  // ── Palette helpers ───────────────────────
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function chartColors() {
    return {
      pos:    cssVar('--fill-pos')   || '#a85c28',
      neg:    cssVar('--fill-neg')   || '#7a3e16',
      ink:    cssVar('--ink-muted')  || '#8c7f74',
      line:   cssVar('--line')       || 'rgba(60,45,35,0.13)',
      surface:cssVar('--surface-2')  || '#ede6da',
    };
  }

  // ── Score distribution buckets ────────────
  function buildBuckets(scores) {
    const labels  = ['0–20', '21–40', '41–60', '61–80', '81–100'];
    const counts  = [0, 0, 0, 0, 0];
    const colorFn = (i) => {
      const c = chartColors();
      const t = i / 4;
      return `color-mix(in srgb, ${c.pos} ${Math.round(t * 100)}%, ${c.neg})`;
    };
    (scores || []).forEach(s => {
      if (s <= 20)       counts[0]++;
      else if (s <= 40)  counts[1]++;
      else if (s <= 60)  counts[2]++;
      else if (s <= 80)  counts[3]++;
      else               counts[4]++;
    });
    return { labels, counts, colorFn };
  }

  // ── Chart instances ───────────────────────
  let donutInstance = null;
  let barInstance   = null;

  function loadChartJS(cb) {
    if (window.Chart) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function drawCharts() {
    if (!window.SENTIAI_JOB) return;
    const c = chartColors();
    const { labels, counts, colorFn } = buildBuckets(window.SENTIAI_JOB.scores);

    // --- Donut ---
    const donutCtx = document.getElementById('donutChart')?.getContext('2d');
    if (donutCtx) {
      if (donutInstance) donutInstance.destroy();
      donutInstance = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['Positive', 'Negative'],
          datasets: [{
            data: [window.SENTIAI_JOB.positive, window.SENTIAI_JOB.negative],
            backgroundColor: [c.pos, c.neg],
            borderWidth: 0,
            hoverOffset: 6,
          }]
        },
        options: {
          cutout: '68%',
          responsive: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} reviews`
              }
            }
          }
        }
      });
      
      // Update Legend HTML explicitly
      const posLegend = document.querySelector('.pos-dot + span');
      if (posLegend) posLegend.textContent = `Positive — ${window.SENTIAI_JOB.positive}`;
      const negLegend = document.querySelector('.neg-dot + span');
      if (negLegend) negLegend.textContent = `Negative — ${window.SENTIAI_JOB.negative}`;
    }

    // --- Bar ---
    const barCtx = document.getElementById('barChart')?.getContext('2d');
    if (barCtx) {
      if (barInstance) barInstance.destroy();
      barInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Reviews',
            data: counts,
            backgroundColor: labels.map((_, i) => colorFn(i)),
            borderRadius: 6,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.raw} review${ctx.raw !== 1 ? 's' : ''}`
              }
            }
          },
          scales: {
            x: {
              ticks: { color: c.ink, font: { family: "'DM Sans', Arial, sans-serif", size: 11 } },
              grid:  { color: c.line }
            },
            y: {
              beginAtZero: true,
              ticks: {
                color: c.ink,
                font: { family: "'DM Sans', Arial, sans-serif", size: 11 },
                stepSize: 1,
                precision: 0,
              },
              grid: { color: c.line }
            }
          }
        }
      });
    }
  }

  function redrawCharts() {
    if (window.Chart) drawCharts();
  }

  loadChartJS(drawCharts);

  // ── Table filter + search ─────────────────
  const filterBtns   = document.querySelectorAll('.filter-btn');
  const searchInput  = document.getElementById('searchInput');
  const rows         = document.querySelectorAll('#resultsTable tbody .result-row');

  let activeFilter = 'all';
  let searchTerm   = '';

  function applyFilters() {
    rows.forEach(row => {
      const sentiment = row.dataset.sentiment || '';
      const text      = row.querySelector('.row-review')?.textContent.toLowerCase() || '';
      const matchFilter = activeFilter === 'all' || sentiment === activeFilter;
      const matchSearch = !searchTerm || text.includes(searchTerm);
      row.style.display = (matchFilter && matchSearch) ? '' : 'none';
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilters();
    });
  });

  searchInput?.addEventListener('input', () => {
    searchTerm = searchInput.value.toLowerCase().trim();
    applyFilters();
  });

  // ── Server-Sent Events Streaming ─────────
  const jobIdMatch = window.location.pathname.match(/\/bulk\/result\/(\d+)/);
  if (jobIdMatch) {
    const jobId = jobIdMatch[1];
    const source = new EventSource(`/api/job/${jobId}/stream`);

    source.onmessage = function(event) {
      const data = JSON.parse(event.data);
      
      // Update Summary Cards
      const pCount = document.getElementById('processedCount');
      if (pCount) pCount.textContent = data.processed;
      const posC = document.getElementById('posCount');
      if (posC) posC.textContent = data.positive;
      const negC = document.getElementById('negCount');
      if (negC) negC.textContent = data.negative;
      const avg = document.getElementById('avgScore');
      if (avg) {
         if (data.status === 'completed') {
             avg.textContent = data.avg_score.toFixed(1) + '%';
         } else {
             avg.textContent = '--';
         }
      }
      const avgSub = document.getElementById('avgScoreSub');
      if (avgSub) {
         if (data.status === 'completed') {
             avgSub.textContent = 'mean model score';
         } else {
             avgSub.textContent = 'Calculating...';
         }
      }
      
      // Keep global JS objects updated for re-draws
      window.SENTIAI_JOB.positive = data.positive;
      window.SENTIAI_JOB.negative = data.negative;
      
      // Update Table Rows Dynamically
      data.new_results.forEach(row => {
        // Accumulate scores for the distribution bar chart
        window.SENTIAI_JOB.scores.push(row.score);

        const tr = document.querySelector(`.result-row[data-index="${row.row_index}"]`);
        if (tr) {
          tr.classList.remove('pending-row');
          const isPos = row.sentiment === 'Positive';
          tr.classList.add(isPos ? 'pos-row' : 'neg-row');
          tr.dataset.sentiment = row.sentiment.toLowerCase();
          
          // Update Badge
          const badgeContainer = tr.querySelector('.row-sentiment');
          badgeContainer.innerHTML = `<span class="sentiment-badge ${isPos ? 'badge-pos' : 'badge-neg'}">${row.sentiment}</span>`;
          
          // Update Bar & Score
          const bar = tr.querySelector('.mini-bar');
          bar.className = `mini-bar ${isPos ? 'mini-pos' : 'mini-neg'}`;
          bar.style.width = row.score + '%';
          tr.querySelector('.score-num').textContent = row.score.toFixed(1) + '%';
          
          // Update Stars
          let stars = row.score > 80 ? 5 : row.score > 60 ? 4 : row.score > 40 ? 3 : row.score > 20 ? 2 : 1;
          tr.querySelector('.stars-sm').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
        }
      });
      
      // Redraw charts with new data
      if (data.new_results.length > 0) redrawCharts();
      
      // Auto-apply active filters if user is filtering mid-stream
      if (data.new_results.length > 0) applyFilters();
    };

    source.addEventListener('complete', function(event) {
      source.close();
      const sub = document.getElementById('statusSub');
      if (sub) sub.textContent = 'Analysis Complete';
    });
  }

})();
