// 회의록 본문 ADF 에서 액션 아이템이 나온 순서를 읽는다.
//
// tasks API 는 정렬 규칙을 문서에 밝히지 않고, 실측에서 회의록에 적은 순서와 다르게 왔다.
// 나중에 고친 항목이 뒤로 밀린다. 화면은 회의록과 같은 순서로 보여야 하므로 본문에서
// 순서를 따로 읽어 맞춘다.
//
// ADF 의 taskItem 과 태스크 객체가 같은 localId 를 쓴다는 것에 기댄다. 문서에 명시가 없어
// 어긋날 수 있으므로, 부르는 쪽은 못 맞춘 항목을 API 순서 그대로 남긴다.

/**
 * @returns 문서에 나온 순서대로의 localId 배열. 읽을 수 없으면 빈 배열
 */
export function taskOrderFromAdf(node, out = []) {
  if (!node || typeof node !== 'object') return out;

  if (node.type === 'taskItem' && node.attrs?.localId) {
    out.push(node.attrs.localId);
  }

  // 회의록은 안건마다 목록이 따로 있고 목록이 중첩되기도 한다. 트리를 그대로 훑는다
  if (Array.isArray(node.content)) {
    for (const child of node.content) taskOrderFromAdf(child, out);
  }

  return out;
}
