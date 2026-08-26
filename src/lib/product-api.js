// 제품 REST 호출을 한 곳에서 감싼다. 던지는 예외와 http 오류를 같은 모양으로 만들어
// 부르는 쪽이 한 가지만 보게 한다.
//
// 리졸버와 바일라인 핸들러가 함께 쓴다. 진입점이 다를 뿐 오류 처리 방식은 같아야 한다.
import api from '@forge/api';

export const asUserConfluence = (path) =>
  api.asUser().requestConfluence(path, { headers: { Accept: 'application/json' } });

export const asUserJira = (path) =>
  api.asUser().requestJira(path, { headers: { Accept: 'application/json' } });

/**
 * GET 을 보내고 { body } 또는 { error } 를 돌려준다. 던지지 않는다.
 * error 는 화면이 안내 문구를 고르는 데 쓰는 코드다.
 */
export async function getJson(client, path, label) {
  let res;
  try {
    res = await client(path);
  } catch (e) {
    console.log(`${label} threw`, String(e));
    return { error: 'REQUEST_FAILED' };
  }
  if (!res.ok) {
    console.log(`${label} http error`, res.status, await res.text());
    // Jira 가 없는 사이트에서는 404 가 온다. 사용자가 할 일이 같으므로 권한 부족과 묶는다
    const denied = res.status === 401 || res.status === 403 || res.status === 404;
    return { error: denied ? 'PRODUCT_UNAVAILABLE' : 'REQUEST_FAILED' };
  }
  return { body: await res.json() };
}
