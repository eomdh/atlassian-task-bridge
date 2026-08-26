import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { getJson, asUserConfluence, asUserJira } from '../lib/product-api.js';
import { titleFromTask, TITLE_MAX_LENGTH } from '../lib/task-title.js';
import { findManyByTaskId, saveMapping } from '../lib/mapping.js';
import { descriptionAdf } from '../lib/issue-description.js';

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

resolver.define('getTasks', async (req) => {
  // 페이지 id 는 Atlassian 이 채워 넘긴다. 사용자가 위조할 수 없어서
  // 지금 열려 있는 페이지의 태스크만 본다는 것이 보장된다
  const pageId = req.context?.extension?.content?.id;
  if (!pageId) return fail({ pageId: null, tasks: [], skipped: 0 }, 'NO_PAGE');

  // asUser 로 부르면 권한 검사를 Confluence 가 대신 한다.
  // 볼 수 없는 페이지의 태스크는 애초에 응답에 들어오지 않는다
  const r = await getJson(
    asUserConfluence,
    route`/wiki/api/v2/tasks?page-id=${pageId}&status=incomplete&body-format=atlas_doc_format&limit=${PAGE_SIZE}`,
    'getTasks'
  );
  if (r.error) {
    return fail(
      { pageId, tasks: [], skipped: 0 },
      r.error === 'PRODUCT_UNAVAILABLE' ? 'FORBIDDEN' : r.error
    );
  }

  const results = Array.isArray(r.body?.results) ? r.body.results : [];

  // 화면은 ADF 를 모른다. 변환은 여기서 끝내고 제목만 넘긴다
  const tasks = [];
  for (const task of results) {
    const title = titleFromTask(task);
    if (title) tasks.push({ id: task.id, title, assignedTo: task.assignedTo ?? null });
  }

  // 이미 옮긴 항목을 표시해 중복 생성을 줄인다. 막지는 않는다.
  // 일부러 두 번 만들 이유가 있을 수 있고 앱이 사용자를 막을 만큼의 근거가 없다
  let mapped = {};
  try {
    mapped = await findManyByTaskId(tasks.map((t) => t.id));
  } catch (e) {
    // 매핑을 못 읽어도 목록은 보여준다. 중복 표시만 없을 뿐 조회는 성립한다
    console.log('getTasks mapping lookup failed', String(e));
  }

  return {
    pageId,
    tasks: tasks.map((t) => ({ ...t, issueKey: mapped[t.id]?.issueKey ?? null })),
    skipped: results.length - tasks.length,
    error: null,
  };
});

