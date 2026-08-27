// 태스크와 이슈의 연결을 저장한다. 양방향으로 두는 이유는 방향마다 아는 값이 다르기 때문이다.
// 정방향은 taskId 로 이미 옮겼는지 확인하고, 역방향은 issueKey 로 되돌릴 태스크를 찾는다.
//
// Forge Storage 는 클라이언트에서 못 부른다. 이 파일은 리졸버와 트리거에서만 쓴다.
// @forge/api 의 storage 는 폐기 예정이라 @forge/kvs 를 쓴다. 인터페이스는 같다.
import { kvs } from '@forge/kvs';

// 태스크 id 는 API 가 문자열로 준다. 키를 만들 때도 그대로 문자열로 다룬다
const taskKey = (taskId) => `task:${taskId}`;
const issueKey = (key) => `issue:${key}`;

export async function saveMapping({ taskId, issueKey: key, pageId, pageUrl, createdAt }) {
  // 역방향 키를 먼저 쓴다. 둘 중 하나만 써지는 상황에서 어느 쪽이 남는지가 다르다.
  // 정방향만 남으면 화면은 연결됐다고 표시하는데 역방향이 영영 안 돈다. 조용한 실패다.
  // 역방향만 남으면 화면이 미연결로 보여 사용자가 다시 누를 수 있고 되돌리기는 동작한다
  //
  // pageUrl 은 역방향이 실패를 알릴 때 쓴다. 트리거에서는 만들 수 없어 여기서 넘겨받는다
  await kvs.set(issueKey(key), { taskId, pageId, pageUrl: pageUrl ?? null });
  await kvs.set(taskKey(taskId), { issueKey: key, pageId, createdAt });
}

/**
 * 앱이 이 이슈 때문에 태스크를 체크했는지 남긴다.
 * 완료가 아닌 상태끼리 옮길 때 사람이 직접 체크한 것을 지우지 않기 위한 근거다 (1.17).
 */
export async function setCompleted(key, completedAt) {
  const current = await findByIssueKey(key);
  if (!current) return;
  if ((current.completedAt ?? null) === completedAt) return;
  await kvs.set(issueKey(key), { ...current, completedAt });
}

export async function findByTaskId(taskId) {
  return (await kvs.get(taskKey(taskId))) ?? null;
}

export async function findByIssueKey(key) {
  return (await kvs.get(issueKey(key))) ?? null;
}

/**
 * 실패를 이슈 댓글로 알렸다는 표시. 같은 실패로 댓글이 쌓이지 않게 한다.
 *
 * 뜻은 "예전에 알린 적 있다" 가 아니라 "지금 끊겨 있고 이미 알렸다" 다.
 * 그래서 반영이 다시 성공하면 clearNotified 로 지우고, 다음에 또 끊기면 다시 알린다.
 */
export async function markNotified(key, notifiedAt) {
  const current = await findByIssueKey(key);
  if (!current) return;
  await kvs.set(issueKey(key), { ...current, notifiedAt });
}

export async function clearNotified(key) {
  const current = await findByIssueKey(key);
  if (!current?.notifiedAt) return;
  const { notifiedAt, ...rest } = current;
  await kvs.set(issueKey(key), rest);
}

/**
 * 여러 태스크의 매핑을 한 번에 조회한다. 목록 화면이 이미 옮긴 항목을 표시하는 데 쓴다.
 * 없는 것은 결과에서 빠진다.
 */
export async function findManyByTaskId(taskIds) {
  // storage 에 여러 키를 한 번에 읽는 API 가 없다. 순차로 읽으면 100건짜리 페이지에서
  // 왕복이 100번 쌓이는데, 이 함수는 페이지를 열 때마다 도는 바일라인 경로에도 쓰인다.
  // 병렬로 보내 왕복을 한 번으로 줄인다
  const values = await Promise.all(taskIds.map((taskId) => findByTaskId(taskId)));

  const found = {};
  taskIds.forEach((taskId, i) => {
    if (values[i]) found[taskId] = values[i];
  });
  return found;
}
