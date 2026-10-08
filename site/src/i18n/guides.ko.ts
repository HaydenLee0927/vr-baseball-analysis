// "사용법" guides for each view (handoff section 7b): what it is for, a labeled example,
// how to use the filters, and questions it answers.

export interface Guide {
  title: string;
  purpose: string;
  example: string[];
  filters: string;
  questions: string[];
}

export const guides: Record<string, Guide> = {
  percentiles: {
    title: '백분위 막대 사용법',
    purpose: '같은 시즌 다른 선수들과 비교해 이 선수가 어느 정도인지 한눈에 보여 줍니다. 차팅 도구로 기록한 경기만 씁니다.',
    example: ['빨간색 = 리그 상위권, 파란색 = 하위권, 회색 = 중간', '동그라미 안 숫자 = 백분위 (90이면 상위 10%)', '오른쪽 숫자 = 실제 기록과 표본'],
    filters: '필터와 상관없이 시즌 전체 기록으로 계산합니다. 기준 표본(타석 또는 상대 타자)을 넘은 선수가 5명 이상일 때만 나옵니다.',
    questions: ['이 타자의 가장 큰 강점과 약점은?', '이 투수는 삼진형인가, 맞혀 잡는 형인가?'],
  },
  spray: {
    title: '타구 방향 차트 사용법',
    purpose: '타구가 어디로 갔는지 보여 줍니다. 수비 위치를 정할 때 씁니다.',
    example: [
      '점 모드: 점 하나 = 타구 하나 (주황 = 안타, 파랑 = 아웃, 초록 = 실책 등)',
      '구역 모드: 진할수록 그 수비수에게 간 타구가 많음, 숫자 = 비율',
      '구역은 처음 공을 잡은 수비수 기준입니다.',
    ],
    filters: '위쪽 필터로 투수 손, 볼카운트, 구속대별로 좁혀 볼 수 있습니다.',
    questions: ['이 타자는 어느 방향으로 많이 치나?', '땅볼은 당겨치고 뜬공은 밀어치나?'],
  },
  zone: {
    title: '존 차트 사용법',
    purpose: '스트라이크존을 9칸과 바깥 4구역으로 나눠, 칸마다 기록을 보여 줍니다. 포수 뒤에서 본 모습입니다.',
    example: ['가운데 9칸 = 스트라이크존, 바깥 네 귀퉁이 = 볼 구역', '진할수록 값이 큼', '마우스를 올리거나 누르면 표본 수가 나옵니다.'],
    filters: '보기 기준(투구 비율, 스윙률, 헛스윙률, 타율)을 바꿀 수 있고, 위쪽 필터도 적용됩니다.',
    questions: ['이 타자는 어느 코스에서 헛스윙이 많나?', '이 투수는 주로 어디로 던지나?'],
  },
  velo: {
    title: '구속 차트 사용법',
    purpose: '투수는 구속 분포와 이닝별 구속을, 타자는 구속대별 헛스윙률을 보여 줍니다.',
    example: ['막대 하나 = 구속 5km/h 구간', '이닝별 선 = 그 이닝 평균 구속 (떨어지면 체력 저하 신호)', '타자: 막대 위 숫자 = 헛스윙률, 아래 = 스윙 수'],
    filters: '위쪽 필터가 적용됩니다. 구속이 기록되지 않은 공은 빠집니다.',
    questions: ['이 타자는 빠른 공에 약한가?', '이 투수는 경기 후반에 구속이 떨어지나?'],
  },
};
