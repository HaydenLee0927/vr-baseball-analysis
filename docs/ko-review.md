# Korean wording to review

Terms Claude Code was unsure about while writing the scouting site's Korean text (handoff section 7a). The owner or coach should read every screen once before M7 closes; change wording in `site/src/i18n/ko.ts` (UI) or `site/src/i18n/glossary.ko.ts` (stat names and help).

| Where | Current Korean | Meaning | Why unsure / alternatives |
|---|---|---|---|
| Stat label | 존 밖 스윙% (존 밖 스윙률, O-Swing%) | swings at pitches outside the zone ("chase rate") | STATIZ shows `O-Swing%` as is; broadcasts often say 유인구 스윙률 or 볼 스윙률. |
| Stat label | 존 스윙% (존 안 스윙률, Z-Swing%) | swings at pitches in the zone | Could be `Z-Swing%` only. |
| Stat label | 루킹 스트% (루킹 스트라이크 비율) | called strikes / pitches | Short label is clipped; 루킹 스트라이크% may read better. |
| Stat label | 강한 타구% | hard contact, as judged by the charter | Not measured exit velocity; 잘 맞은 타구% might be clearer. |
| Stat label | RA9 (9이닝당 실점) | runs allowed per 9 innings, used instead of ERA | Earned runs are not charted, so 평균자책점 would be wrong. Check fans understand RA9. |
| Stat label | 상대 투구 | pitches a hitter has seen | Maybe 본 공 or 투구 수 (상대). |
| Stat label | 팝업% (내야 뜬공 비율) | infield pop-ups | Some sites use 내야 플라이%. |
| Stat label | 인플레이 | balls in play | Maybe 인플레이 타구. |
| Stat label | 사구 | hit by pitch | Full name in help is 몸에 맞는 공; 사구 is the KBO box-score term. |
| Stat label | 초구 스트% | first-pitch strike rate | Clipped form of 초구 스트라이크%. |
| Split | 타자 유리 / 동일 / 투수 유리 카운트 | ahead / even / behind in the count | 이븐 카운트 is also used for even. |
| Split | 득점권 | runners in scoring position (2nd or 3rd) | Standard; listed only to confirm. |
| Header | 양투 / 우투좌타 | switch pitcher / throws right, bats left | 양투 is unusual in real baseball; VR players switch hands. |
| Home | 일부만 기록 | game only partly charted | Maybe 기록 진행 중 or 부분 기록. |
| Help popover | 무엇인가요? / 어떻게 보나요? / 기준 / 스카우팅 활용 | the four help sections | Tone check. |
| Charts | 백분위 | percentile | Savant uses "Percentile Rankings"; 백분위 순위 may read better. |
| Charts | 타구 방향 / 점 / 구역 | spray chart; point and area modes | 스프레이 차트 is also common. |
| Charts | 존 차트, 보기 기준, 투구 비율 | zone chart, metric, pitch share | |
| Charts | 표본 부족 | below the sample needed for a percentile | |
| Charts | 타자로 / 투수로 | view as hitter / as pitcher | |
| Charts | 사용법, 표로 보기 | how to read, table view | |
| View | 간단히 / 자세히 | simple / detailed | From the handoff; listed to confirm. |
| Charts | 직구 계열 / 변화구, 구종 미상, 기타 | fastballs / other pitches, unknown pitch type, other (folded types) | 변화구 here covers splitters and changeups too. |
