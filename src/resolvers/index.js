import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { titleFromTask } from '../lib/task-title.js';

const resolver = new Resolver();

// 한 회의록에 액션 아이템이 100개를 넘는 경우는 없다고 보고 페이지네이션을 따라가지 않는다
const PAGE_SIZE = 100;

// 오류를 던지지 않고 결과에 담아 보낸다. 던지면 Forge 기본 오류 화면이 떠서
// 사용자가 무엇을 해야 하는지 안내할 수 없다
function fail(pageId, error) {
  return { pageId, tasks: [], skipped: 0, error };
}

resolver.define('getTasks', async (req) => {
  // 페이지 id 는 Atlassian 이 채워 넘긴다. 사용자가 위조할 수 없어서
  // 지금 열려 있는 페이지의 태스크만 본다는 것이 보장된다
  const pageId = req.context?.extension?.content?.id;
  if (!pageId) return fail(null, 'NO_PAGE');

  let res;
  try {
    // asUser 로 부르면 권한 검사를 Confluence 가 대신 한다.
    // 볼 수 없는 페이지의 태스크는 애초에 응답에 들어오지 않는다
    res = await api
      .asUser()
      .requestConfluence(
        route`/wiki/api/v2/tasks?page-id=${pageId}&status=incomplete&body-format=atlas_doc_format&limit=${PAGE_SIZE}`,
        { headers: { Accept: 'application/json' } }
      );
  } catch (e) {
    console.log('getTasks request threw', String(e));
    return fail(pageId, 'REQUEST_FAILED');
  }

  if (!res.ok) {
    console.log('getTasks http error', res.status, await res.text());
    return fail(pageId, res.status === 401 || res.status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED');
  }

  const body = await res.json();
  const results = Array.isArray(body?.results) ? body.results : [];

  // 화면은 ADF 를 모른다. 변환은 여기서 끝내고 제목만 넘긴다
  const tasks = [];
  for (const task of results) {
    const title = titleFromTask(task);
    if (title) tasks.push({ id: task.id, title, assignedTo: task.assignedTo ?? null });
  }

  // 조용히 버리면 사용자가 회의록의 개수와 목록의 개수가 다른 이유를 알 수 없다
  return { pageId, tasks, skipped: results.length - tasks.length, error: null };
});

export const handler = resolver.getDefinitions();