resolver.define('getProjects', async () => {
  const r = await getJson(
    asUserJira,
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
  const r = await getJson(
    asUserJira,
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

// 바일라인 팝업용. 이 페이지에서 이미 Jira 로 옮긴 항목만 돌려준다.
// 완료된 태스크도 연결은 살아 있으므로 상태로 거르지 않는다
resolver.define('getPageLinks', async (req) => {
  const pageId = req.context?.extension?.content?.id;
  const siteUrl = req.context?.siteUrl ?? null;
  if (!pageId) return fail({ links: [], siteUrl }, 'NO_PAGE');

  const r = await getJson(
    asUserConfluence,
    route`/wiki/api/v2/tasks?page-id=${pageId}&body-format=atlas_doc_format&limit=${PAGE_SIZE}`,
    'getPageLinks'
  );
  if (r.error) {
    return fail({ links: [], siteUrl }, r.error === 'PRODUCT_UNAVAILABLE' ? 'FORBIDDEN' : r.error);
  }

  const results = Array.isArray(r.body?.results) ? r.body.results : [];

  let mapped = {};
  try {
    mapped = await findManyByTaskId(results.map((t) => t.id));
  } catch (e) {
    console.log('getPageLinks mapping lookup failed', String(e));
    return fail({ links: [], siteUrl }, 'REQUEST_FAILED');
  }

  // 제목이 비어도 연결은 보여준다. 이슈가 이미 만들어진 뒤에 회의록이 비워졌을 수 있다
  const links = results
    .filter((t) => mapped[t.id]?.issueKey)
    .map((t) => ({
      taskId: t.id,
      title: titleFromTask(t) ?? '(내용 없음)',
      status: t.status,
      issueKey: mapped[t.id].issueKey,
    }));

  // 연결이 0건인 이유가 셋이라 화면이 구분해서 안내해야 한다.
  // 옮길 것이 남았는지, 있어도 내용이 비었는지, 액션 아이템 자체가 없는지가 다르다.
  // 이 경로는 body-format 을 붙여 조회하므로 내용 유무를 판별할 수 있다.
  // 라벨 경로(byline)는 비용 때문에 붙이지 않아 개수만 센다
  const movable = results.filter(
    (t) => !mapped[t.id]?.issueKey && t.status === 'incomplete' && titleFromTask(t)
  ).length;

  return { links, taskCount: results.length, movable, siteUrl, error: null };
});

// 이슈 본문에 넣을 회의록 제목과 주소를 가져온다.
// 실패해도 이슈 생성을 막지 않는다. 본문이 조금 빈약해질 뿐이다
async function pageLink(pageId, siteUrl) {
  if (!pageId || !siteUrl) return {};

  const r = await getJson(asUserConfluence, route`/wiki/api/v2/pages/${pageId}`, 'pageLink');

  // webui 는 /spaces/{key}/pages/{id}/{title} 형태의 경로다.
  // 못 받으면 pageId 로 여는 옛 주소를 쓴다. 현재 주소로 넘겨준다
  const webui = r.body?._links?.webui;
  return {
    pageTitle: r.body?.title,
    pageUrl: webui
      ? `${siteUrl}/wiki${webui}`
      : `${siteUrl}/wiki/pages/viewpage.action?pageId=${pageId}`,
  };
}

// 이슈 하나를 만든다. 담당자 때문에 거절당하면 담당자를 빼고 한 번 더 시도한다.
// 회의록에서 멘션된 사람이 그 프로젝트를 못 쓰는 경우가 흔한데, 그때 이슈가 아예
// 안 만들어지는 것보다 담당자 없이라도 만들어지는 편이 사용자에게 낫다
async function createIssue({ projectKey, issueTypeId, summary, assignedTo, description }) {
  const post = async (withAssignee) => {
    const fields = {
      project: { key: projectKey },
      issuetype: { id: issueTypeId },
      summary,
      description,
    };
    if (withAssignee) fields.assignee = { id: assignedTo };

    const res = await api.asUser().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ fields }),
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  };

  try {
    const first = await post(Boolean(assignedTo));
    if (first.ok) {
      return { ok: true, issueKey: JSON.parse(first.text).key, assigneeDropped: false };
    }

    // 담당자를 넣어서 실패한 경우에만 재시도할 가치가 있다
    if (assignedTo) {
      console.log('createIssue with assignee failed', first.status, first.text);
      const retry = await post(false);
      if (retry.ok) {
        return { ok: true, issueKey: JSON.parse(retry.text).key, assigneeDropped: true };
      }
      console.log('createIssue without assignee failed', retry.status, retry.text);
      return { ok: false, reason: 'CREATE_FAILED', detail: retry.text.slice(0, 300) };
    }

    console.log('createIssue failed', first.status, first.text);
    return { ok: false, reason: 'CREATE_FAILED', detail: first.text.slice(0, 300) };
  } catch (e) {
    console.log('createIssue threw', String(e));
    return { ok: false, reason: 'CREATE_FAILED', detail: String(e) };
  }
}

resolver.define('createIssues', async (req) => {
  const pageId = req.context?.extension?.content?.id;
  const { projectKey, issueTypeId, items } = req.payload ?? {};
  if (!projectKey || !issueTypeId || !Array.isArray(items) || items.length === 0) {
    return fail({ results: [], created: 0, failed: 0 }, 'BAD_REQUEST');
  }

  // 회의록으로 돌아가는 링크를 만들기 위해 페이지를 한 번 읽는다.
  // 항목마다가 아니라 요청당 한 번이라 비용이 크지 않다
  const description = descriptionAdf(await pageLink(pageId, req.context?.siteUrl));

  const results = [];

  // 순차로 보낸다. 병렬은 Jira 속도 제한에 걸릴 수 있고, 순서가 입력과 같아야
  // 화면이 결과를 항목에 짝지을 때 단순해진다. 한 회의록에 몇 건 수준이라 체감 차이도 없다
  for (const item of items) {
    const summary = (item.title ?? '').trim();

    // 화면에서 이미 막지만 여기서도 검사한다. 화면 검증만 믿으면 안 된다
    if (!summary || summary.length > TITLE_MAX_LENGTH) {
      results.push({ taskId: item.taskId, ok: false, reason: 'INVALID_TITLE' });
      continue;
    }

    const created = await createIssue({
      projectKey,
      issueTypeId,
      summary,
      assignedTo: item.assignedTo,
      description,
    });

    if (!created.ok) {
      results.push({ taskId: item.taskId, ok: false, reason: created.reason });
      continue;
    }

    // 이슈는 만들어졌는데 매핑이 빠지면 역방향이 조용히 끊긴다.
    // 조용한 실패가 가장 나쁘므로 저장 실패를 결과에 드러낸다
    let mappingSaved = true;
    try {
      await saveMapping({
        taskId: item.taskId,
        issueKey: created.issueKey,
        pageId,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.log('saveMapping failed', item.taskId, created.issueKey, String(e));
      mappingSaved = false;
    }

    results.push({
      taskId: item.taskId,
      ok: true,
      issueKey: created.issueKey,
      assigneeDropped: created.assigneeDropped,
      mappingSaved,
    });
  }

  return {
    results,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    error: null,
  };
});

export const handler = resolver.getDefinitions();
