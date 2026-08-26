// ADF 를 만드는 최소 헬퍼. 이슈 본문과 실패 댓글 두 곳에서 쓴다.
// 모양이 조금만 틀려도 Jira 가 400 으로 거절하므로 만드는 자리를 한 곳에 모은다.

export const text = (value) => ({ type: 'text', text: value });

export const link = (value, href) => ({
  type: 'text',
  text: value,
  marks: [{ type: 'link', attrs: { href } }],
});

export const paragraph = (...content) => ({ type: 'paragraph', content });

export const doc = (...content) => ({ type: 'doc', version: 1, content });
