const REQUEST_HEADERS = [
  'requestId', 'submittedAt', 'applicantType',
  'teacherName', 'teacherPhone',
  'studentNumber', 'studentName', 'studentGoogleId', 'studentGooglePassword',
  'deviceModel', 'deviceNumber', 'lockType', 'devicePassword',
  'symptoms', 'referenceNotes', 'patternImageUrl', 'additionalImageUrls',
  'status', 'rejectionReason', 'updatedAt'
];
const ADMIN_HEADERS = ['username', 'password', 'displayName', 'isActive'];
const ADMIN_SESSION_PROPERTY = 'dtr_admin_sessions';
const LOCK_TYPES = Object.freeze({ pattern: 'pattern', password: 'password', none: 'none' });

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CONFIG.APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** 최초 1회 실행하거나, 시트를 다시 준비할 때 실행합니다. */
function setup() {
  const sheet = getRawRequestsSheet_();
  initializeRequestsSheet_(sheet);
  const adminSheet = getRawAdminUsersSheet_();
  initializeAdminUsersSheet_(adminSheet);
  return 'Requests 및 AdminUsers 시트가 준비되었습니다.';
}

function initializeRequestsSheet_(sheet) {
  sheet.getRange(1, 1, 1, REQUEST_HEADERS.length).setValues([REQUEST_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, REQUEST_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#e8eef9');
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), REQUEST_HEADERS.length).createFilter();

  const statusColumn = REQUEST_HEADERS.indexOf('status') + 1;
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.STATUSES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, statusColumn, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(statusRule);
  sheet.autoResizeColumns(1, REQUEST_HEADERS.length);
}

