// 역방향 반영이 거부됐을 때 이슈에 다는 댓글 본문.
//
// 트리거는 사람이 없는 곳에서 돈다. 실패해도 화면에 안 뜨고 로그만 남아서, 이슈를 완료로
// 옮긴 사람은 회의록에 반영됐다고 믿고 창을 닫는다. 그 믿음을 깨는 것이 이 댓글의 목적이다.
import { doc, paragraph, text, link } from './adf-build.js';

// 앱이 asApp 으로 달아 작성자가 앱 이름으로 뜨지만, 알림 메일에는 본문만 실린다
const PREFIX = 'Task Bridge: ';

// Confluence 는 볼 권한이 없는 콘텐츠에도 403 대신 404 를 주는 경우가 있다.
// 지워진 것과 안 보이는 것을 응답만으로 못 가르므로 단정하지 않는다
const NOT_FOUND =
  '연결된 회의록 액션 아이템을 찾지 못해 상태를 반영하지 못했습니다. ' +
  '회의록에서 항목이 지워졌거나 문장이 다시 쓰였을 수 있습니다.';

const REFUSED = (status) =>
  Number.isInteger(status)
    ? `회의록 액션 아이템에 상태를 반영하지 못했습니다. (응답 ${status})`
    : '회의록 액션 아이템에 상태를 반영하지 못했습니다.';

/**
 * 되돌려 반영이 4xx 로 거부됐을 때의 댓글 본문을 만든다.
 * 회의록 주소를 못 만들면 링크 없이 문장만 남긴다. 알림이 사라지는 것보다 낫다.
 */
export function failureCommentAdf({ status, pageUrl } = {}) {
  const reason = status === 404 ? NOT_FOUND : REFUSED(status);
  const content = [paragraph(text(PREFIX + reason))];

  if (pageUrl) {
    content.push(paragraph(link('회의록 열기', pageUrl)));
  }

  return doc(...content);
}
