// 페이지 제목 아래 바일라인에 표시할 라벨을 계산한다.
//
// contentAction 은 사용자가 메뉴에서 누를 때만 돌지만, 이 함수는 페이지를 열 때마다 돈다.
// 그래서 최소한만 조회한다. body-format 을 붙이지 않아 ADF 를 받지 않고, 제목 변환도 하지
// 않는다. 개수만 세면 되기 때문이다.
import { route } from '@forge/api';
import { getJson, asUserConfluence } from './lib/product-api.js';
import { findManyByTaskId } from './lib/mapping.js';

const PAGE_SIZE = 100;

export async function bylineProperties(payload) {
  // 페이로드에 페이지 id 가 어느 이름으로 오는지 문서에 예시가 없어 후보를 모두 본다
  const pageId = payload?.content?.id ?? payload?.contentId ?? payload?.extension?.content?.id;
  if (!pageId) {
    console.log('[byline] no page id', JSON.stringify(Object.keys(payload ?? {})));
    return {};
  }

  // 완료된 태스크도 연결은 살아 있다. 상태로 거르지 않는다
  const r = await getJson(
    asUserConfluence,
    route`/wiki/api/v2/tasks?page-id=${pageId}&limit=${PAGE_SIZE}`,
    '[byline] tasks'
  );
  if (r.error) {
    console.log('[byline] page', pageId, 'tasks lookup failed', r.error);
    return {};
  }

  const tasks = Array.isArray(r.body?.results) ? r.body.results : [];
  if (tasks.length === 0) {
    // 실측: 빈 title 을 돌려줘도 Confluence 가 무시하고 manifest 의 title 을 쓴다.
    // 조건부 숨김을 지원하지 않으므로 툴팁이라도 채워 오해를 줄인다
    console.log('[byline] page', pageId, 'tasks 0');
    return { tooltip: '이 페이지에는 액션 아이템이 없습니다' };
  }

  let mapped = {};
  try {
    mapped = await findManyByTaskId(tasks.map((t) => t.id));
  } catch (e) {
    console.log('[byline] mapping lookup failed', String(e));
  }

  const keys = tasks.map((t) => mapped[t.id]?.issueKey).filter(Boolean);
  const unlinked = tasks.length - keys.length;

  console.log('[byline] page', pageId, 'tasks', tasks.length, 'linked', keys.length);

  if (keys.length > 0) {
    return {
      title: `이슈 ${keys.length}건 연결됨`,
      tooltip: unlinked > 0 ? `${keys.join(', ')} (미연결 ${unlinked}건)` : keys.join(', '),
    };
  }

  // 연결이 없어도 액션 아이템이 있으면 앱을 쓸 자리라는 것을 알린다.
  // 개수는 내용이 빈 항목까지 포함한 값이라 "옮길 수 있는" 이라고 하지 않는다
  return { title: `액션 아이템 ${tasks.length}건`, tooltip: '더보기 메뉴에서 Task Bridge 를 열어주세요' };
}
