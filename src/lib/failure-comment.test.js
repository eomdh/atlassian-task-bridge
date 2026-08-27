import { describe, it, expect } from 'vitest';
import { failureCommentAdf } from './failure-comment.js';

// 이 댓글은 트리거에서만 만들어진다. 화면이 없어 눈으로 확인할 방법이 없고,
// 모양이 틀리면 Jira 가 400 으로 거절해 알림 자체가 사라진다. 여기서 고정한다.
describe('failureCommentAdf', () => {
  const line = (status) => failureCommentAdf({ status }).content[0].content[0].text;

  it('doc 루트와 version 을 갖춘다', () => {
    const adf = failureCommentAdf({ status: 404 });
    expect(adf.type).toBe('doc');
    expect(adf.version).toBe(1);
    expect(Array.isArray(adf.content)).toBe(true);
  });

  it('앱 이름을 앞에 붙여 누가 남긴 댓글인지 밝힌다', () => {
    expect(line(404)).toMatch(/^Task Bridge: /);
  });

  it('404 는 항목을 찾지 못했다고 알린다', () => {
    expect(line(404)).toContain('찾지 못해');
  });

  it('404 는 권한 때문일 가능성도 함께 말한다', () => {
    // 볼 권한이 없어도 404 가 온다. 멀쩡한 회의록을 뒤지게 만들면 안 된다
    expect(line(404)).toContain('볼 수 없는');
  });

  it('403 은 무엇을 해야 하는지 알려준다', () => {
    // 상태 코드만 보여주면 읽는 사람이 할 일을 모른다
    expect(line(403)).toContain('편집할 권한');
    expect(line(403)).toContain('요청해주세요');
  });

  it('상태 코드를 그대로 노출하지 않는다', () => {
    // 읽는 사람은 개발자가 아니다. 코드는 로그가 맡는다
    expect(line(404)).not.toContain('404');
    expect(line(403)).not.toContain('403');
  });

  it('알 수 없는 응답에도 유효한 ADF 를 돌려준다', () => {
    const adf = failureCommentAdf();
    expect(adf.type).toBe('doc');
    expect(adf.content[0].content[0].text).toContain('반영하지 못했습니다');
  });

  it('회의록 링크가 있으면 문단을 하나 더 둔다', () => {
    const adf = failureCommentAdf({ status: 404, pageUrl: 'https://x/wiki/p/1' });
    expect(adf.content).toHaveLength(2);
    expect(adf.content[1].content[0].marks).toEqual([
      { type: 'link', attrs: { href: 'https://x/wiki/p/1' } },
    ]);
  });

  it('회의록 링크를 만들 수 없으면 문장만 남긴다', () => {
    expect(failureCommentAdf({ status: 404 }).content).toHaveLength(1);
  });
});
