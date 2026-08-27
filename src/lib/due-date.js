// Confluence 태스크의 마감일을 Jira 가 받는 날짜로 바꾼다.
//
// 두 쪽의 타입이 다르다. Confluence `dueAt` 은 순간이고 (실측: 2026-09-04 를 고르면
// "2026-09-04T04:00:00.000Z"), Jira `duedate` 는 날짜다. 순간을 날짜로 되돌리려면
// 표준시가 필요한데 응답 어디에도 어느 표준시로 인코딩했는지가 없다.
//
// 그래서 규칙을 정했다. **회의록에서 사람이 보는 날짜를 그대로 옮긴다.** 옮기는 사람의
// 표준시로 날짜를 만든다. 앞 10글자를 자르는 방식은 UTC+ 사이트에서 하루가 당겨진다.

/**
 * @param dueAt Confluence 태스크의 dueAt (ISO 8601 순간) 또는 null
 * @param timeZone IANA 표준시 이름. 없으면 UTC 로 떨어진다
 * @returns YYYY-MM-DD 또는 null
 */
export function dueDateFor(dueAt, timeZone) {
  if (typeof dueAt !== 'string' || !dueAt) return null;

  const ms = Date.parse(dueAt);
  // 읽을 수 없는 값을 그대로 보내면 이슈 생성이 400 으로 통째로 실패한다
  if (Number.isNaN(ms)) return null;

  const utcDate = dueAt.slice(0, 10);
  if (!timeZone) return utcDate;

  try {
    // en-CA 가 YYYY-MM-DD 로 낸다. 직접 조립하는 것보다 자릿수 실수가 없다
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch (e) {
    // Intl 은 모르는 표준시 이름에 RangeError 를 던진다.
    // 마감일 하나 때문에 이슈 생성이 실패하면 안 된다
    console.log('dueDateFor bad time zone', String(timeZone).slice(0, 40), String(e));
    return utcDate;
  }
}
