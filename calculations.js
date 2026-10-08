(function (global) {
  'use strict';

  const headers = ['연도', '사업ID', '사업명', '분야', '지역', '참여자수', '수료자수'];
  const sampleCsv = [
    headers.join(','),
    '2024,P01,디지털 기초 교실,교육,서울,80,60',
    '2024,P02,청소년 진로 탐색,교육,부산,60,48',
    '2024,P03,경력 전환 지원,일자리,경기,50,34',
    '2024,P04,사회적기업 인턴십,일자리,인천,100,90',
    '2024,P05,마을 돌봄 연결,지역사회,대전,70,60',
    '2024,P06,자원봉사 성장학교,지역사회,광주,40,28',
    '2025,P01,디지털 기초 교실,교육,서울,90,70',
    '2025,P02,청소년 진로 탐색,교육,부산,80,66',
    '2025,P03,경력 전환 지원,일자리,경기,60,43',
    '2025,P04,사회적기업 인턴십,일자리,인천,115,107',
    '2025,P05,마을 돌봄 연결,지역사회,대전,75,66',
    '2025,P06,자원봉사 성장학교,지역사회,광주,50,36',
    '2026,P01,디지털 기초 교실,교육,서울,100,81',
    '2026,P02,청소년 진로 탐색,교육,부산,100,86',
    '2026,P03,경력 전환 지원,일자리,경기,70,52',
    '2026,P04,사회적기업 인턴십,일자리,인천,130,125',
    '2026,P05,마을 돌봄 연결,지역사회,대전,80,73',
    '2026,P06,자원봉사 성장학교,지역사회,광주,60,46'
  ].join('\r\n');

  // RFC 4180 style parser that also tracks each record's starting physical line.
  function readCsv(text) {
    const input = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    const records = [];
    let record = [], field = '', inQuotes = false, afterQuote = false, line = 1, recordLine = 1;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (inQuotes) {
        if (ch === '"') {
          if (input[i + 1] === '"') { field += '"'; i += 1; }
          else { inQuotes = false; afterQuote = true; }
        } else {
          field += ch;
          if (ch === '\n') line += 1;
          else if (ch === '\r') {
            if (input[i + 1] !== '\n') line += 1;
          }
        }
      } else if (afterQuote && ch !== ',' && ch !== '\r' && ch !== '\n') {
        throw new Error('CSV 형식 오류: 닫는 따옴표 뒤에 구분자나 줄끝이 아닌 문자가 있습니다 (행 ' + line + ').');
      } else if (ch === '"') {
        if (field.length !== 0) throw new Error('CSV 형식 오류: 따옴표는 필드의 첫 문자여야 합니다 (행 ' + line + ').');
        inQuotes = true;
      } else if (ch === ',') {
        record.push(field); field = ''; afterQuote = false;
      } else if (ch === '\r' || ch === '\n') {
        record.push(field); field = ''; afterQuote = false;
        records.push({ values: record, line: recordLine });
        record = [];
        if (ch === '\r' && input[i + 1] === '\n') i += 1;
        line += 1;
        recordLine = line;
      } else {
        field += ch;
      }
    }
    if (inQuotes) throw new Error('CSV 형식 오류: 닫히지 않은 따옴표가 있습니다 (행 ' + recordLine + ').');
    if (record.length || field.length || (input.length && !/[\r\n]$/.test(input))) {
      record.push(field);
      records.push({ values: record, line: recordLine });
    }
    return records;
  }

  function parseCsv(text, source) {
    const records = readCsv(text);
    if (!records.length) throw new Error('CSV 헤더가 없습니다. 필요한 열: ' + headers.join(', '));
    const actual = records[0].values;
    if (actual.length !== headers.length || headers.some((name, i) => actual[i] !== name)) {
      throw new Error('CSV 헤더가 올바르지 않습니다. 필요한 열과 순서: ' + headers.join(', ') + '. 입력 헤더: ' + actual.join(', '));
    }
    const rows = [];
    for (let i = 1; i < records.length; i += 1) {
      const item = records[i];
      // Empty physical lines are harmless; all actual records must match the header width.
      if (item.values.length === 1 && item.values[0] === '') continue;
      if (item.values.length !== headers.length) {
        throw new Error('CSV 열 개수가 맞지 않습니다. ' + item.line + '행: ' + item.values.length + '개, 필요한 열: ' + headers.length + '개.');
      }
      const row = {};
      headers.forEach((name, column) => { row[name] = item.values[column] === undefined ? '' : item.values[column]; });
      row._source = source == null ? '' : String(source);
      row._line = item.line;
      rows.push(row);
    }
    return rows;
  }

  function parseInteger(value, fieldName, reasons) {
    const text = value == null ? '' : String(value).trim();
    if (text === '') {
      reasons.push(fieldName + ': 숫자 누락');
      return null;
    }
    // Strict decimal notation: reject exponent, decimal point, and other coercions.
    if (!/^[+-]?\d+$/.test(text)) {
      reasons.push(fieldName + ': 정수가 아님');
      return null;
    }
    const number = Number(text);
    if (!Number.isSafeInteger(number)) {
      reasons.push(fieldName + ': 안전한 정수가 아님');
      return null;
    }
    if (number < 0) reasons.push(fieldName + ': 음수');
    return number;
  }

  function validateRows(rawRows) {
    const validRows = [], excludedRows = [], seen = new Set();
    (Array.isArray(rawRows) ? rawRows : []).forEach((raw) => {
      const row = raw || {};
      const reasons = [];
      const yearRaw = row['연도'] == null ? '' : String(row['연도']).trim();
      let year = null;
      if (yearRaw === '' || !/^[+-]?\d+$/.test(yearRaw)) reasons.push(yearRaw === '' ? '연도: 숫자 누락' : '연도: 정수가 아님');
      else {
        year = Number(yearRaw);
        if (!Number.isSafeInteger(year)) { reasons.push('연도: 안전한 정수가 아님'); year = null; }
        else if (year < 0) reasons.push('연도: 음수');
      }
      const participants = parseInteger(row['참여자수'], '참여자수', reasons);
      const completed = parseInteger(row['수료자수'], '수료자수', reasons);
      const businessId = row['사업ID'] == null ? '' : String(row['사업ID']).trim();
      if (!businessId) reasons.push('사업ID 누락');
      if (participants != null && completed != null && completed > participants) reasons.push('수료자 초과');

      const duplicateKey = year == null || !businessId ? null : String(year) + '\u0000' + businessId;
      if (reasons.length === 0 && duplicateKey !== null && seen.has(duplicateKey)) reasons.push('중복(연도+사업ID)');
      if (reasons.length) {
        excludedRows.push(Object.assign({}, row, { reasons }));
        return;
      }
      seen.add(duplicateKey);
      const rate = participants === 0 ? null : completed / participants * 100;
      validRows.push(Object.assign({}, row, {
        '연도': year,
        '사업ID': businessId,
        '참여자수': participants,
        '수료자수': completed,
        completionRate: rate,
        status: rate === null ? '계산 불가' : rate < 70 ? '주의' : '정상'
      }));
    });
    return { validRows, excludedRows };
  }

  function buildView(validRows, yearsArray) {
    const inputRows = Array.isArray(validRows) ? validRows : [];
    const allYears = yearsArray === undefined || yearsArray === null;
    const selected = allYears ? null : new Set(Array.from(yearsArray, (year) => String(year)));
    const rows = inputRows.filter((row) => allYears || selected.has(String(row['연도'])));
    let participants = 0, completed = 0, attentionCount = 0;
    const fieldMap = new Map(), businessMap = new Map(), trendMap = new Map();
    const yearSet = new Set();
    rows.forEach((row) => {
      const p = Number(row['참여자수']) || 0, c = Number(row['수료자수']) || 0;
      participants += p; completed += c;
      yearSet.add(String(row['연도']));
      if (row.completionRate !== null && row.completionRate !== undefined && row.completionRate < 70) attentionCount += 1;
      const field = String(row['분야'] == null ? '' : row['분야']);
      const f = fieldMap.get(field) || { name: field, participants: 0 };
      f.participants += p; fieldMap.set(field, f);
      const id = String(row['사업ID'] == null ? '' : row['사업ID']);
      const b = businessMap.get(id) || { id, name: String(row['사업명'] == null ? '' : row['사업명']), participants: 0, completed: 0 };
      b.participants += p; b.completed += c; businessMap.set(id, b);
      const y = Number(row['연도']);
      const t = trendMap.get(y) || { year: y, participants: 0, completed: 0 };
      t.participants += p; t.completed += c; trendMap.set(y, t);
    });
    const completionRate = participants === 0 ? null : completed / participants * 100;
    const fields = Array.from(fieldMap.values()).map((field) => Object.assign({}, field, {
      share: participants === 0 ? null : field.participants / participants * 100
    }));
    const businesses = Array.from(businessMap.values());
    const trend = Array.from(trendMap.values()).sort((a, b) => a.year - b.year).map((point) => Object.assign({}, point, {
      completionRate: point.participants === 0 ? null : point.completed / point.participants * 100
    }));
    return {
      rows,
      summary: { participants, completed, completionRate, businessCount: businessMap.size, yearCount: yearSet.size, attentionCount },
      fields,
      businesses,
      trend
    };
  }

  function csvEscape(value) {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(rows) {
    const lines = [headers.map(csvEscape).join(',')];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      lines.push(headers.map((name) => csvEscape(row && row[name])).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  global.ProgramData = { headers, sampleCsv, parseCsv, validateRows, buildView, toCsv };
})(window);
