/**
 * 디지털튜터 기기수리 요청 사이트 설정
 *
 * 1. SPREADSHEET_ID에 데이터를 저장할 구글 스프레드시트 ID를 입력합니다.
 * 2. 사진을 Drive에 저장하려면 DRIVE_FOLDER_ID를 입력합니다.
 *    비워두면 스프레드시트와 같은 계정의 내 드라이브에 자동 생성됩니다.
 */
const CONFIG = Object.freeze({
  APP_NAME: '디지털튜터 기기수리센터',
  SCHOOL_NAME: '디지털튜터 기기수리 요청',

  SPREADSHEET_ID: '1U3Bs6I5nnrv0CZOMWozcvm7RrbKeqwi_mx5DvROZyMs',
  REQUESTS_SHEET_NAME: 'Requests',
  ADMIN_USERS_SHEET_NAME: 'AdminUsers',
  DRIVE_FOLDER_ID: '',
  DRIVE_FOLDER_NAME: '디지털튜터 기기수리 사진',

  // 관리자 로그인 세션은 최대 6시간 유지됩니다.
  ADMIN_SESSION_TTL_SECONDS: 21600,
  ADMIN_PAGE_SIZE: 10,

  // Google 비밀번호와 기기 잠금 비밀번호를 저장해야 하는 경우 true로 바꿉니다.
  // 운영 전 학교 개인정보보호 담당자와 보관 기간·접근 권한을 반드시 확인하세요.
  STORE_SENSITIVE_DATA: true,

  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  REQUEST_ID_PREFIX: 'DTR',
  STATUSES: ['접수', '수리 진행 중', '수리 완료', '반려'],
  STATUS_COLORS: {
    '접수': '#2563eb',
    '수리 진행 중': '#d97706',
    '수리 완료': '#059669',
    '반려': '#dc2626'
  }
});
