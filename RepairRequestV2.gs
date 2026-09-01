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
  applicantRequired.forEach(function(key) {
    if (!clean_(payload[key])) throw new Error('필수 항목을 모두 입력해 주세요.');
  });

  const name = payload.applicantType === 'teacher' ? clean_(payload.teacherName) : clean_(payload.studentName);
  if (!/^[가-힣A-Za-z][가-힣A-Za-z .'-]{1,19}$/.test(name)) {
    throw new Error('이름은 한글 또는 영문으로 2~20자 입력해 주세요.');
  }

  if (payload.applicantType === 'teacher') {
    const phone = clean_(payload.teacherPhone).replace(/\s/g, '');
    if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(phone)) {
      throw new Error('올바른 휴대전화 번호를 입력해 주세요. 예: 010-1234-5678');
    }
  } else {
    const studentNumber = clean_(payload.studentNumber);
    if (!/^\d{4,10}$/.test(studentNumber)) {
      throw new Error('학번은 숫자 4~10자리로 입력해 주세요.');
  }
  }

  const deviceModel = clean_(payload.deviceModel);
  const deviceNumber = clean_(payload.deviceNumber);
  const symptoms = clean_(payload.symptoms);
  const referenceNotes = clean_(payload.referenceNotes);
  if (deviceModel.length < 2 || deviceModel.length > 100) throw new Error('기기명은 2~100자로 입력해 주세요.');
  if (deviceNumber.length < 3 || deviceNumber.length > 100) throw new Error('제조번호는 3~100자로 입력해 주세요.');
  if (symptoms.length < 5 || symptoms.length > 2000) throw new Error('증상은 5~2000자로 입력해 주세요.');
  if (referenceNotes.length > 1000) throw new Error('참고사항은 1000자 이내로 입력해 주세요.');

  if (payload.isStudentSmartDevice === true) {
    const studentGoogleId = clean_(payload.studentGoogleId);
    const studentGooglePassword = clean_(payload.studentGooglePassword);
    if (!studentGoogleId || !studentGooglePassword) {
      throw new Error('학생용 스마트기기의 구글 아이디와 비밀번호를 입력해 주세요.');
    }
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,63})@gmail\.com$/i.test(studentGoogleId)) {
      throw new Error('구글 아이디는 @gmail.com 형식으로 입력해 주세요.');
    }
    if (studentGooglePassword.length < 4 || studentGooglePassword.length > 128) {
      throw new Error('구글 비밀번호는 4~128자로 입력해 주세요.');
    }
  } else {
    payload.studentGoogleId = '';
    payload.studentGooglePassword = '';
  }

  const lockType = clean_(payload.lockType).toLowerCase();
  if (!Object.keys(LOCK_TYPES).some(function(key) { return LOCK_TYPES[key] === lockType; })) {
    throw new Error('기기 잠금 방식을 선택해 주세요.');
  }
  payload.lockType = lockType;

  if (lockType === LOCK_TYPES.pattern && !payload.patternImage) {
    throw new Error('패턴 사진을 첨부해 주세요.');
  }
  if (lockType === LOCK_TYPES.password) {
    const devicePassword = String(payload.devicePassword || '');
    if (devicePassword.length < 4 || devicePassword.length > 128) {
      throw new Error('기기 잠금 비밀번호는 4~128자로 입력해 주세요.');
    }
  }

  if (lockType === LOCK_TYPES.none) {
    payload.patternImage = '';
    payload.devicePassword = '';
  }
}
