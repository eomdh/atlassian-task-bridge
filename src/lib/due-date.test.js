import { describe, it, expect } from 'vitest';
import { dueDateFor } from './due-date.js';

// 이 변환은 데모 사이트에서 검증할 수 없다. 사이트 표준시가 UTC-4 라서
// 자르기와 표준시 변환이 같은 답을 낸다. 갈라지는 경우를 여기서 만든다.
describe('dueDateFor', () => {
  // 실측: 회의록에서 2026-09-04 를 고르면 이 값이 온다
  const MEASURED = '2026-09-04T04:00:00.000Z';

  // UTC+ 사이트에서 2026-09-04 를 골랐을 때 저장될 값
  const POSITIVE_OFFSET = '2026-09-03T15:00:00.000Z';

  it('마감일이 없으면 null 을 돌려준다', () => {
    expect(dueDateFor(null, 'Asia/Seoul')).toBeNull();
    expect(dueDateFor(undefined, 'Asia/Seoul')).toBeNull();
    expect(dueDateFor('', 'Asia/Seoul')).toBeNull();
  });

  it('날짜로 읽을 수 없으면 null 을 돌려준다', () => {
    // 보내면 Jira 가 400 을 준다. 아예 안 보내는 편이 낫다
    expect(dueDateFor('내일까지', 'Asia/Seoul')).toBeNull();
  });

  it('Jira 가 받는 YYYY-MM-DD 로 만든다', () => {
    expect(dueDateFor(MEASURED, 'Asia/Seoul')).toBe('2026-09-04');
  });

  it('같은 순간이 표준시에 따라 다른 날짜가 된다', () => {
    // 이것이 자르기를 쓰면 안 되는 이유다. UTC 앞 10글자는 둘 다 2026-09-03 이 된다
    expect(dueDateFor(POSITIVE_OFFSET, 'Asia/Seoul')).toBe('2026-09-04');
    expect(dueDateFor(POSITIVE_OFFSET, 'America/New_York')).toBe('2026-09-03');
  });

  it('표준시를 못 받으면 UTC 날짜로 떨어진다', () => {
    // 브라우저가 표준시를 안 주는 경우다. 마감일을 통째로 버리는 것보다 낫다
    expect(dueDateFor(MEASURED)).toBe('2026-09-04');
    expect(dueDateFor(POSITIVE_OFFSET, null)).toBe('2026-09-03');
  });

  it('표준시 이름이 잘못돼도 던지지 않는다', () => {
    // Intl 은 모르는 이름에 RangeError 를 던진다. 이슈 생성이 통째로 실패하면 안 된다
    expect(dueDateFor(MEASURED, 'Not/AZone')).toBe('2026-09-04');
  });
});
