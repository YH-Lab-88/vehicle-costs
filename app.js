(function () {
  const SHEET_ID = "12yoQGCYgyILB4TNYyjd5DfDzyDI9fogaw2YqipC3CLY";
  const SOURCES = [
    { gid: "1967607796", name: "VIVA 2026" },
    { gid: "589599760", name: "PANDAN 2026" },
    { gid: "1176444304", name: "PERKASA 2026" },
    { gid: "1451208396", name: "VIVA 2025" },
    { gid: "1994879894", name: "PANDAN 2025" },
    { gid: "1947397665", name: "PERKASA 2025" },
  ];
  const OVERVIEW_GID = "0";
  const SERVICE_PLAN_SOURCE = { gid: "215581133", name: "Main26 all" };
  const PROGRESS_SOURCE = { gid: "1947617141", name: "进度" };
  const QNA_SOURCE = { gid: "230086888", name: "QnA" };
  const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const MONTH_ALIASES = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mac: 3,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const state = {
    expenses: [],
    servicePlans: [],
    vehicles: new Map(),
    view: "progress",
    mileagePlans: [],
    qna: [],
    progress: [],
    filters: { year: String(new Date().getFullYear()), month: "all", branch: "all", vehicle: "all" },
    lastLoaded: null,
  };

  const el = {
    appShell: document.querySelector("#appShell"),
    refreshButton: document.querySelector("#refreshButton"),
    totalLabel: document.querySelector("#totalLabel"),
    totalAmount: document.querySelector("#totalAmount"),
    vehicleCount: document.querySelector("#vehicleCount"),
    recordLabel: document.querySelector("#recordLabel"),
    recordCount: document.querySelector("#recordCount"),
    yearFilter: document.querySelector("#yearFilter"),
    monthFilter: document.querySelector("#monthFilter"),
    branchFilter: document.querySelector("#branchFilter"),
    vehicleFilter: document.querySelector("#vehicleFilter"),
    statusText: document.querySelector("#statusText"),
    tabs: document.querySelectorAll(".tab"),
    chartTitle: document.querySelector("#chartTitle"),
    lastUpdated: document.querySelector("#lastUpdated"),
    detailTitle: document.querySelector("#detailTitle"),
    barChart: document.querySelector("#barChart"),
    chartPanel: document.querySelector(".chart-panel"),
    vehicleList: document.querySelector("#vehicleList"),
    listHint: document.querySelector("#listHint"),
    progressLegend: document.querySelector("#progressLegend"),
  };

  function sheetUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  }

  function startApp() {
    if (!state.lastLoaded && !state.expenses.length) loadData();
  }

  async function loadCsv(gid) {
    const response = await fetch(sheetUrl(gid), { cache: "no-store" });
    if (!response.ok) throw new Error(`Sheet ${gid} 读取失败`);
    return response.text();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          value += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          value += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(value);
        value = "";
      } else if (char === "\n") {
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else if (char !== "\r") {
        value += char;
      }
    }

    if (value || row.length) {
      row.push(value);
      rows.push(row);
    }
    return rows;
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizePlate(value) {
    const raw = clean(value).toUpperCase();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (/^\d+$/.test(parts[0] || "") && /^[A-Z]+$/.test(parts[1] || "")) {
      if (parts.length === 3 && parts[1].length === 2 && parts[2].length === 1 && /^[A-Z]$/.test(parts[2])) {
        return `${parts[1]}${parts[0]}${parts[2]}`;
      }
      return `${parts.slice(1).join("")}${parts[0]}`;
    }
    return raw.replace(/[^A-Z0-9]/g, "");
  }

  function displayPlate(value) {
    const raw = clean(value).toUpperCase();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (/^\d+$/.test(parts[0] || "") && /^[A-Z]+$/.test(parts[1] || "")) {
      if (parts.length === 3 && parts[1].length === 2 && parts[2].length === 1 && /^[A-Z]$/.test(parts[2])) {
        return `${parts[1]} ${parts[0]}${parts[2]}`;
      }
      return `${parts.slice(1).join("")} ${parts[0]}`;
    }
    const compact = raw.replace(/\s+/g, "");
    const compactMatch = compact.match(/^([A-Z]{1,3})(\d+)([A-Z]?)$/);
    if (compactMatch) {
      return compactMatch[3]
        ? `${compactMatch[1]} ${compactMatch[2]}${compactMatch[3]}`
        : `${compactMatch[1]} ${compactMatch[2]}`;
    }
    return raw;
  }

  function isVehiclePlate(value) {
    const text = clean(value);
    if (!text || /^plat$/i.test(text) || /车牌/.test(text)) return false;
    return /[A-Za-z]/.test(text) && /\d/.test(text) && text.replace(/\s+/g, "").length >= 4;
  }

  function parseAmount(value) {
    const text = clean(value).replace(/RM/gi, "");
    if (!text) return 0;
    const normalized = text.replace(/,/g, "");
    if (/^-?\d+(\.\d+)?$/.test(normalized)) return Number(normalized);

    const matches = [...text.matchAll(/(?:RM\s*)?(-?\d[\d,]*(?:\.\d+)?)/gi)].map((match) => match[1]);
    const useful = matches
      .map((match) => Number(match.replace(/,/g, "")))
      .filter((number) => Number.isFinite(number) && (number >= 80 || !Number.isInteger(number)));
    return useful.length ? useful[useful.length - 1] : 0;
  }

  function monthFromHeader(label) {
    const raw = clean(label).replace(/[‘’]/g, "'");
    if (!raw) return null;

    let match = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (match) return { month: Number(match[1]), year: Number(match[2]) };

    match = raw.match(/^(\d{2})'\s*([A-Za-z]+)$/);
    if (match) return { year: 2000 + Number(match[1]), month: MONTH_ALIASES[match[2].toLowerCase()] };

    match = raw.match(/^([A-Za-z]+)\s*'?(\d{2,4})$/);
    if (match) {
      const yearText = match[2];
      return {
        month: MONTH_ALIASES[match[1].toLowerCase()],
        year: yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText),
      };
    }

    return null;
  }

  function monthKey(year, month) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function inferSheetType(headers) {
    const joined = headers.map(clean).join("|").toLowerCase();
    if (joined.includes("预计保养")) return "current-cn";
    if (joined.includes("next service") && joined.includes("front tire")) return "current-en";
    if (joined.includes("last service") && joined.includes("之前")) return "history";
    return "generic";
  }

  function findMonthColumns(headers, rows) {
    return headers
      .map((header, index) => {
        const parsed = monthFromHeader(header);
        if (!parsed || !parsed.month || !parsed.year) return null;
        const nextHeader = clean(headers[index + 1]);
        const paired = !monthFromHeader(nextHeader) && rows.some((row) => parseAmount(row[index + 1]) > 0);
        return { index, amountIndex: paired ? index + 1 : index, paired, ...parsed };
      })
      .filter(Boolean);
  }

  function headerIndex(headers, patterns) {
    return headers.findIndex((header) => patterns.some((pattern) => pattern.test(clean(header))));
  }

  function headerIndexes(headers) {
    const nextServiceIndexes = headers.reduce((indexes, header, index) => {
      if (/^next service$/i.test(clean(header))) indexes.push(index);
      return indexes;
    }, []);

    return {
      plate: headerIndex(headers, [/^plat$/i, /^车牌$/]),
      serviceMonth: headerIndex(headers, [/^预计保养$/]),
      lastService: headerIndex(headers, [/^last service$/i, /^上次保养$/]),
      car: headerIndex(headers, [/^car$/i, /^type$/i, /^车款$/]),
      driver: headerIndex(headers, [/^driver$/i, /^负责人$/]),
      owner: headerIndex(headers, [/^owner$/i, /^ownner$/i]),
      nextService: nextServiceIndexes[1] ?? nextServiceIndexes[0] ?? -1,
      nextServiceMonth: nextServiceIndexes[0] ?? -1,
    };
  }

  function rowValue(row, index) {
    return index >= 0 ? clean(row[index]) : "";
  }

  function vehicleMeta(row, type, sourceName, headers) {
    const indexes = headerIndexes(headers);
    const meta = {
      plate: displayPlate(row[0]),
      key: normalizePlate(row[0]),
      car: "",
      branch: branchFromSource(sourceName),
      driver: "",
      owner: "",
      serviceMonth: "",
      lastService: "",
      nextService: "",
      source: sourceName,
    };

    if (type === "current-cn") {
      meta.serviceMonth = normalizeServiceMonth(rowValue(row, indexes.serviceMonth));
      meta.lastService = rowValue(row, indexes.lastService);
      meta.car = rowValue(row, indexes.car);
      meta.driver = rowValue(row, indexes.driver >= 0 ? indexes.driver : 4);
    } else if (type === "current-en") {
      meta.serviceMonth = normalizeServiceMonth(rowValue(row, indexes.serviceMonth >= 0 ? indexes.serviceMonth : indexes.nextServiceMonth));
      meta.nextService = rowValue(row, indexes.nextService);
      meta.car = rowValue(row, indexes.car);
      meta.lastService = rowValue(row, indexes.lastService);
      meta.owner = rowValue(row, indexes.owner);
      meta.driver = rowValue(row, indexes.driver) || meta.owner;
    } else {
      meta.lastService = rowValue(row, indexes.lastService >= 0 ? indexes.lastService : 1);
      meta.car = rowValue(row, indexes.car >= 0 ? indexes.car : 2);
      meta.driver = rowValue(row, indexes.driver >= 0 ? indexes.driver : 3);
      meta.owner = rowValue(row, indexes.owner >= 0 ? indexes.owner : 4);
      meta.serviceMonth = normalizeServiceMonth(rowValue(row, indexes.serviceMonth));
      meta.nextService = rowValue(row, indexes.nextService) || rowValue(row, indexes.serviceMonth);
    }
    return meta;
  }

  function normalizeServiceMonth(value) {
    const text = clean(value);
    const numericMonth = text.match(/^(0?[1-9]|1[0-2])$/);
    if (numericMonth) return `${Number(numericMonth[1])}月`;
    if (/^(0?[1-9]|1[0-2])月$/.test(text)) return text.replace(/^0/, "");
    return "";
  }

  function serviceMonthNumber(value) {
    const match = normalizeServiceMonth(value).match(/^(\d{1,2})月$/);
    return match ? Number(match[1]) : 0;
  }

  function parseServiceDate(value) {
    const text = clean(value);
    let match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})$/);
    if (match) {
      return {
        day: Number(match[1]),
        month: Number(match[2]),
        year: Number(match[3]),
      };
    }

    match = text.match(/^(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
    if (!match) return null;
    return {
      day: Number(match[3]),
      month: Number(match[2]),
      year: Number(match[1]),
    };
  }

  function inferServiceYear(month, expectedDateParts, lastService, fallbackYear) {
    if (expectedDateParts?.year) return expectedDateParts.year;

    const lastServiceParts = parseServiceDate(lastService);
    if (lastServiceParts?.year) {
      return month < lastServiceParts.month ? lastServiceParts.year + 1 : lastServiceParts.year;
    }

    return fallbackYear;
  }

  function normalizeBranch(value) {
    const text = clean(value).toLowerCase();
    if (text.includes("perkasa") || text.includes("erkasa")) return "Perkasa";
    if (text.includes("viva")) return "Viva";
    if (text.includes("pandan")) return "Pandan";
    return clean(value);
  }

  function branchFromSource(sourceName) {
    return normalizeBranch(sourceName);
  }

  function yearFromSource(sourceName) {
    const match = clean(sourceName).match(/\b(20\d{2})\b/);
    return match ? Number(match[1]) : null;
  }

  function servicePlanIndexes(headers) {
    // The Main sheet uses fixed columns: A=plate, B=expected date,
    // C=last service, D=car, E=driver/owner. Keep the header lookup as
    // the primary path, with these positions as a fallback for merged or
    // slightly different header cells.
    const find = (patterns, fallback) => {
      const index = headerIndex(headers, patterns);
      return index >= 0 ? index : fallback;
    };
    return {
      branch: find([/^branch$/i, /^分行$/], -1),
      plate: find([/^plat$/i, /^车牌$/], 0),
      serviceMonth: find([/^预计(?:保养)?$/, /^next service$/i], 1),
      serviceDate: find([/^预计(?:保养)?$/, /^next service$/i], 1),
      lastService: find([/^last service$/i, /^上次保养$/], 2),
      car: find([/^car$/i, /^type$/i, /^车款$/], 3),
      driver: find([/^driver$/i, /^负责人$/], 4),
      owner: find([/^owner$/i, /^ownner$/i], 4),
    };
  }

  function rememberVehicle(meta) {
    if (!meta.key) return;
    const existing = state.vehicles.get(meta.key) || {};
    const mainSheetIsAuthoritative = meta.source === "Main26 all";
    state.vehicles.set(meta.key, {
      key: meta.key,
      plate: existing.plate || meta.plate,
      car: mainSheetIsAuthoritative ? meta.car : existing.car || meta.car,
      branch: mainSheetIsAuthoritative ? meta.branch : existing.branch || meta.branch,
      driver: mainSheetIsAuthoritative ? meta.driver : existing.driver || meta.driver,
      owner: mainSheetIsAuthoritative ? meta.owner : existing.owner || meta.owner,
      serviceMonth: mainSheetIsAuthoritative ? meta.serviceMonth : existing.serviceMonth || meta.serviceMonth,
      lastService: mainSheetIsAuthoritative ? meta.lastService : existing.lastService || meta.lastService,
      nextService: mainSheetIsAuthoritative ? meta.nextService : existing.nextService || meta.nextService,
      source: mainSheetIsAuthoritative ? meta.source : existing.source || meta.source,
    });
  }

  function parseExpenseSheet(csv, source) {
    const rows = parseCsv(csv).filter((row) => row.some((cell) => clean(cell)));
    if (!rows.length) return [];

    const headers = rows[0];
    const type = inferSheetType(headers);
    const sourceYear = yearFromSource(source.name);
    const monthColumns = findMonthColumns(headers, rows).filter((column) => !sourceYear || column.year === sourceYear);
    const expenses = [];
    const dataRows = rows.slice(1);

    // Each vehicle occupies three consecutive sheet rows. Keep each row as its own expense line.
    for (let groupStart = 0; groupStart < dataRows.length; groupStart += 3) {
      const vehicleRows = dataRows.slice(groupStart, groupStart + 3);
      const vehicleRow = vehicleRows.find((row) => isVehiclePlate(row[0]));
      if (!vehicleRow) continue;

      const vehicle = vehicleMeta(vehicleRow, type, source.name, headers);
      rememberVehicle(vehicle);
      vehicleRows.forEach((row, offset) => {
        const rowIndex = groupStart + offset;
        monthColumns.forEach((column) => {
          const description = clean(row[column.index]);
          if (/\bLAST\b/i.test(description)) return;
          const pairedAmount = column.paired ? parseAmount(row[column.amountIndex]) : 0;
          const inlineAmount = column.paired ? 0 : parseAmount(description);
          const amount = pairedAmount || inlineAmount;
          if (!description || amount < 0) return;

          const detail = column.paired ? description : description.replace(/(?:RM\s*)?-?\d[\d,]*(?:\.\d+)?\s*$/i, "").trim();
          expenses.push({
            id: `${source.gid}-${vehicle.key}-${column.index}-${expenses.length}`,
            rowIndex,
            source: source.name,
            vehicleKey: vehicle.key,
            plate: vehicle.plate,
            car: vehicle.car,
            branch: vehicle.branch,
            driver: vehicle.driver,
            owner: vehicle.owner,
            serviceMonth: vehicle.serviceMonth,
            year: column.year,
            month: column.month,
            monthKey: monthKey(column.year, column.month),
            description: detail || "维修 / 保养",
            amount,
          });
        });
      });
    }

    return expenses;
  }

  function parseServicePlans(csv, source) {
    const rows = parseCsv(csv).filter((row) => row.some((cell) => clean(cell)));
    const sourceYear = yearFromSource(source.name) || new Date().getFullYear();
    const plans = new Map();
    let branch = "";
    let indexes = null;

    function addPlan(row, rowIndexes, branchOverride = "") {
      if (!rowIndexes || rowIndexes.plate < 0 || rowIndexes.serviceMonth < 0) return;
      const plate = rowValue(row, rowIndexes.plate);
      if (!isVehiclePlate(plate)) return;

      const expectedDate = rowValue(row, rowIndexes.serviceDate);
      const expectedDateParts = parseServiceDate(expectedDate);
      const month = serviceMonthNumber(rowValue(row, rowIndexes.serviceMonth)) || expectedDateParts?.month || 0;
      if (!month) return;

      const lastService = rowValue(row, rowIndexes.lastService);
      const serviceYear = inferServiceYear(month, expectedDateParts, lastService, sourceYear);
      const meta = {
        key: normalizePlate(plate),
        plate: displayPlate(plate),
        car: rowValue(row, rowIndexes.car),
        branch: branchOverride || normalizeBranch(rowValue(row, rowIndexes.branch)) || branch,
        driver: rowValue(row, rowIndexes.driver),
        owner: rowValue(row, rowIndexes.owner),
        serviceMonth: `${month}月`,
        lastService,
        nextService: expectedDate || `${month}月`,
        source: source.name,
      };

      rememberVehicle(meta);
      plans.set(meta.key, {
        id: `${source.gid}-${meta.key}`,
        ...meta,
        year: serviceYear,
        month,
        monthKey: monthKey(serviceYear, month),
      });
    }

    rows.forEach((row) => {
      const firstCell = clean(row[0]);
      const normalizedBranch = normalizeBranch(firstCell);
      const rowPlate = indexes?.plate >= 0 ? rowValue(row, indexes.plate) : rowValue(row, 1);
      if (/^(viva|pandan|perkasa)$/i.test(firstCell) && !isVehiclePlate(rowPlate)) {
        branch = normalizedBranch;
        indexes = null;
        return;
      }

      if (row.some((cell) => /^车牌$|^plat$/i.test(clean(cell))) && row.some((cell) => /^预计(?:保养)?$|^next service$/i.test(clean(cell)))) {
        indexes = servicePlanIndexes(row);
        return;
      }

      addPlan(row, indexes);

    });

    return [...plans.values()];
  }

  function parseMileagePlans(csv, source) {
    const rows = parseCsv(csv).filter((row) => row.some((cell) => clean(cell)));
    const branch = branchFromSource(source.name);
    const plans = new Map();
    const numericMileage = (value) => {
      const text = clean(value).replace(/,/g, "");
      if (!text || /last|上次|预计|保养/i.test(text)) return null;
      const match = text.match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    };

    rows.forEach((row, rowIndex) => {
      const plateIndex = row.findIndex((cell) => isVehiclePlate(cell));
      if (plateIndex < 0) return;
      const plate = displayPlate(row[plateIndex]);
      if (/^LAST\b/i.test(clean(plate)) || /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+20\d{2}$/i.test(clean(plate))) return;
      const key = normalizePlate(plate);
      const vehicle = state.vehicles.get(key) || {};
      // VIVA/PANDAN use a three-row vehicle block: plate in A of the
      // first row, remaining mileage in B of the third row.
      const mileageRow = rows[rowIndex + 2] || [];
      const mileage = numericMileage(mileageRow[1]);
      const plan = {
        id: `${source.gid}-${key}-${rowIndex}`,
        key,
        plate,
        branch,
        car: vehicle.car || "",
        mileage,
        source: source.name,
      };
      plans.set(key, plan);
    });
    return [...plans.values()];
  }

  function parseQna(csv) {
    const rows = parseCsv(csv).filter((row) => row.some((cell) => clean(cell)));
    const items = [];
    let current = null;
    rows.forEach((row) => {
      const type = clean(row[0]).toUpperCase();
      const text = clean(row[1]);
      if (type === "Q") {
        if (current) items.push(current);
        current = { question: text, answers: [] };
      } else if (type === "A" && current && text) {
        current.answers.push(text);
      }
    });
    if (current) items.push(current);
    return items.map((item) => ({
      question: item.question,
      answers: item.answers,
    }));
  }

  function parseProgress(csv) {
    return parseCsv(csv).slice(1)
      .map((row) => ({
        status: clean(row[0]),
        pickup: clean(row[1]),
        item: clean(row[2]),
        // Keep every column after 事项: the sheet may contain blank spacer
        // columns before or after the 细节 column.
        detail: clean(row.slice(3).filter((cell) => clean(cell)).join(" ")),
      }))
      .filter((row) => row.status || row.pickup || row.item || row.detail);
  }

  function progressStatusClass(status) {
    if (status.includes("等柜台")) return "progress-counter";
    if (status.includes("日期已确认")) return "progress-date";
    if (status.includes("车已开走")) return "progress-departed";
    if (status.includes("已经完成")) return "progress-done";
    return "progress-other";
  }

  function progressDetailHtml(detail) {
    const text = clean(detail);
    if (!text) return "";
    const markers = [...text.matchAll(/【[^】]*】/g)];
    if (!markers.length) return `<div>${escapeHtml(text)}</div>`;

    const lines = [];
    if (markers[0].index > 0) lines.push(text.slice(0, markers[0].index).trim());
    markers.forEach((marker, index) => {
      const start = marker.index;
      const end = index + 1 < markers.length ? markers[index + 1].index : text.length;
      lines.push(text.slice(start, end).trim());
    });
    return lines.filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  }

  function renderProgress(items) {
    el.detailTitle.textContent = "进度";
    el.progressLegend?.classList.remove("hidden");
    el.listHint.textContent = `${items.length} 条`;
    el.vehicleList.innerHTML = "";
    if (!items.length) {
      el.vehicleList.innerHTML = '<div class="empty-state">没有进度资料</div>';
      return;
    }
    const list = document.createElement("div");
    list.className = "progress-list";
    items.forEach((item) => {
      const row = document.createElement("article");
      row.className = `progress-row ${progressStatusClass(item.status)}`;
      row.innerHTML = `<div class="progress-main"><strong>${escapeHtml(item.status || "未填写状态")}</strong><span>${escapeHtml(item.pickup)}</span><p>${escapeHtml(item.item)}</p></div>${item.detail ? `<div class="progress-detail">${progressDetailHtml(item.detail)}</div>` : ""}`;
      list.appendChild(row);
    });
    el.vehicleList.appendChild(list);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderQna(items) {
    el.detailTitle.textContent = "QnA";
    el.listHint.textContent = `${items.length} 条`;
    el.vehicleList.innerHTML = "";
    if (!items.length) {
      el.vehicleList.innerHTML = '<div class="empty-state">没有 QnA 资料</div>';
      return;
    }
    const list = document.createElement("div");
    list.className = "qna-list";
    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "qna-item";
      const answerLines = (item.answers || []).join("\n").split(/\n|(?=【\d+】)/).map((line) => line.trim()).filter(Boolean);
      card.innerHTML = `
        <div class="qna-set">
          <h3>${escapeHtml(item.question || "未填写问题")}</h3>
          <div class="qna-answer-lines">
            ${(answerLines.length ? answerLines : ["未填写答案"]).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
          </div>
        </div>
      `;
      list.appendChild(card);
    });
    el.vehicleList.appendChild(list);
  }

  function parseOverview(csv) {
    const rows = parseCsv(csv);
    const headers = rows[0] || [];
    const indexes = {
      plate: headers.findIndex((item) => /^plat$/i.test(clean(item))),
      car: headers.findIndex((item) => /^car$/i.test(clean(item))),
      branch: headers.findIndex((item) => /^branch$/i.test(clean(item))),
      owner: headers.findIndex((item) => /^owner$/i.test(clean(item))),
      lastService: headers.findIndex((item) => /^last service$/i.test(clean(item))),
      nextService: headers.findIndex((item) => /^next service$/i.test(clean(item))),
    };

    rows.slice(1).forEach((row) => {
      const plate = row[indexes.plate];
      if (!isVehiclePlate(plate)) return;
      rememberVehicle({
        key: normalizePlate(plate),
        plate: displayPlate(plate),
        car: clean(row[indexes.car]),
        branch: normalizeBranch(row[indexes.branch]),
        owner: clean(row[indexes.owner]),
        driver: "",
        lastService: clean(row[indexes.lastService]),
        nextService: clean(row[indexes.nextService]),
        source: "Vehicle overview",
      });
    });
  }

  function formatMoney(value) {
    return Math.round(value).toLocaleString("en-MY");
  }

  function moneyHtml(value) {
    const amount = Number(value) > 0 ? Math.round(value).toLocaleString("en-MY") : "";
    return `<span class="money"><span>${amount}</span></span>`;
  }

  function shortCarName(value) {
    return clean(value).replace(/^(Toyota|Nissan|Perodua|Honda|Hyundai|Proton)\s+/i, "");
  }

  function serviceDateHtml(value) {
    const text = clean(value);
    const parts = parseServiceDate(text);
    const compact = parts
      ? `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`
      : text;
    return `<span class="service-date-full">${escapeHtml(text)}</span><span class="service-date-compact">${escapeHtml(compact)}</span>`;
  }

  function formatExpenseDate(expense) {
    return `${expense.year}年${String(expense.month).padStart(2, "0")}月`;
  }

  function monthLabel(year, month) {
    return `${year}年${String(month).padStart(2, "0")}月`;
  }

  function expenseDay(expense) {
    const match = clean(expense.description).match(/^(\d{1,2})(?:\D|$)/);
    const day = match ? Number(match[1]) : 0;
    return day >= 1 && day <= 31 ? day : 0;
  }

  function compareExpenseDateDesc(a, b) {
    return b.year - a.year || b.month - a.month || expenseDay(b) - expenseDay(a) || a.rowIndex - b.rowIndex || a.id.localeCompare(b.id);
  }

  function groupBy(items, keyFn) {
    return items.reduce((map, item) => {
      const key = keyFn(item);
      map.set(key, (map.get(key) || 0) + item.amount);
      return map;
    }, new Map());
  }

  function filteredExpenses() {
    return state.expenses.filter((expense) => {
      if (state.filters.year !== "all" && String(expense.year) !== state.filters.year) return false;
      if (state.filters.month !== "all" && String(expense.month) !== state.filters.month) return false;
      if (state.filters.branch !== "all" && expense.branch !== state.filters.branch) return false;
      if (state.filters.vehicle !== "all" && expense.vehicleKey !== state.filters.vehicle) return false;
      return true;
    });
  }

  function filteredServicePlans() {
    return state.servicePlans.filter((plan) => {
      if (state.filters.year !== "all" && String(plan.year) !== state.filters.year) return false;
      if (state.filters.month !== "all" && String(plan.month) !== state.filters.month) return false;
      if (state.filters.branch !== "all" && plan.branch !== state.filters.branch) return false;
      if (state.filters.vehicle !== "all" && plan.key !== state.filters.vehicle) return false;
      return true;
    });
  }

  function fillSelect(select, options, selected) {
    select.innerHTML = "";
    options.forEach((option) => {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      if (option.value === selected) node.selected = true;
      select.appendChild(node);
    });
  }

  function refreshFilters() {
    const years = [...new Set([...state.expenses.map((expense) => expense.year), ...state.servicePlans.map((plan) => plan.year)])].sort((a, b) => b - a);
    const currentYear = String(new Date().getFullYear());
    if (!years.includes(Number(currentYear))) state.filters.year = "all";
    const branches = ["Viva", "Pandan", "Perkasa"];
    const vehicles = [...state.vehicles.values()]
      .filter((vehicle) => state.filters.branch === "all" || vehicle.branch === state.filters.branch)
      .sort((a, b) => a.plate.localeCompare(b.plate));

    fillSelect(
      el.yearFilter,
      [{ value: "all", label: "全部" }, ...years.map((year) => ({ value: String(year), label: `${year}` }))],
      state.filters.year,
    );
    fillSelect(
      el.monthFilter,
      [{ value: "all", label: "全部" }, ...MONTH_LABELS.map((label, index) => ({ value: String(index + 1), label }))],
      state.filters.month,
    );
    fillSelect(
      el.branchFilter,
      [{ value: "all", label: "全部" }, ...branches.map((branch) => ({ value: branch, label: branch.toUpperCase() }))],
      state.filters.branch,
    );
    if (state.filters.vehicle !== "all" && !vehicles.some((vehicle) => vehicle.key === state.filters.vehicle)) {
      state.filters.vehicle = "all";
    }
    fillSelect(
      el.vehicleFilter,
      [{ value: "all", label: "全部" }, ...vehicles.map((vehicle) => ({ value: vehicle.key, label: `${vehicle.plate} ${vehicle.car || ""}`.trim() }))],
      state.filters.vehicle,
    );
  }

  function chartData(items) {
    if (state.view === "service-month") {
      return [...items.reduce((map, plan) => {
        const key = plan.monthKey;
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map())]
        .map(([key, count]) => {
          const [year, month] = key.split("-");
          return { label: monthLabel(Number(year), Number(month)), amount: count, valueHtml: `${count} 辆`, order: key };
        })
        .sort((a, b) => a.order.localeCompare(b.order));
    }

    if (state.view === "year") {
      return [...groupBy(items, (item) => String(item.year))]
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => b.label.localeCompare(a.label));
    }

    if (state.view === "vehicle") {
      return [...groupBy(items, (item) => item.vehicleKey)]
        .map(([key, amount]) => {
          const vehicle = state.vehicles.get(key);
          return {
            label: vehicle?.plate || key,
            car: clean(vehicle?.car || ""),
            amount,
          };
        })
        .sort((a, b) => b.amount - a.amount);
    }

    return [...groupBy(items, (item) => item.monthKey)]
      .map(([key, amount]) => {
        const [year, month] = key.split("-");
        return { label: monthLabel(Number(year), Number(month)), amount, order: key };
      })
      .sort((a, b) => b.order.localeCompare(a.order));
  }

  function renderChart(items) {
    if (state.view === "qna" || state.view === "progress") {
      el.chartPanel?.classList.add("hidden");
      return;
    }
    el.chartPanel?.classList.remove("hidden");
    if (state.view === "service-mileage") {
      el.chartTitle.textContent = "剩余里数排序";
      el.barChart.innerHTML = '<div class="empty-state">按剩余里数由少到多排列</div>';
      return;
    }
    const data = chartData(items);
    const max = Math.max(...data.map((item) => item.amount), 1);
    const titles = { month: "按月花费", year: "按年花费", vehicle: "按车辆花费", "service-month": "月份保养", "service-mileage": "里数保养" };
    el.chartTitle.textContent = titles[state.view];
    el.barChart.innerHTML = "";

    if (!data.length) {
      el.barChart.innerHTML = '<div class="empty-state">没有符合筛选的费用记录</div>';
      return;
    }

    data.forEach((item) => {
      const row = document.createElement("div");
      row.className = `bar-row${state.view === "vehicle" ? " vehicle-bar-row" : ""}`;
      const labelHtml = state.view === "vehicle"
        ? `<span class="bar-label" title="${escapeHtml(`${item.label} ${item.car || ""}`.trim())}"><span class="bar-plate">${item.label}</span><span class="bar-car">${shortCarName(item.car) || ""}</span></span>`
        : `<span class="bar-label" title="${item.label}">${item.label}</span>`;
      row.innerHTML = `
        ${labelHtml}
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(5, (item.amount / max) * 100)}%"></span></span>
        <span class="bar-value">${item.valueHtml || moneyHtml(item.amount)}</span>
      `;
      el.barChart.appendChild(row);
    });
  }

  function renderVehicleList(items) {
    el.detailTitle.textContent = "车辆明细";
    const byVehicle = new Map();
    items.forEach((expense) => {
      if (!byVehicle.has(expense.vehicleKey)) byVehicle.set(expense.vehicleKey, []);
      byVehicle.get(expense.vehicleKey).push(expense);
    });

    const groups = [...byVehicle.entries()]
      .map(([key, expenses]) => ({
        vehicle: state.vehicles.get(key) || expenses[0],
        expenses: [...expenses].sort(compareExpenseDateDesc),
        total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      }))
      .sort((a, b) => b.total - a.total);

    el.vehicleList.innerHTML = "";
    el.listHint.textContent = `${groups.length} 辆`;

    if (!groups.length) {
      el.vehicleList.innerHTML = '<div class="empty-state">没有车辆明细</div>';
      return;
    }

    groups.forEach((group) => {
      const card = document.createElement("article");
      card.className = "vehicle-card";
      const responsible = group.vehicle.driver;
      const subtitle = [group.vehicle.branch, responsible, group.vehicle.serviceMonth].filter(Boolean).join(" · ");
      const seenDates = new Set();
      const details = group.expenses
        .slice(0, 4)
        .map((expense) => {
          const date = formatExpenseDate(expense);
          const dateLabel = seenDates.has(date) ? "" : date;
          seenDates.add(date);
          return `
            <div class="detail-item">
              <b>${dateLabel}</b>
              <span>${expense.description}</span>
              <b>${moneyHtml(expense.amount)}</b>
            </div>
          `;
        })
        .join("");

      card.innerHTML = `
        <div class="vehicle-main">
          <div>
            <strong>${group.vehicle.plate}${group.vehicle.car ? ` · ${shortCarName(group.vehicle.car)}` : ""}</strong>
            <span>${subtitle || "车辆资料待补"}</span>
          </div>
          <div class="amount">${moneyHtml(group.total)}</div>
        </div>
        <div class="detail-list">${details}</div>
      `;
      el.vehicleList.appendChild(card);
    });
  }

  function monthGroupTitle(key) {
    const [year, month] = key.split("-");
    const monthText = MONTH_LABELS[Number(month) - 1];
    return state.view.startsWith("service-") || state.filters.year === "all" ? `${year}年${String(month).padStart(2, "0")}月` : `${String(month).padStart(2, "0")}月`;
  }

  function renderMonthRecords(items) {
    el.detailTitle.textContent = "月份记录";
    el.vehicleList.innerHTML = "";

    const byMonth = new Map();
    [...items].sort(compareExpenseDateDesc).forEach((expense) => {
      if (!byMonth.has(expense.monthKey)) byMonth.set(expense.monthKey, []);
      byMonth.get(expense.monthKey).push(expense);
    });

    const groups = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    el.listHint.textContent = `${items.length} 条`;

    if (!groups.length) {
      el.vehicleList.innerHTML = '<div class="empty-state">没有账单记录</div>';
      return;
    }

    let previousYear = "";
    groups.forEach(([key, expenses]) => {
      const section = document.createElement("article");
      section.className = "month-record-card";
      const currentYear = key.split("-")[0];
      if (previousYear && previousYear !== currentYear) section.classList.add("year-break");
      previousYear = currentYear;
      const rows = expenses
        .sort((a, b) => expenseDay(a) - expenseDay(b) || a.rowIndex - b.rowIndex)
        .map((expense) => {
          const vehicle = state.vehicles.get(expense.vehicleKey) || expense;
          const plate = vehicle.plate || expense.plate || "";
          const day = expenseDay(expense);
          const content = expense.description.replace(/^\d{1,2}\s*/, "");
          return `
            <div class="month-record-row">
              <b class="record-date">${day ? String(day).padStart(2, "0") : ""}</b>
              <b class="record-plate">${plate}</b>
              <span>${content}</span>
              <b>${moneyHtml(expense.amount)}</b>
            </div>
          `;
        })
        .join("");

      section.innerHTML = `
        <h3>${monthGroupTitle(key)}</h3>
        <div class="month-record-list">${rows}</div>
      `;
      el.vehicleList.appendChild(section);
    });
  }

  function renderServicePlans(plans) {
    el.detailTitle.textContent = "预计保养";
    el.vehicleList.innerHTML = "";

    const byMonth = new Map();
    [...plans]
      .sort((a, b) => a.year - b.year || a.month - b.month || a.branch.localeCompare(b.branch) || a.plate.localeCompare(b.plate))
      .forEach((plan) => {
        if (!byMonth.has(plan.monthKey)) byMonth.set(plan.monthKey, []);
        byMonth.get(plan.monthKey).push(plan);
      });

    const groups = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    el.listHint.textContent = `${plans.length} 辆`;

    if (!groups.length) {
      el.vehicleList.innerHTML = '<div class="empty-state">没有预计保养记录</div>';
      return;
    }

    let previousYear = "";
    groups.forEach(([key, groupPlans]) => {
      const section = document.createElement("article");
      section.className = "service-plan-card";
      const currentYear = key.split("-")[0];
      if (previousYear && previousYear !== currentYear) section.classList.add("year-break");
      previousYear = currentYear;
      const rows = groupPlans
        .map((plan) => {
          return `
            <div class="service-plan-row">
              <b class="service-plate">${plan.plate}</b>
              <span class="service-branch">${plan.branch?.toUpperCase() || ""}</span>
              <span class="service-car">${escapeHtml(plan.car || "")}</span>
              <span class="service-date">${serviceDateHtml(plan.lastService)}</span>
            </div>
          `;
        })
        .join("");

      section.innerHTML = `
        <h3>${monthGroupTitle(key)}</h3>
        <div class="service-plan-list">${rows}</div>
      `;
      el.vehicleList.appendChild(section);
    });
  }

  function renderMileagePlans(plans, append = false) {
    el.detailTitle.textContent = "预计保养";
    if (!append) el.vehicleList.innerHTML = "";
    el.listHint.textContent = `${plans.length} 辆`;
    if (!plans.length) {
      el.vehicleList.innerHTML = '<div class="empty-state">没有剩余里数资料</div>';
      return;
    }
    const list = document.createElement("div");
    list.className = "mileage-plan-list";
    const heading = document.createElement("h3");
    heading.className = "service-subheading";
    heading.textContent = "按剩余里数";
    el.vehicleList.appendChild(heading);
    [...plans].sort((a, b) => {
      if (a.mileage === null && b.mileage !== null) return 1;
      if (a.mileage !== null && b.mileage === null) return -1;
      return (a.mileage ?? 0) - (b.mileage ?? 0) || a.plate.localeCompare(b.plate);
    }).forEach((plan) => {
      const row = document.createElement("div");
      row.className = "mileage-plan-row";
      const mileageLabel = plan.mileage === null ? "未给信息" : plan.mileage.toLocaleString("en-MY");
      row.innerHTML = `<b>${plan.branch.toUpperCase()}</b><b>${plan.plate}</b><span>${escapeHtml(plan.car || "")}</span><strong>${mileageLabel}</strong>`;
      list.appendChild(row);
    });
    el.vehicleList.appendChild(list);
  }

  function render() {
    const isProgressView = state.view === "progress";
    const isQnaView = state.view === "qna";
    const isServiceView = state.view === "service-month" || state.view === "service-mileage";
    const isMileageView = state.view === "service-mileage";
    const items = isProgressView ? state.progress : isQnaView ? state.qna : isServiceView ? (isMileageView ? state.mileagePlans : filteredServicePlans()) : filteredExpenses();
    const total = isServiceView || isQnaView || isProgressView ? 0 : items.reduce((sum, expense) => sum + expense.amount, 0);
    const vehicles = new Set(items.map((item) => item.vehicleKey || item.key));

    el.progressLegend?.classList.toggle("hidden", !isProgressView);

    el.totalLabel.textContent = isProgressView ? "进度" : isQnaView ? "问题" : isServiceView ? "预计车辆" : "总花费";
    el.recordLabel.textContent = isProgressView ? "记录" : isQnaView ? "答案" : isServiceView ? "月份" : "记录";
    el.totalAmount.textContent = isProgressView ? `${items.length.toLocaleString("en-MY")} 条` : isQnaView ? `${items.length.toLocaleString("en-MY")} 条` : isServiceView ? `${items.length.toLocaleString("en-MY")} 辆` : formatMoney(total);
    el.vehicleCount.textContent = vehicles.size.toLocaleString("en-MY");
    el.recordCount.textContent = isProgressView || isQnaView ? "—" : isServiceView ? (isMileageView ? "—" : new Set(items.map((item) => item.monthKey)).size.toLocaleString("en-MY")) : items.length.toLocaleString("en-MY");
    el.lastUpdated.textContent = state.lastLoaded ? `更新 ${state.lastLoaded}` : "";
    renderChart(items);
    if (isProgressView) {
      renderProgress(items);
    } else if (isQnaView) {
      renderQna(items);
    } else if (isServiceView) {
      if (isMileageView) renderMileagePlans(items);
      else renderServicePlans(items);
    } else if (state.view === "month") {
      renderMonthRecords(items);
    } else {
      renderVehicleList(items);
    }
  }

  async function loadData() {
    el.statusText.textContent = "正在读取表格...";
    el.refreshButton.disabled = true;
    try {
      state.vehicles.clear();
      state.servicePlans = [];
      const [overviewCsv, servicePlanCsv, vivaCsv, pandanCsv, qnaCsv, progressCsv, ...sourceCsvs] = await Promise.all([loadCsv(OVERVIEW_GID), loadCsv(SERVICE_PLAN_SOURCE.gid), loadCsv(SOURCES[0].gid), loadCsv(SOURCES[1].gid), loadCsv(QNA_SOURCE.gid), loadCsv(PROGRESS_SOURCE.gid), ...SOURCES.map((source) => loadCsv(source.gid))]);
      parseOverview(overviewCsv);
      state.servicePlans = parseServicePlans(servicePlanCsv, SERVICE_PLAN_SOURCE);
      state.mileagePlans = [...parseMileagePlans(vivaCsv, SOURCES[0]), ...parseMileagePlans(pandanCsv, SOURCES[1])];
      state.qna = parseQna(qnaCsv);
      state.progress = parseProgress(progressCsv);
      state.expenses = sourceCsvs.flatMap((csv, index) => parseExpenseSheet(csv, SOURCES[index]));
      state.lastLoaded = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      el.statusText.textContent = `已读取 ${SOURCES.length} 张费用表、${state.servicePlans.length} 辆月份保养和 ${state.mileagePlans.length} 辆里数资料`;
      refreshFilters();
      render();
    } catch (error) {
      console.error(error);
      el.statusText.textContent = "无法读取 Google Sheet。请确认表格仍然开放链接读取，或稍后刷新。";
      state.expenses = [];
      render();
    } finally {
      el.refreshButton.disabled = false;
    }
  }

  el.refreshButton.addEventListener("click", loadData);
  el.yearFilter.addEventListener("change", (event) => {
    state.filters.year = event.target.value;
    render();
  });
  el.monthFilter.addEventListener("change", (event) => {
    state.filters.month = event.target.value;
    render();
  });
  el.branchFilter.addEventListener("change", (event) => {
    state.filters.branch = event.target.value;
    refreshFilters();
    render();
  });
  el.vehicleFilter.addEventListener("change", (event) => {
    state.filters.vehicle = event.target.value;
    render();
  });
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      el.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      render();
    });
  });


  // Remove older cached app workers so the live page always uses the
  // current HTML/CSS/JS and reads fresh Google Sheet data.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch(() => {});
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => {});
      }
    });
  }

  startApp();
})();
