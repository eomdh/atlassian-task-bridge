import { describe, it, expect } from 'vitest';
import { failureCommentAdf } from './failure-comment.js';

// 이 댓글은 트리거에서만 만들어진다. 화면이 없어 눈으로 확인할 방법이 없고,
// 모양이 틀리면 Jira 가 400 으로 거절해 알림 자체가 사라진다. 여기서 고정한다.
describe('failureCommentAdf', () => {
  it('doc 루트와 version 을 갖춘다', () => {
    const adf = failureCommentAdf({ status: 404 });
    expect(adf.type).toBe('doc');
    expect(adf.version).toBe(1);
    expect(Array.isArray(adf.content)).toBe(true);
  });

  it('앱 이름을 앞에 붙여 누가 남긴 댓글인지 밝힌다', () => {
    const adf = failureCommentAdf({ status: 404 });
    expect(adf.content[0].content[0].text).toMatch(/^Task Bridge: /);
  });

  it('404 는 항목을 찾지 못했다고 알린다', () => {
    const line = failureCommentAdf({ status: 404 }).content[0].content[0].text;
    expect(line).toContain('찾지 못해');
    // 권한이 없어도 404 가 오므로 지워졌다고 단정하지 않는다
    expect(line).toContain('수 있습니다');
  });

  it('그 밖의 응답은 상태 코드를 함께 남긴다', () => {
    const line = failureCommentAdf({ status: 403 }).content[0].content[0].text;
    expect(line).toContain('(응답 403)');
  });

  it('상태 코드를 모르면 괄호를 붙이지 않는다', () => {
    const line = failureCommentAdf().content[0].content[0].text;
    expect(line).not.toContain('(응답');
    expect(line).toContain('반영하지 못했습니다');
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