function initializeAdminUsersSheet_(sheet) {
  sheet.getRange(1, 1, 1, ADMIN_HEADERS.length).setValues([ADMIN_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, ADMIN_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#fef3c7');
  sheet.autoResizeColumns(1, ADMIN_HEADERS.length);
}

function getPublicConfig() {
  return {
    appName: CONFIG.APP_NAME,
    schoolName: CONFIG.SCHOOL_NAME,
    statuses: CONFIG.STATUSES,
    statusColors: CONFIG.STATUS_COLORS,
    maxImageBytes: CONFIG.MAX_IMAGE_BYTES,
    allowedImageTypes: CONFIG.ALLOWED_IMAGE_TYPES,
    storeSensitiveData: CONFIG.STORE_SENSITIVE_DATA,
    adminPageSize: CONFIG.ADMIN_PAGE_SIZE
  };
}

function submitRequest(payload) {
  validatePayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getRequestsSheet_();
    const requestId = makeRequestId_();
    const now = new Date();
    const uploaded = saveImages_(payload, requestId);
    const row = {
      requestId: requestId,
      submittedAt: now,
      applicantType: payload.applicantType,
      teacherName: payload.applicantType === 'teacher' ? clean_(payload.teacherName) : '',
      teacherPhone: payload.applicantType === 'teacher' ? clean_(payload.teacherPhone) : '',
      studentNumber: payload.applicantType === 'student' ? clean_(payload.studentNumber) : '',
      studentName: payload.applicantType === 'student' ? clean_(payload.studentName) : '',
      studentGoogleId: payload.applicantType === 'student' ? clean_(payload.studentGoogleId) : '',
      studentGooglePassword: payload.applicantType === 'student' && CONFIG.STORE_SENSITIVE_DATA ? clean_(payload.studentGooglePassword) : '',
      deviceModel: clean_(payload.deviceModel),
      deviceNumber: clean_(payload.deviceNumber),
      lockType: payload.lockType,
      devicePassword: CONFIG.STORE_SENSITIVE_DATA && payload.lockType === LOCK_TYPES.password ? clean_(payload.devicePassword) : '',
      symptoms: clean_(payload.symptoms),
      referenceNotes: clean_(payload.referenceNotes),
      patternImageUrl: uploaded.patternImageUrl,
      additionalImageUrls: uploaded.additionalImageUrls,
      status: '접수',
      rejectionReason: '',
      updatedAt: now
    };
    sheet.appendRow(REQUEST_HEADERS.map(function(header) { return row[header] || ''; }));
    return { success: true, requestId: requestId, submittedAt: formatDate_(now) };
  } finally {
    lock.releaseLock();
  }
}

function findMyRequests(query) {
  const applicantType = query && query.applicantType;
  if (applicantType !== 'teacher' && applicantType !== 'student') {
    throw new Error('신청자 유형을 선택해 주세요.');
  }
  const sheet = getRequestsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const index = headerIndex_(values[0]);
  const normalizedQuery = normalizeQuery_(query, applicantType);
  return values.slice(1)
    .filter(function(row) {
      if (!row[index.status] && !row[index.requestId]) return false;
      if (String(row[index.applicantType]) !== applicantType) return false;
      if (applicantType === 'teacher') {
        return clean_(row[index.teacherName]) === normalizedQuery.name &&
          normalizePhone_(row[index.teacherPhone]) === normalizedQuery.phone;
      }
      return clean_(row[index.studentNumber]) === normalizedQuery.studentNumber &&
        clean_(row[index.studentName]) === normalizedQuery.name;
    })
    .map(function(row) { return toPublicRequest_(row, index); })
    .sort(function(a, b) { return b.submittedAtTimestamp - a.submittedAtTimestamp; });
}

/** AdminUsers 시트에 등록된 계정으로 관리자 세션을 발급합니다. */
function adminLogin(credentials) {
  const username = clean_(credentials && credentials.username);
  const password = clean_(credentials && credentials.password);
  if (!username || !password) throw new Error('아이디와 비밀번호를 입력해 주세요.');

  const sheet = getAdminUsersSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const index = headerIndex_(values[0] || []);
  const matched = values.slice(1).find(function(row) {
    return isActiveAdmin_(row[index.isActive]) &&
      clean_(row[index.username]) === username &&
      clean_(row[index.password]) === password;
  });
  if (!matched) throw new Error('관리자 아이디 또는 비밀번호가 올바르지 않습니다.');

  const token = Utilities.getUuid();
  const sessions = pruneAdminSessions_(getAdminSessions_());
  sessions[token] = {
    username: username,
    expiresAt: Date.now() + CONFIG.ADMIN_SESSION_TTL_SECONDS * 1000
  };
  saveAdminSessions_(sessions);

  return {
    success: true,
    token: token,
    displayName: clean_(matched[index.displayName]) || username
  };
}

function adminLogout(token) {
  if (!token) return { success: true };
  const sessions = getAdminSessions_();
  if (sessions[token]) {
    delete sessions[token];
    saveAdminSessions_(sessions);
  }
  return { success: true };
}

function getAdminRequests(token, filter) {
  requireAdminSession_(token);
  const sheet = getRequestsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { requests: [], stats: emptyAdminStats_() };
  const index = headerIndex_(values[0]);
  const statusFilter = clean_(filter && filter.status);
  const search = clean_(filter && filter.search).toLowerCase();
  const requests = values.slice(1)
    .filter(function(row) { return row[index.requestId] || row[index.status]; })
    .map(function(row) { return toAdminRequest_(row, index); })
    .filter(function(item) {
      const matchesStatus = !statusFilter || item.status === statusFilter;
      const searchable = [item.requestId, item.teacherName, item.teacherPhone, item.studentNumber,
        item.studentName, item.deviceModel, item.deviceNumber, item.symptoms].join(' ').toLowerCase();
      return matchesStatus && (!search || searchable.indexOf(search) !== -1);
    })
    .sort(function(a, b) { return b.submittedAtTimestamp - a.submittedAtTimestamp; });
  const allStatuses = values.slice(1)
    .filter(function(row) { return row[index.requestId] || row[index.status]; })
    .map(function(row) { return String(row[index.status] || '접수'); });
  const stats = emptyAdminStats_();
  stats.total = allStatuses.length;
  allStatuses.forEach(function(status) {
    if (stats.byStatus.hasOwnProperty(status)) stats.byStatus[status] += 1;
  });
  return { requests: requests, stats: stats };
}

function updateRequestStatus(token, requestId, status, rejectionReason) {
  requireAdminSession_(token);
  const normalizedId = clean_(requestId);
  const normalizedStatus = clean_(status);
  if (!normalizedId || CONFIG.STATUSES.indexOf(normalizedStatus) === -1) {
    throw new Error('요청 번호 또는 상태가 올바르지 않습니다.');
  }
  const reason = clean_(rejectionReason);
  if (normalizedStatus === '반려' && !reason) throw new Error('반려 사유를 입력해 주세요.');

  const sheet = getRequestsSheet_();
  const values = sheet.getDataRange().getValues();
  const index = headerIndex_(values[0] || []);
  let rowNumber = -1;
  for (let i = 1; i < values.length; i += 1) {
    if (clean_(values[i][index.requestId]) === normalizedId) {
      rowNumber = i + 1;
      break;
    }
  }
  if (rowNumber < 0) throw new Error('해당 신청을 찾을 수 없습니다.');
  const now = new Date();
  sheet.getRange(rowNumber, index.status + 1).setValue(normalizedStatus);
  sheet.getRange(rowNumber, index.rejectionReason + 1).setValue(normalizedStatus === '반려' ? reason : '');
  sheet.getRange(rowNumber, index.updatedAt + 1).setValue(now);
  return { success: true, requestId: normalizedId, status: normalizedStatus, updatedAt: formatDate_(now) };
}

function getRequestsSheet_() {
  assertConfig_();
  const sheet = getRawRequestsSheet_();
  if (sheet.getLastRow() === 0) initializeRequestsSheet_(sheet);
  return sheet;
}

function getRawRequestsSheet_() {
  assertConfig_();
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.REQUESTS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.REQUESTS_SHEET_NAME);
  return sheet;
}

