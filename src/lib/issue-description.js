// Jira 이슈 본문을 만든다. 매핑은 Forge Storage 안에만 있어서 사람 눈에 보이지 않는다.
// 본문에 회의록 링크를 넣어야 Jira 에서 원본으로 건너갈 수 있다.
//
// 슬라이스 4 에서 ADF 를 읽었다면 여기는 쓰는 쪽이다. Jira v3 API 의 description 은
// 평문이 아니라 ADF 를 받는다. 모양이 틀리면 400 으로 이슈 생성 자체가 실패한다.
import { doc, paragraph, text, link } from './adf-build.js';

const INTRO = 'Confluence 회의록의 액션 아이템에서 만들어진 이슈입니다.';

/**
 * 회의록으로 돌아가는 링크가 담긴 ADF 본문을 만든다.
 * 링크를 만들 수 없으면 안내 문장만 남긴다. 본문이 없는 것보다는 낫다.
 */
export function descriptionAdf({ pageTitle, pageUrl } = {}) {
  const content = [paragraph(text(INTRO))];

  if (pageUrl) {
    // 제목을 못 읽었을 때도 클릭할 것이 있어야 한다
    content.push(paragraph(link(pageTitle || '회의록 열기', pageUrl)));
  }

  return doc(...content);
}
