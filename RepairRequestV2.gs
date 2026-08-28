/**
 * 새 수리 요청 화면 전용 접수 API입니다.
 * 기존 REQUEST_HEADERS와 공통 저장/이미지 헬퍼를 재사용하되,
 * 학생용 스마트기기일 때만 Google 계정 정보를 필수로 받습니다.
 */
function submitRepairRequest(payload) {
  validateRepairRequestV2_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getRequestsSheet_();
    const requestId = makeRequestId_();
    const now = new Date();
    const uploaded = saveImages_(payload, requestId);
    const isSmartDevice = Boolean(payload.isStudentSmartDevice);
    const row = {
      requestId: requestId,
      submittedAt: now,
      applicantType: payload.applicantType,
      teacherName: payload.applicantType === 'teacher' ? clean_(payload.teacherName) : '',
      teacherPhone: payload.applicantType === 'teacher' ? clean_(payload.teacherPhone) : '',
      studentNumber: payload.applicantType === 'student' ? clean_(payload.studentNumber) : '',
      studentName: payload.applicantType === 'student' ? clean_(payload.studentName) : '',
      studentGoogleId: isSmartDevice ? clean_(payload.studentGoogleId) : '',
      studentGooglePassword: isSmartDevice && CONFIG.STORE_SENSITIVE_DATA ? clean_(payload.studentGooglePassword) : '',
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

function validateRepairRequestV2_(payload) {
  if (!payload || (payload.applicantType !== 'teacher' && payload.applicantType !== 'student')) {
    throw new Error('신청자 유형을 선택해 주세요.');
  }

  const applicantRequired = payload.applicantType === 'teacher'
    ? ['teacherName', 'teacherPhone']
    : ['studentName', 'studentNumber'];
  applicantRequired.concat(['deviceModel', 'deviceNumber', 'lockType', 'symptoms']).forEach(function(key) {
    if (!clean_(payload[key])) throw new Error('필수 항목을 모두 입력해 주세요.');
  });

  const lockType = clean_(payload.lockType).toLowerCase();
  if (!Object.keys(LOCK_TYPES).some(function(key) { return LOCK_TYPES[key] === lockType; })) {
    throw new Error('기기 비밀번호 방식을 선택해 주세요.');
  }
  payload.lockType = lockType;

  if (payload.isStudentSmartDevice === true) {
    if (!clean_(payload.studentGoogleId) || !clean_(payload.studentGooglePassword)) {
      throw new Error('학생용 스마트기기의 구글 아이디와 비밀번호를 입력해 주세요.');
    }
  } else {
    payload.studentGoogleId = '';
    payload.studentGooglePassword = '';
  }

  if (lockType === LOCK_TYPES.pattern && !payload.patternImage) {
    throw new Error('패턴 사진을 첨부해 주세요.');
  }
  if (lockType === LOCK_TYPES.password && !clean_(payload.devicePassword)) {
    throw new Error('기기 비밀번호를 입력해 주세요.');
  }

  if (lockType === LOCK_TYPES.none) {
    payload.patternImage = '';
    payload.devicePassword = '';
  }
}
