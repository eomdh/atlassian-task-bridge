// 역방향. Jira 이슈 상태가 바뀌면 회의록 액션 아이템에 되돌려 반영한다.
//
// 정방향과 결정적으로 다른 점은 사람이 없다는 것이다. 버튼을 누른 사용자가 없으므로
// asUser() 를 못 쓰고 asApp() 으로 돈다. 실패해도 화면에 뜨지 않아서 로그가 유일한
// 관측 수단이다. 그래서 단계마다 [reverse] 접두사로 남긴다.
import api, { route } from '@forge/api';
import { findByIssueKey, markNotified, clearNotified } from './lib/mapping.js';
import { failureCommentAdf } from './lib/failure-comment.js';

// Jira 상태 이름은 프로젝트마다 언어마다 다르다 (완료, Done, 배포완료).
// statusCategory 는 어디서나 new, indeterminate, done 세 가지뿐이라 이것으로 판별한다.
// 이슈 타입에서 untranslatedName 을 쓴 것과 같은 이유다
const DONE_CATEGORY = 'done';

const log = (...parts) => console.log('[reverse]', ...parts);

// 페이로드에 statusCategory 가 들어오는지 문서에 예시가 없다.
// 없으면 이슈를 한 번 더 읽어서 채운다
async function resolveStatusCategory(issue) {
  const inPayload = issue?.fields?.status?.statusCategory?.key;
  if (inPayload) return { key: inPayload, source: 'payload' };

  const res = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issue.key}?fields=status`, {
      headers: { Accept: 'application/json' },
    });
  if (!res.ok) {
    log('status lookup failed', issue.key, res.status, await res.text());
    return { key: null, source: 'lookup-failed' };
  }
  const body = await res.json();
  return { key: body?.fields?.status?.statusCategory?.key ?? null, source: 'lookup' };
}

/**
 * 되돌려 반영이 4xx 로 거부됐을 때 이슈에 댓글로 알린다.
 * 여기서 나는 오류는 전부 로그로만 남긴다. 알림이 실패했다고 원래 실패를 덮으면 안 된다.
 */
async function notifyFailure(key, mapping, status) {
  if (mapping.notifiedAt) {
    log('already notified', key, mapping.notifiedAt);
    return;
  }

  // 회의록 주소는 이슈를 만들 때 저장해둔 값을 쓴다. 트리거 페이로드에는 사이트 주소가
  // 없어서 여기서는 조립할 수 없다. 이 기능 이전에 만들어진 매핑에는 없다
  const pageUrl = mapping.pageUrl ?? null;
  log('notify', key, 'status', status, 'pageUrl', pageUrl ? 'yes' : 'no');

  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ body: failureCommentAdf({ status, pageUrl }) }),
    });
    if (!res.ok) {
      log('comment failed', key, res.status, (await res.text()).slice(0, 300));
      return;
    }
    await markNotified(key, new Date().toISOString());
    log('comment posted', key);
  } catch (e) {
    log('comment threw', key, String(e));
  }
}

export async function onIssueUpdated(event) {
  const issueKey = event?.issue?.key;
  if (!issueKey) {
    log('no issue key in event');
    return;
  }

  // 이 이벤트는 어떤 필드가 바뀌어도 온다. 설명만 고쳐도 온다.
  // 상태 변경이 아니면 Storage 를 읽기 전에 끊는다
  const changedFields = (event?.changelog?.items ?? []).map((i) => i.field ?? i.fieldId);
  const statusChanged = changedFields.includes('status');
  log('event', issueKey, 'changed=' + JSON.stringify(changedFields));
  if (!statusChanged) return;

  // 우리가 만든 이슈가 아니면 할 일이 없다
  let mapping;
  try {
    mapping = await findByIssueKey(issueKey);
  } catch (e) {
    log('mapping lookup threw', issueKey, String(e));
    return;
  }
  if (!mapping?.taskId) {
    log('no mapping', issueKey);
    return;
  }

  const category = await resolveStatusCategory(event.issue);
  log('category', issueKey, category.key, 'via', category.source);
  if (!category.key) return;

  // 완료로 옮기면 체크하고, 되돌리면 체크를 푼다.
  // 완료만 따라가면 다리가 다시 한 방향이 된다
  const status = category.key === DONE_CATEGORY ? 'complete' : 'incomplete';

  // 트리거에는 사용자 컨텍스트가 없어 asApp 으로만 부를 수 있다.
  // 앱이 그 공간의 페이지를 편집할 수 있어야 통과한다
  try {
    const res = await api
      .asApp()
      .requestConfluence(route`/wiki/api/v2/tasks/${mapping.taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ status }),
      });

    if (!res.ok) {
      log('task update failed', mapping.taskId, res.status, (await res.text()).slice(0, 300));
      // 4xx 는 사람이 회의록을 고치거나 권한을 주면 풀린다. 5xx 와 예외는 다음 상태 변경 때
      // 다시 시도되므로 알리지 않는다. 할 일이 없는 댓글은 소음이다
      if (res.status >= 400 && res.status < 500) {
        await notifyFailure(issueKey, mapping, res.status);
      }
      return;
    }
    log('task updated', mapping.taskId, status);

    // 끊겼다가 이어졌으면 다음 실패는 다시 알려야 한다
    if (mapping.notifiedAt) {
      try {
        await clearNotified(issueKey);
        log('notified flag cleared', issueKey);
      } catch (e) {
        log('notified flag clear failed', issueKey, String(e));
      }
    }
  } catch (e) {
    // 트리거에서 던지면 사용자에게 아무 표시 없이 사라진다. 잡아서 남긴다
    log('task update threw', mapping.taskId, String(e));
  }
}
