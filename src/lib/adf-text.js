// ADF(Atlassian Document Format) 트리에서 표시용 글자만 뽑아 한 줄로 만든다.
// Confluence 도 Jira 도 모르는 순수 함수라 태스크 말고 다른 ADF 에도 쓸 수 있다.

// 인라인 조각은 서로 붙여야 한다. 실측에서 공백이 text 조각 안에 들어 있었기 때문에
// (예: '굵게' | ' 와 ' | '기울임' | ' 섞기') 사이에 구분자를 넣으면 단어가 갈라진다.
const INLINE_TYPES = new Set([
  'text',
  'mention',
  'emoji',
  'inlineCard',
  'hardBreak',
  'placeholder',
  'date',
  'status',
]);

const isInline = (node) => INLINE_TYPES.has(node?.type);

// 종류별로 표시할 글자를 꺼낸다. mention, emoji, inlineCard 는 text 필드가 없어서
// attrs 에서 가져와야 한다. 이걸 모르면 멘션이 든 항목의 제목이 통째로 비어버린다.
function leafText(node) {
  const attrs = node.attrs ?? {};
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'mention':
      return attrs.text ?? '';
    case 'emoji':
      return attrs.text ?? attrs.shortName ?? '';
    case 'inlineCard':
      return attrs.url ?? '';
    case 'hardBreak':
      return ' ';
    // 회의록 템플릿의 빈 체크박스가 이 조각만 가진다. 안내 문구를 제목으로 쓰면 안 된다
    case 'placeholder':
      return '';
    default:
      return '';
  }
}

function collect(node) {
  if (!node || typeof node !== 'object') return '';

  const children = Array.isArray(node.content) ? node.content : null;
  if (!children) return leafText(node);

  // 인라인끼리는 그대로 붙이고, 블록이 끼면 공백 하나를 넣어 문단이 엉기지 않게 한다.
  // 모르는 종류는 블록으로 본다. 공백이 하나 남는 편이 단어가 붙는 것보다 덜 위험하다.
  let out = '';
  children.forEach((child, i) => {
    if (i > 0 && !(isInline(children[i - 1]) && isInline(child))) out += ' ';
    out += collect(child);
  });
  return out;
}

/**
 * ADF 노드를 표시용 평문 한 줄로 만든다. 서식(marks)은 버린다.
 * 내용이 없으면 빈 문자열을 돌려준다.
 */
export function toPlainText(node) {
  // 실측 데이터에 링크와 멘션 다음 조각이 공백 두 개로 시작하는 경우가 있었다
  return collect(node).replace(/\s+/g, ' ').trim();
}
