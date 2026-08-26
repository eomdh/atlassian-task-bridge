import { describe, it, expect } from 'vitest';
import { descriptionAdf } from './issue-description.js';

// 모양이 틀리면 Jira 가 400 으로 거절해 이슈 생성 자체가 실패한다.
// 화면으로는 확인할 수 없는 종류라 여기서 고정한다.
describe('descriptionAdf', () => {
  it('doc 루트와 version 을 갖춘다', () => {
    const adf = descriptionAdf({ pageTitle: '주간 회의', pageUrl: 'https://x/wiki/p/1' });
    expect(adf.type).toBe('doc');
    expect(adf.version).toBe(1);
    expect(Array.isArray(adf.content)).toBe(true);
  });

  it('회의록 제목에 링크를 건다', () => {
    const adf = descriptionAdf({ pageTitle: '주간 회의', pageUrl: 'https://x/wiki/p/1' });
    const link = adf.content[1].content[0];
    expect(link.text).toBe('주간 회의');
    expect(link.marks).toEqual([{ type: 'link', attrs: { href: 'https://x/wiki/p/1' } }]);
  });

  it('제목을 못 읽었어도 클릭할 글자를 남긴다', () => {
    const adf = descriptionAdf({ pageUrl: 'https://x/wiki/p/1' });
    expect(adf.content[1].content[0].text).toBe('회의록 열기');
  });

  it('링크를 만들 수 없으면 안내 문장만 남긴다', () => {
    const adf = descriptionAdf({ pageTitle: '주간 회의' });
    expect(adf.content).toHaveLength(1);
    expect(adf.content[0].content[0].text).toContain('액션 아이템에서 만들어진');
  });

  it('인자가 없어도 유효한 ADF 를 돌려준다', () => {
    const adf = descriptionAdf();
    expect(adf.type).toBe('doc');
    expect(adf.content).toHaveLength(1);
  });
});
