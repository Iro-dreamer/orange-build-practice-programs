(() => {
  'use strict';

  const P = window.ProgramData;
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('ko-KR');
  const palette = ['#4d8fc7', '#43ad98', '#8b75c8', '#e2a54f', '#df7470', '#5aafc4', '#7891b8', '#d18da7'];
  const knownFieldColors = { '교육': '#4d8fc7', '일자리': '#43ad98', '지역사회': '#8b75c8' };
  let validRows = [];
  let excludedRows = [];
  let selectedYears = null;
  let sourceLabel = '기본 샘플';
  let currentView = null;
  let currentCsvUrl = null;

  if (!P) {
    $('uploadMessage').textContent = '계산 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
    $('uploadMessage').classList.add('is-error');
    return;
  }

  function fmt(value) { return nf.format(Number.isFinite(value) ? value : 0); }
  function pct(value, digits = 1) { return value == null || !Number.isFinite(value) ? '계산 불가' : `${Number(value).toFixed(digits)}%`; }
  function clear(node) { node.replaceChildren(); }
  function svgEl(name, attrs = {}, parent) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    if (parent) parent.appendChild(el);
    return el;
  }
  function svgText(parent, x, y, value, className = 'chart-label', anchor = 'middle') {
    const el = svgEl('text', { x, y, class: className, 'text-anchor': anchor }, parent);
    el.textContent = String(value);
    return el;
  }
  function createSvg(container, viewBox, title, description, className = '') {
    clear(container);
    const svg = svgEl('svg', { viewBox, role: 'img', 'aria-label': title, focusable: 'false', class: className }, container);
    const titleNode = svgEl('title', {}, svg); titleNode.textContent = title;
    const descNode = svgEl('desc', {}, svg); descNode.textContent = description;
    return svg;
  }
  function fieldColor(name, index) {
    if (Object.prototype.hasOwnProperty.call(knownFieldColors, name)) return knownFieldColors[name];
    let hash = 0;
    for (let i = 0; i < String(name).length; i++) hash = (hash * 31 + String(name).charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length] || palette[index % palette.length];
  }
  function showNoData(container, message) {
    clear(container);
    const p = document.createElement('div'); p.className = 'no-data'; p.textContent = message;
    container.appendChild(p);
  }
  function svgNumber(value) { return Number.isFinite(value) ? value.toFixed(2) : '0'; }

  function buildPie(fields, total) {
    const host = $('pieChart'); clear(host); clear($('fieldLegend'));
    const usable = fields.filter(f => Number.isFinite(f.participants) && f.participants > 0);
    const legend = $('fieldLegend');
    if (!usable.length || total <= 0) {
      showNoData(host, '선택한 자료에 참여 실적이 없습니다.');
      const msg = document.createElement('div'); msg.className = 'no-data'; msg.textContent = '분야별 비중을 계산할 수 없습니다.'; legend.appendChild(msg);
      return;
    }
    const cx = 100, cy = 100, r = 84;
    const svg = createSvg(host, '0 0 200 200', '분야별 참여 비중 도넛 차트', `총 참여자 ${fmt(total)}명. ${usable.map(f => `${f.name} ${pct(f.share, 1)}, ${fmt(f.participants)}명`).join('; ')}.`);
    let angle = -Math.PI / 2;
    usable.forEach((field, index) => {
      const portion = field.participants / total;
      const end = angle + portion * Math.PI * 2;
      if (portion >= 0.9999) {
        svgEl('circle', { cx, cy, r, fill: fieldColor(field.name, index), class: 'pie-segment', 'aria-label': `${field.name}, ${pct(field.share, 1)}, ${fmt(field.participants)}명` }, svg);
      } else {
        const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
        const large = end - angle > Math.PI ? 1 : 0;
        const d = `M ${cx} ${cy} L ${svgNumber(x1)} ${svgNumber(y1)} A ${r} ${r} 0 ${large} 1 ${svgNumber(x2)} ${svgNumber(y2)} Z`;
        svgEl('path', { d, fill: fieldColor(field.name, index), class: 'pie-segment', 'aria-label': `${field.name}, ${pct(field.share, 1)}, ${fmt(field.participants)}명` }, svg);
      }
      angle = end;
      const item = document.createElement('div'); item.className = 'field-legend-item';
      const dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.backgroundColor = fieldColor(field.name, index); dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.textContent = field.name;
      const share = document.createElement('strong'); share.textContent = pct(field.share, 1);
      const count = document.createElement('small'); count.textContent = `${fmt(field.participants)}명 참여`;
      item.append(dot, name, share, count); legend.appendChild(item);
    });
    svgEl('circle', { cx, cy, r: 52, fill: '#fff' }, svg);
    svgText(svg, cx, 96, '참여 합계', 'pie-center-label');
    svgText(svg, cx, 117, fmt(total), 'pie-center-value');
  }

  function buildBars(businesses) {
    const host = $('businessChart');
    if (!businesses.length) { showNoData(host, '선택한 연도에 표시할 사업 실적이 없습니다.'); return; }
    const width = Math.max(560, businesses.length * 86 + 70), height = 284;
    const left = 43, right = 14, top = 18, bottom = 48;
    const plotW = width - left - right, plotH = height - top - bottom;
    const maxVal = Math.max(1, ...businesses.flatMap(b => [b.participants, b.completed]));
    const step = Math.pow(10, Math.floor(Math.log10(maxVal)));
    const cap = Math.ceil(maxVal / step) * step;
    const svg = createSvg(host, `0 0 ${width} ${height}`, '사업별 참여자와 수료자 막대 차트', `단위는 명. ${businesses.map(b => `${b.id} ${b.name}: 참여 ${fmt(b.participants)}명, 수료 ${fmt(b.completed)}명`).join('; ')}.`);
    for (let i = 0; i <= 4; i++) {
      const value = cap * i / 4, y = top + plotH - plotH * i / 4;
      svgEl('line', { x1: left, y1: y, x2: width - right, y2: y, class: i === 0 ? 'chart-axis' : 'chart-gridline' }, svg);
      svgText(svg, left - 8, y + 3, fmt(value), 'chart-label', 'end');
    }
    const band = plotW / businesses.length, barW = Math.min(22, Math.max(12, band * .24));
    businesses.forEach((b, i) => {
      const center = left + band * (i + .5);
      [[b.participants, -barW - 2, 'bar-participants'], [b.completed, 2, 'bar-completed']].forEach(([value, dx, cls]) => {
        const h = plotH * value / cap, y = top + plotH - h;
        svgEl('rect', { x: center + dx, y, width: barW, height: Math.max(value > 0 ? 1 : 0, h), rx: 4, class: cls }, svg);
        svgText(svg, center + dx + barW / 2, Math.max(12, y - 5), fmt(value), 'chart-value');
      });
      svgText(svg, center, height - 25, b.id, 'chart-label');
      const shortName = b.name.length > 8 ? `${b.name.slice(0, 8)}…` : b.name;
      svgText(svg, center, height - 10, shortName, 'chart-label');
    });
  }

  function buildTrend(trend) {
    const host = $('trendChart');
    if (!trend.length) { showNoData(host, '선택한 연도에 표시할 수료율 추이가 없습니다.'); return; }
    const width = Math.max(560, trend.length * 150 + 100), height = 260;
    const left = 45, right = 24, top = 20, bottom = 42, plotW = width - left - right, plotH = height - top - bottom;
    const svg = createSvg(host, `0 0 ${width} ${height}`, '연도별 합계 기준 수료율 추이', `단위는 퍼센트. ${trend.map(row => `${row.year}년 ${pct(row.completionRate, 1)}`).join('; ')}.`);
    [0, 25, 50, 75, 100].forEach(value => {
      const y = top + plotH - plotH * value / 100;
      svgEl('line', { x1: left, y1: y, x2: width - right, y2: y, class: value === 0 ? 'chart-axis' : 'chart-gridline' }, svg);
      svgText(svg, left - 9, y + 3, `${value}%`, 'chart-label', 'end');
    });
    const xAt = i => trend.length === 1 ? left + plotW / 2 : left + plotW * i / (trend.length - 1);
    const yAt = value => top + plotH - plotH * value / 100;
    let active = [];
    const drawSegment = (rows) => {
      if (!rows.length) return;
      if (rows.length > 1) {
        const d = rows.map((point, i) => `${i ? 'L' : 'M'} ${svgNumber(xAt(point.index))} ${svgNumber(yAt(point.row.completionRate))}`).join(' ');
        svgEl('path', { d, class: 'trend-line' }, svg);
      }
      rows.forEach(point => {
        const x = xAt(point.index), y = yAt(point.row.completionRate);
        svgEl('circle', { cx: x, cy: y, r: 5, class: 'trend-point' }, svg);
        svgText(svg, x, y - 11, pct(point.row.completionRate, 1), 'chart-value');
      });
    };
    trend.forEach((row, index) => {
      const x = xAt(index);
      svgText(svg, x, height - 15, `${row.year}년`, 'chart-label');
      if (row.completionRate == null) {
        drawSegment(active); active = [];
        svgText(svg, x, top + plotH / 2, '계산 불가', 'chart-label');
      } else active.push({ row, index });
    });
    drawSegment(active);
  }

  function renderYears() {
    const host = $('yearOptions'); clear(host);
    const yearSet = new Set([...validRows, ...excludedRows].map(row => row['연도']).filter(year => year !== undefined && year !== null && year !== '').map(String));
    const years = [...yearSet].sort((a, b) => Number(a) - Number(b));
    if (!years.length) {
      const label = document.createElement('span'); label.className = 'section-caption'; label.textContent = '자료에 연도 정보가 없습니다.'; host.appendChild(label); selectedYears = null; return;
    }
    if (selectedYears !== null) selectedYears = selectedYears.filter(year => yearSet.has(year));
    years.forEach(year => {
      const label = document.createElement('label'); label.className = 'year-option';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = String(year); input.checked = selectedYears === null || selectedYears.includes(year);
      input.addEventListener('change', () => {
        const now = new Set([...$('yearOptions').querySelectorAll('input:checked')].map(el => el.value));
        selectedYears = now.size === years.length ? null : [...now];
        render();
      });
      const text = document.createElement('span'); text.textContent = `${year}년`;
      label.append(input, text); host.appendChild(label);
    });
  }

  function renderExcluded() {
    const list = $('excludedList'); clear(list);
    const shown = excludedRows.filter(row => selectedYears === null || selectedYears.includes(String(row['연도'])));
    $('excludedCount').textContent = `${fmt(shown.length)}건`;
    $('excludedEmpty').hidden = shown.length > 0;
    shown.forEach(row => {
      const item = document.createElement('article'); item.className = 'excluded-item';
      const origin = document.createElement('div'); origin.className = 'excluded-origin';
      const source = document.createElement('span'); source.textContent = row._source || '자료';
      const line = document.createElement('small'); line.textContent = `${row._line ? `${row._line}행` : '행 위치 미상'} · ${row['연도'] ?? '연도 미상'}`;
      origin.append(source, line);
      const record = document.createElement('div'); record.className = 'excluded-record';
      record.textContent = `${row['사업ID'] || '사업 ID 미상'} · ${row['사업명'] || '사업명 미상'}`;
      const reasons = document.createElement('div'); reasons.className = 'excluded-reasons';
      (Array.isArray(row.reasons) ? row.reasons : ['검증 오류']).forEach(reason => { const tag = document.createElement('span'); tag.className = 'reason-tag'; tag.textContent = reason; reasons.appendChild(tag); });
      item.append(origin, record, reasons); list.appendChild(item);
    });
  }

  function renderTable(rows) {
    const body = $('detailRows'); clear(body);
    $('rowCount').textContent = fmt(rows.length);
    $('tableEmpty').hidden = rows.length > 0;
    rows.forEach(row => {
      const tr = document.createElement('tr');
      [row['연도'], row['사업ID'], row['사업명'], row['분야'], row['지역']].forEach(value => { const td = document.createElement('td'); td.textContent = value == null ? '—' : String(value); tr.appendChild(td); });
      ['참여자수', '수료자수'].forEach(key => { const td = document.createElement('td'); td.className = 'number'; td.textContent = fmt(row[key]); tr.appendChild(td); });
      const rate = document.createElement('td'); rate.className = 'number'; rate.textContent = pct(row.completionRate, 1); tr.appendChild(rate);
      const status = document.createElement('td'); const pill = document.createElement('span');
      pill.className = `status-pill${row.status === '주의' ? ' attention' : row.status === '계산 불가' ? ' unavailable' : ''}`; pill.textContent = row.status || '—'; status.appendChild(pill); tr.appendChild(status);
      body.appendChild(tr);
    });
  }

  function render() {
    if (!P) return;
    currentView = P.buildView(validRows, selectedYears);
    updateCsvDownload(currentView.rows);
    const { summary, fields, businesses, trend, rows } = currentView;
    $('kpiParticipants').textContent = fmt(summary.participants);
    $('kpiCompleted').textContent = fmt(summary.completed);
    $('kpiRate').textContent = pct(summary.completionRate, 1);
    $('kpiBusinesses').textContent = fmt(summary.businessCount);
    $('kpiYears').textContent = fmt(summary.yearCount);
    $('kpiAttention').textContent = fmt(summary.attentionCount);
    renderYears(); renderExcluded(); renderTable(rows);
    buildPie(fields, summary.participants); buildBars(businesses); buildTrend(trend);
  }

  function setMessage(message, error = false) {
    const node = $('uploadMessage'); node.textContent = message; node.classList.toggle('is-error', error);
  }
  function setSource(label) { sourceLabel = label; $('sourceName').textContent = label; }
  function updateCsvDownload(rows) {
    const link = $('downloadCsv');
    let nextUrl;
    try {
      const csv = P.toCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      nextUrl = URL.createObjectURL(blob);
    } catch (error) {
      if (currentCsvUrl) URL.revokeObjectURL(currentCsvUrl);
      currentCsvUrl = null;
      link.removeAttribute('href');
      setMessage(`CSV를 준비하지 못했습니다: ${error && error.message ? error.message : '다시 시도해 주세요.'}`, true);
      return;
    }
    if (currentCsvUrl) URL.revokeObjectURL(currentCsvUrl);
    currentCsvUrl = nextUrl;
    link.href = currentCsvUrl;
  }
  function acceptSample() {
    const raw = P.parseCsv(P.sampleCsv, '기본 샘플');
    const checked = P.validateRows(raw);
    validRows = checked.validRows; excludedRows = checked.excludedRows; selectedYears = null;
    setSource('기본 샘플'); render();
    if ($('downloadCsv').hasAttribute('href')) setMessage('기본 정상 샘플 18행을 불러왔습니다. 교육용 가상자료입니다.');
  }

  $('fileInput').addEventListener('change', async (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;
    setMessage('CSV 파일을 읽고 있습니다…');
    try {
      const parsed = await Promise.all(files.map(async file => ({ file, text: await file.text() })));
      const rawRows = [];
      parsed.forEach(({ file, text }) => rawRows.push(...P.parseCsv(text, file.name)));
      const checked = P.validateRows(rawRows);
      validRows = checked.validRows; excludedRows = checked.excludedRows; selectedYears = null;
      const label = files.length === 1 ? files[0].name : `${files.length}개 파일`;
      setSource(label); render();
      if ($('downloadCsv').hasAttribute('href')) setMessage(`${label} 자료를 불러왔습니다. 유효 ${fmt(validRows.length)}행, 제외 ${fmt(excludedRows.length)}행입니다.`);
    } catch (error) {
      setMessage(`CSV를 불러오지 못했습니다: ${error && error.message ? error.message : '파일 형식이나 내용을 확인해 주세요.'} 기존 자료는 유지했습니다.`, true);
    }
  });
  $('restoreSample').addEventListener('click', acceptSample);
  $('selectAllYears').addEventListener('click', () => { selectedYears = null; render(); });
  $('clearYears').addEventListener('click', () => { selectedYears = []; render(); });
  $('downloadCsv').addEventListener('click', (event) => {
    const link = $('downloadCsv');
    if (!currentCsvUrl || !link.hasAttribute('href')) {
      event.preventDefault();
      setMessage('CSV가 준비되지 않았습니다. 필터를 다시 선택하거나 자료를 다시 불러와 주세요.', true);
      return;
    }
    setMessage(`현재 필터의 유효 ${fmt(currentView ? currentView.rows.length : 0)}행 CSV 다운로드를 요청했습니다. 브라우저의 저장 결과를 확인해 주세요.`);
  });
  window.addEventListener('beforeunload', () => {
    if (currentCsvUrl) URL.revokeObjectURL(currentCsvUrl);
  });

  acceptSample();
})();