function getAdminUsersSheet_() {
  const sheet = getRawAdminUsersSheet_();
  if (sheet.getLastRow() === 0) initializeAdminUsersSheet_(sheet);
  return sheet;
}

function getRawAdminUsersSheet_() {
  assertConfig_();
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.ADMIN_USERS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.ADMIN_USERS_SHEET_NAME);
  return sheet;
}

function getAdminSessions_() {
  const properties = PropertiesService.getScriptProperties();
  const raw = properties.getProperty(ADMIN_SESSION_PROPERTY);
  if (!raw) return {};
  try {
    const sessions = JSON.parse(raw);
    return sessions && typeof sessions === 'object' ? sessions : {};
  } catch (error) {
    properties.deleteProperty(ADMIN_SESSION_PROPERTY);
    return {};
  }
}

function saveAdminSessions_(sessions) {
  PropertiesService.getScriptProperties().setProperty(ADMIN_SESSION_PROPERTY, JSON.stringify(sessions));
}

function pruneAdminSessions_(sessions) {
  const now = Date.now();
  Object.keys(sessions).forEach(function(token) {
    const session = sessions[token];
    if (!session || !session.expiresAt || Number(session.expiresAt) <= now) delete sessions[token];
  });
  return sessions;
}

function requireAdminSession_(token) {
  if (!token) throw new Error('관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.');
  const sessions = getAdminSessions_();
  const session = sessions[token];
  if (!session || !session.expiresAt || Number(session.expiresAt) <= Date.now()) {
    if (session) {
      delete sessions[token];
      saveAdminSessions_(sessions);
    }
    throw new Error('관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
}

function isActiveAdmin_(value) {
  return ['true', '1', 'y', 'yes', '예', '활성'].indexOf(clean_(value).toLowerCase()) !== -1;
}

function emptyAdminStats_() {
  const byStatus = {};
  CONFIG.STATUSES.forEach(function(status) { byStatus[status] = 0; });
  return { total: 0, byStatus: byStatus };
}

function assertConfig_() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.indexOf('여기에_') === 0) {
    throw new Error('Config.gs의 SPREADSHEET_ID를 먼저 설정해 주세요.');
  }
}

function saveImages_(payload, requestId) {
  const result = { patternImageUrl: '', additionalImageUrls: '' };
  const images = [];
  if (payload.lockType === LOCK_TYPES.pattern && payload.patternImage) {
    images.push({ data: payload.patternImage, prefix: 'pattern' });
  }
  (payload.additionalImages || []).forEach(function(image, i) {
    images.push({ data: image, prefix: 'additional-' + (i + 1) });
  });
  if (!images.length) return result;
  const folder = getImageFolder_();
  const urls = images.map(function(item) {
    const blob = dataUrlToBlob_(item.data, requestId + '-' + item.prefix);
    return folder.createFile(blob).getUrl();
  });
  if (payload.lockType === LOCK_TYPES.pattern && payload.patternImage) {
    result.patternImageUrl = urls.shift();
  }
  result.additionalImageUrls = urls.join('\n');
  return result;
}

function getImageFolder_() {
  if (CONFIG.DRIVE_FOLDER_ID) return DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
}

function dataUrlToBlob_(dataUrl, filename) {
  if (typeof dataUrl !== 'string') throw new Error('이미지 데이터가 올바르지 않습니다.');
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match || CONFIG.ALLOWED_IMAGE_TYPES.indexOf(match[1]) === -1) throw new Error('지원하지 않는 이미지 형식입니다.');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > CONFIG.MAX_IMAGE_BYTES) throw new Error('이미지 1장의 용량은 5MB 이하로 올려 주세요.');
  return Utilities.newBlob(bytes, match[1], filename + '.' + match[1].split('/')[1]);
}

