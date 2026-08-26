// 태스크와 이슈의 연결을 저장한다. 양방향으로 두는 이유는 방향마다 아는 값이 다르기 때문이다.
// 정방향은 taskId 로 이미 옮겼는지 확인하고, 역방향은 issueKey 로 되돌릴 태스크를 찾는다.
//
// Forge Storage 는 클라이언트에서 못 부른다. 이 파일은 리졸버와 트리거에서만 쓴다.
// @forge/api 의 storage 는 폐기 예정이라 @forge/kvs 를 쓴다. 인터페이스는 같다.
import { kvs } from '@forge/kvs';

// 태스크 id 는 API 가 문자열로 준다. 키를 만들 때도 그대로 문자열로 다룬다
const taskKey = (taskId) => `task:${taskId}`;
const issueKey = (key) => `issue:${key}`;

export async function saveMapping({ taskId, issueKey: key, pageId, createdAt }) {
  await kvs.set(taskKey(taskId), { issueKey: key, pageId, createdAt });
  await kvs.set(issueKey(key), { taskId, pageId });
}

export async function findByTaskId(taskId) {
  return (await kvs.get(taskKey(taskId))) ?? null;
}

export async function findByIssueKey(key) {
  return (await kvs.get(issueKey(key))) ?? null;
}

/**
 * 여러 태스크의 매핑을 한 번에 조회한다. 목록 화면이 이미 옮긴 항목을 표시하는 데 쓴다.
 * 없는 것은 결과에서 빠진다.
 */
export async function findManyByTaskId(taskIds) {
  const found = {};
  // storage 에 여러 키를 한 번에 읽는 API 가 없어서 순차로 읽는다.
  // 한 페이지의 액션 아이템이 100건 이내라 문제가 되지 않는다
  for (const taskId of taskIds) {
    const value = await findByTaskId(taskId);
    if (value) found[taskId] = value;
  }
  return found;
}
