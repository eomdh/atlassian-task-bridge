// 역방향 반영이 거부됐을 때 이슈에 다는 댓글 본문.
//
// 트리거는 사람이 없는 곳에서 돈다. 실패해도 화면에 안 뜨고 로그만 남아서, 이슈를 완료로
// 옮긴 사람은 회의록에 반영됐다고 믿고 창을 닫는다. 그 믿음을 깨는 것이 이 댓글의 목적이다.
import { doc, paragraph, text, link } from './adf-build.js';

// 앱이 asApp 으로 달아 작성자가 앱 이름으로 뜨지만, 알림 메일에는 본문만 실린다
const PREFIX = 'Task Bridge: ';

// 읽는 사람은 개발자가 아니다. 상태 코드를 보여주는 대신 다음에 할 일을 적는다.
// 코드는 로그에 남으므로 원인 추적은 그쪽에서 한다
const MESSAGE = {
  // Confluence 는 볼 권한이 없는 콘텐츠에도 403 대신 404 를 준다.
  // 지워진 것과 안 보이는 것을 응답만으로 못 가르므로 둘 다 말한다
  404:
    '연결된 회의록 액션 아이템을 찾지 못해 상태를 반영하지 못했습니다. ' +
    '회의록에서 항목이 지워졌거나 문장이 다시 쓰였을 수 있습니다. ' +
    '회의록이 그대로라면 앱이 그 공간을 볼 수 없는 것입니다.',
  403:
    '앱에 회의록을 편집할 권한이 없어 상태를 반영하지 못했습니다. ' +
    '공간 관리자에게 Task Bridge 의 편집 권한을 요청해주세요.',
};

// 알림은 403 과 404 로만 좁혀 두었다. 그래도 값이 없을 때 깨진 ADF 를 만들지는 않는다
const UNKNOWN = '회의록 액션 아이템에 상태를 반영하지 못했습니다.';

/**
 * 되돌려 반영이 거부됐을 때의 댓글 본문을 만든다.
 * 회의록 주소를 못 만들면 링크 없이 문장만 남긴다. 알림이 사라지는 것보다 낫다.
 */
export function failureCommentAdf({ status, pageUrl } = {}) {
  const content = [paragraph(text(PREFIX + (MESSAGE[status] ?? UNKNOWN)))];

  if (pageUrl) {
    content.push(paragraph(link('회의록 열기', pageUrl)));
  }

  return doc(...content);
}
