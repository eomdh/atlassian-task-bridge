// Confluence 태스크 하나를 Jira 이슈 제목 한 줄로 바꾼다.
// ADF 를 아는 부분은 toPlainText 가 맡고, 여기는 Confluence 의 태스크 모양과
// Jira 의 제목 제한만 안다.
import { toPlainText } from './adf-text.js';

// Jira 이슈 제목(summary) 최대 길이. 화면도 같은 값을 써야 해서 내보낸다
export const TITLE_MAX_LENGTH = 255;

const ELLIPSIS = '…';

/**
 * 태스크에서 이슈 제목을 만든다. 제목으로 쓸 내용이 없으면 null 을 돌려준다.
 *
 * null 이 되는 경우는 셋이다. body 가 없거나, JSON 이 깨졌거나, 내용이 빈 체크박스다.
 * 지금은 셋 다 목록에서 제외하면 되므로 구분하지 않는다.
 */
export function titleFromTask(task) {
  // 실측 확인: value 는 ADF 객체가 아니라 JSON 문자열로 온다. 한 번 더 풀어야 한다
  const value = task?.body?.atlas_doc_format?.value;
  if (typeof value !== 'string') return null;

  let adf;
  try {
    adf = JSON.parse(value);
  } catch {
    return null;
  }

  const text = toPlainText(adf);
  if (!text) return null;

  if (text.length <= TITLE_MAX_LENGTH) return text;
  // 길이 제한은 UTF-16 코드 단위로 세므로 자르기도 같은 단위여야 한다.
  // 다만 이모지 한 글자가 두 단위라 경계에서 쪼개지면 짝 잃은 surrogate 가 남는다.
  // 코드 포인트 단위로 자르면 이 문제는 없지만 결과 길이가 제한을 넘는다
  const cut = text.slice(0, TITLE_MAX_LENGTH - ELLIPSIS.length);
  const whole = /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
  return whole + ELLIPSIS;
}
