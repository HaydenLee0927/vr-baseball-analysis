// All scouting-site UI strings. Never hardcode UI text in components.
export const ko = {
  siteName: 'VR Savant',
  gate: {
    title: '비밀번호를 입력하세요',
    description: '이 사이트는 비밀번호를 아는 사람만 볼 수 있습니다.',
    passwordLabel: '비밀번호',
    remember: '이 기기에서 기억하기',
    submit: '들어가기',
    checking: '확인 중…',
    wrongPassword: '비밀번호가 틀렸습니다.',
    loadError: '데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.',
  },
  common: {
    loading: '불러오는 중…',
    lock: '잠그기',
  },
  home: {
    title: '스카우팅 홈',
    placeholder: '준비 중입니다. 선수 검색과 리더보드가 곧 추가됩니다.',
    builtAt: '데이터 갱신',
  },
} as const;