function validatePayload_(payload) {
  if (!payload || (payload.applicantType !== 'teacher' && payload.applicantType !== 'student')) {
    throw new Error('신청자 유형을 선택해 주세요.');
  }

  const required = payload.applicantType === 'teacher'
    ? ['teacherName', 'teacherPhone']
    : ['studentNumber', 'studentName', 'studentGoogleId', 'studentGooglePassword'];
  required.concat(['deviceModel', 'deviceNumber', 'lockType', 'symptoms']).forEach(function(key) {
    if (!clean_(payload[key])) throw new Error('필수 항목을 모두 입력해 주세요.');
  });

  const lockType = clean_(payload.lockType).toLowerCase();
  if (!Object.keys(LOCK_TYPES).some(function(key) { return LOCK_TYPES[key] === lockType; })) {
    throw new Error('기기 잠금 방식을 선택해 주세요.');
  }
  payload.lockType = lockType;

  if (lockType === LOCK_TYPES.pattern && !payload.patternImage) {
    throw new Error('패턴 사진을 첨부해 주세요.');
  }
  if (lockType === LOCK_TYPES.password && !clean_(payload.devicePassword)) {
    throw new Error('기기 잠금 비밀번호를 입력해 주세요.');
  }

  // 잠금 없음에서는 이전에 입력했던 패턴/비밀번호가 남아 있어도 저장하지 않습니다.
  if (lockType === LOCK_TYPES.none) {
    payload.patternImage = '';
    payload.devicePassword = '';
  }
}

function normalizeQuery_(query, type) {
  if (type === 'teacher') {
    if (!clean_(query.teacherName) || !clean_(query.teacherPhone)) throw new Error('이름과 연락처를 입력해 주세요.');
    return { name: clean_(query.teacherName), phone: normalizePhone_(query.teacherPhone) };
  }
  if (!clean_(query.studentNumber) || !clean_(query.studentName)) throw new Error('학번과 이름을 입력해 주세요.');
  return { studentNumber: clean_(query.studentNumber), name: clean_(query.studentName) };
}

function toPublicRequest_(row, index) {
  const submittedAt = row[index.submittedAt] instanceof Date ? row[index.submittedAt] : new Date(row[index.submittedAt]);
  return {
    requestId: String(row[index.requestId] || ''),
    submittedAt: formatDate_(submittedAt),
    submittedAtTimestamp: submittedAt.getTime(),
    applicantType: String(row[index.applicantType] || ''),
    applicantName: String(row[index.applicantType] === 'teacher' ? row[index.teacherName] : row[index.studentName] || ''),
    deviceModel: String(row[index.deviceModel] || ''),
    deviceNumber: maskDeviceNumber_(String(row[index.deviceNumber] || '')),
    symptoms: String(row[index.symptoms] || ''),
    status: CONFIG.STATUSES.indexOf(String(row[index.status])) >= 0 ? String(row[index.status]) : '접수',
    rejectionReason: String(row[index.rejectionReason] || ''),
    updatedAt: row[index.updatedAt] ? formatDate_(new Date(row[index.updatedAt])) : '',
    patternImageUrl: String(row[index.patternImageUrl] || '')
  };
}

function toAdminRequest_(row, index) {
  const submittedAt = row[index.submittedAt] instanceof Date ? row[index.submittedAt] : new Date(row[index.submittedAt]);
  const updatedAt = row[index.updatedAt] ? new Date(row[index.updatedAt]) : submittedAt;
  return {
    requestId: String(row[index.requestId] || ''),
    submittedAt: formatDate_(submittedAt),
    submittedAtTimestamp: submittedAt.getTime(),
    applicantType: String(row[index.applicantType] || ''),
    teacherName: String(row[index.teacherName] || ''),
    teacherPhone: String(row[index.teacherPhone] || ''),
    studentNumber: String(row[index.studentNumber] || ''),
    studentName: String(row[index.studentName] || ''),
    studentGoogleId: String(row[index.studentGoogleId] || ''),
    studentGooglePassword: String(row[index.studentGooglePassword] || ''),
    deviceModel: String(row[index.deviceModel] || ''),
    deviceNumber: String(row[index.deviceNumber] || ''),
    lockType: String(row[index.lockType] || ''),
    devicePassword: String(row[index.devicePassword] || ''),
    symptoms: String(row[index.symptoms] || ''),
    referenceNotes: String(row[index.referenceNotes] || ''),
    patternImageUrl: String(row[index.patternImageUrl] || ''),
    additionalImageUrls: String(row[index.additionalImageUrls] || '').split('\n').filter(Boolean),
    status: CONFIG.STATUSES.indexOf(String(row[index.status])) >= 0 ? String(row[index.status]) : '접수',
    rejectionReason: String(row[index.rejectionReason] || ''),
    updatedAt: formatDate_(updatedAt)
  };
}

function headerIndex_(headers) {
  const index = {};
  headers.forEach(function(header, i) { index[header] = i; });
  return index;
}

function makeRequestId_() {
  return CONFIG.REQUEST_ID_PREFIX + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy.MM.dd HH:mm');
}

function normalizePhone_(value) { return clean_(value).replace(/[^0-9]/g, ''); }
function clean_(value) { return String(value == null ? '' : value).trim(); }
function maskDeviceNumber_(value) { return value.length > 4 ? '••••' + value.slice(-4) : value; }
