import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { titleFromTask } from '../lib/task-title.js';

const resolver = new Resolver();

// 한 회의록에 액션 아이템이 100개를 넘는 경우는 없다고 보고 페이지네이션을 따라가지 않는다
const PAGE_SIZE = 100;

// 회의록의 액션 아이템은 성격이 전부 할 일이다. 타입을 고르게 하지 않고 이것을 우선한다
const PREFERRED_ISSUE_TYPE = 'Task';

// hierarchyLevel 은 -1 하위 작업, 0 표준(작업, 스토리, 버그), 1 이상 에픽 계열이다
const SUBTASK_LEVEL = -1;
const STANDARD_LEVEL = 0;

// 이슈 타입 이름은 보는 사람의 언어로 번역돼서 온다. 한국어 사이트에서 Task 는 '작업' 이다.
// 실측으로 untranslatedName 이 함께 온다는 것을 확인했고 그것을 먼저 본다.
// name 만 보면 매칭이 실패해 목록의 첫 번째로 떨어지는데, 그 자리에 '새 기능' 이나
// '[System] Incident' 가 있는 프로젝트에서는 엉뚱한 타입으로 이슈가 만들어진다
function pickIssueType(types) {
  return (
    types.find((t) => t.untranslatedName === PREFERRED_ISSUE_TYPE) ??
    types.find((t) => t.name === PREFERRED_ISSUE_TYPE) ??
    types.find((t) => t.hierarchyLevel === STANDARD_LEVEL) ??
    types[0]
  );
}

// 오류를 던지지 않고 결과에 담아 보낸다. 던지면 Forge 기본 오류 화면이 떠서
// 사용자가 무엇을 해야 하는지 안내할 수 없다
function fail(extra, error) {
  return { ...extra, error };
}

// 제품 호출을 한 곳에서 감싼다. 던지는 예외와 http 오류를 같은 모양으로 만든다
async function get(client, path, label) {
  let res;
  try {
    res = await client(path);
  } catch (e) {
    console.log(`${label} threw`, String(e));
    return { error: 'REQUEST_FAILED' };
  }
  if (!res.ok) {
    console.log(`${label} http error`, res.status, await res.text());
    // Jira 가 없는 사이트에서는 404 가 온다. 권한 부족과 같은 안내로 묶는다
    const denied = res.status === 401 || res.status === 403 || res.status === 404;
    return { error: denied ? 'JIRA_UNAVAILABLE' : 'REQUEST_FAILED' };
  }
  return { body: await res.json() };
}

resolver.define('getTasks', async (req) => {
  // 페이지 id 는 Atlassian 이 채워 넘긴다. 사용자가 위조할 수 없어서
  // 지금 열려 있는 페이지의 태스크만 본다는 것이 보장된다
  const pageId = req.context?.extension?.content?.id;
  if (!pageId) return fail({ pageId: null, tasks: [], skipped: 0 }, 'NO_PAGE');

  // asUser 로 부르면 권한 검사를 Confluence 가 대신 한다.
  // 볼 수 없는 페이지의 태스크는 애초에 응답에 들어오지 않는다
  const r = await get(
    (p) => api.asUser().requestConfluence(p, { headers: { Accept: 'application/json' } }),
    route`/wiki/api/v2/tasks?page-id=${pageId}&status=incomplete&body-format=atlas_doc_format&limit=${PAGE_SIZE}`,
    'getTasks'
  );
  if (r.error) {
    return fail({ pageId, tasks: [], skipped: 0 }, r.error === 'JIRA_UNAVAILABLE' ? 'FORBIDDEN' : r.error);
  }

  const results = Array.isArray(r.body?.results) ? r.body.results : [];

  // 화면은 ADF 를 모른다. 변환은 여기서 끝내고 제목만 넘긴다
  const tasks = [];
  for (const task of results) {
    const title = titleFromTask(task);
    if (title) tasks.push({ id: task.id, title, assignedTo: task.assignedTo ?? null });
  }

  // 조용히 버리면 사용자가 회의록의 개수와 목록의 개수가 다른 이유를 알 수 없다
  return { pageId, tasks, skipped: results.length - tasks.length, error: null };
});

resolver.define('getProjects', async () => {
  const r = await get(
    (p) => api.asUser().requestJira(p, { headers: { Accept: 'application/json' } }),
    route`/rest/api/3/project/search?maxResults=${PAGE_SIZE}&orderBy=name`,
    'getProjects'
  );
  if (r.error) return fail({ projects: [] }, r.error);

  const projects = (r.body?.values ?? []).map((p) => ({ id: p.id, key: p.key, name: p.name }));
  return { projects, error: null };
});

resolver.define('getIssueTypes', async (req) => {
  const projectKey = req.payload?.projectKey;
  if (!projectKey) return fail({ issueTypeId: null, issueTypeName: null }, 'NO_PROJECT');

  // 옛 createmeta 는 폐기됐다. 프로젝트별 이슈 타입 엔드포인트를 쓴다
  const r = await get(
    (p) => api.asUser().requestJira(p, { headers: { Accept: 'application/json' } }),
    route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
    'getIssueTypes'
  );
  if (r.error) return fail({ issueTypeId: null, issueTypeName: null }, r.error);

  const all = r.body?.issueTypes ?? [];

  // 하위 작업은 부모 이슈가 있어야 만들 수 있어서 대상이 아니다
  const types = all.filter((t) => !t.subtask && t.hierarchyLevel !== SUBTASK_LEVEL);
  if (types.length === 0) return fail({ issueTypeId: null, issueTypeName: null }, 'NO_ISSUE_TYPE');

  // 고르는 규칙은 리졸버에 둔다. 화면은 결과만 표시한다
  const picked = pickIssueType(types);
  return { issueTypeId: picked.id, issueTypeName: picked.name, error: null };
});

export const handler = resolver.getDefinitions();
