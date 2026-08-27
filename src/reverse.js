// 역방향. Jira 이슈 상태가 바뀌면 회의록 액션 아이템에 되돌려 반영한다.
//
// 정방향과 결정적으로 다른 점은 사람이 없다는 것이다. 버튼을 누른 사용자가 없으므로
// asUser() 를 못 쓰고 asApp() 으로 돈다. 실패해도 화면에 뜨지 않아서 로그가 유일한
// 관측 수단이다. 그래서 단계마다 [reverse] 접두사로 남긴다.
import api, { route } from '@forge/api';
import { findByIssueKey, markNotified, clearNotified, setCompleted } from './lib/mapping.js';
import { failureCommentAdf } from './lib/failure-comment.js';

// Jira 상태 이름은 프로젝트마다 언어마다 다르다 (완료, Done, 배포완료).
// statusCategory 는 어디서나 new, indeterminate, done 세 가지뿐이라 이것으로 판별한다.
// 이슈 타입에서 untranslatedName 을 쓴 것과 같은 이유다
const DONE_CATEGORY = 'done';

// 사람이 고칠 수 있는 실패만 알린다. 404 는 회의록을 고치면 되고 403 은 권한을 주면 된다.
//
// 처음에는 4xx 전부를 알렸는데 그러면 기능이 스스로 막힌다. 429 로 한 번 댓글이 달리면
// notifiedAt 이 찍히고, 그 뒤에 진짜 404 가 나도 이미 알렸다고 판단해 영영 안 알린다.
// 태스크가 없으면 반영이 성공할 일이 없어 플래그도 안 지워진다
const NOTIFY_STATUS = new Set([403, 404]);

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
    // 알린 뒤에 실패 원인이 바뀔 수 있다. 지금 코드를 같이 남겨야 로그 한 줄로 대조된다
    log('already notified', key, mapping.notifiedAt, 'now', status);
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
    log('comment posted', key);
  } catch (e) {
    log('comment threw', key, String(e));
    return;
  }

  // 댓글은 이미 달렸다. 표시를 못 남기면 다음 상태 변경 때 같은 댓글이 한 번 더 붙는다.
  // 댓글 실패와 같은 catch 에 두면 달린 댓글을 안 달렸다고 기록하게 된다
  try {
    await markNotified(key, new Date().toISOString());
  } catch (e) {
    log('notified flag write failed', key, String(e));
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
  const changed = event?.changelog?.items ?? [];
  // manifest 필터와 같은 규칙이어야 한다. 거기서 통과한 이벤트를 여기서 떨구면
  // 역방향이 통째로 멈추고 로그로도 안 갈린다 (1.22)
  const statusChanged = changed.some((i) => i.field === 'status' || i.fieldId === 'status');
  log('event', issueKey, 'changed=' + JSON.stringify(changed.map((i) => i.field ?? i.fieldId)));
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
  //
  // 다만 되돌리기는 우리가 체크한 것에만 적용한다. 완료가 아닌 상태끼리 옮기는 것
  // (해야 할 일에서 진행 중으로) 까지 incomplete 를 쓰면, 사람이 회의록에서 직접 체크한
  // 것을 앱이 지운다. 1.17 이 그러지 않는다고 적어둔 자리다.
  // 우리가 체크했는지는 매핑에 남긴 completedAt 으로 안다
  const done = category.key === DONE_CATEGORY;
  if (!done && !mapping.completedAt) {
    log('skip uncheck', issueKey, 'not completed by app');
    return;
  }
  const status = done ? 'complete' : 'incomplete';

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
      // 그 밖의 응답은 다음 상태 변경 때 다시 시도되므로 알리지 않는다.
      // 할 일이 없는 댓글은 소음이고, 소음이 플래그를 태워 정작 알릴 것을 막는다
      if (NOTIFY_STATUS.has(res.status)) {
        await notifyFailure(issueKey, mapping, res.status);
      }
      return;
    }
    log('task updated', mapping.taskId, status);

    // 다음에 되돌릴 때 우리가 체크한 것인지 판별하는 근거다
    try {
      await setCompleted(issueKey, done ? new Date().toISOString() : null);
    } catch (e) {
      log('completed flag write failed', issueKey, String(e));
    }

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
