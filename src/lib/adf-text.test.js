import { describe, it, expect } from 'vitest';
import { toPlainText } from './adf-text.js';

// ADF 조각을 손으로 만드는 도우미. 테스트가 트리 모양보다 의도를 보여주게 한다
const text = (t, marks) => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const paragraph = (...content) => ({ type: 'paragraph', content });
const doc = (...content) => ({ type: 'doc', version: 1, content });

describe('toPlainText', () => {
  it('text 조각 하나는 그대로 돌려준다', () => {
    expect(toPlainText(doc(paragraph(text('로그인 에러 문구 정리'))))).toBe('로그인 에러 문구 정리');
  });

  it('서식 때문에 쪼개진 조각을 이어붙인다', () => {
    // 실측: "굵게 와 기울임 섞기" 한 줄이 조각 4개로 온다
    const input = doc(
      paragraph(
        text('굵게', [{ type: 'strong' }]),
        text(' 와 '),
        text('기울임', [{ type: 'em' }]),
        text(' 섞기')
      )
    );
    expect(toPlainText(input)).toBe('굵게 와 기울임 섞기');
  });

  it('단어 가운데가 서식으로 쪼개져도 공백을 넣지 않는다', () => {
    // 실측에서 공백은 text 조각 안에 들어 있었다 (' 와 ').
    // 그러므로 인라인 조각 사이에 구분자를 넣으면 단어가 갈라진다
    const input = doc(paragraph(text('굵은', [{ type: 'strong' }]), text('글씨')));
    expect(toPlainText(input)).toBe('굵은글씨');
  });

  it('link mark 는 글자만 남기고 href 는 버린다', () => {
    const input = doc(
      paragraph(
        text('https://developer.atlassian.com', [
          { type: 'link', attrs: { href: 'https://developer.atlassian.com' } },
        ]),
        text(' 링크 넣기')
      )
    );
    expect(toPlainText(input)).toBe('https://developer.atlassian.com 링크 넣기');
  });

  it('mention 은 attrs.text 를 쓴다', () => {
    // 실측: mention 조각에는 text 필드가 없다
    const input = doc(
      paragraph(
        { type: 'mention', attrs: { id: '712020:abc', text: '@Deokhyeon Eom' } },
        text(' 담당 확인')
      )
    );
    expect(toPlainText(input)).toBe('@Deokhyeon Eom 담당 확인');
  });

  it('emoji 는 attrs.text 를 쓰고 없으면 shortName 을 쓴다', () => {
    const withText = doc(paragraph({ type: 'emoji', attrs: { shortName: ':smile:', text: '😄' } }));
    const withoutText = doc(paragraph({ type: 'emoji', attrs: { shortName: ':smile:' } }));
    expect(toPlainText(withText)).toBe('😄');
    expect(toPlainText(withoutText)).toBe(':smile:');
  });

  it('inlineCard 는 attrs.url 을 쓴다', () => {
    const input = doc(
      paragraph(text('참고 '), { type: 'inlineCard', attrs: { url: 'https://example.com/doc' } })
    );
    expect(toPlainText(input)).toBe('참고 https://example.com/doc');
  });

  it('placeholder 는 빈 문자열이다', () => {
    // 실측: 회의록 템플릿의 빈 체크박스가 이 조각만 가진다
    const input = doc(
      paragraph({ type: 'placeholder', attrs: { text: 'Type /action item to add and assign tasks.' } })
    );
    expect(toPlainText(input)).toBe('');
  });

  it('hardBreak 는 공백 하나가 된다', () => {
    const input = doc(paragraph(text('첫 줄'), { type: 'hardBreak' }, text('둘째 줄')));
    expect(toPlainText(input)).toBe('첫 줄 둘째 줄');
  });

  it('연속 공백은 하나로 줄인다', () => {
    // 실측: 링크와 멘션 다음 조각이 공백 두 개로 시작한다
    const input = doc(paragraph(text('앞'), text('  뒤')));
    expect(toPlainText(input)).toBe('앞 뒤');
  });

  it('앞뒤 공백을 자른다', () => {
    expect(toPlainText(doc(paragraph(text('  양끝  '))))).toBe('양끝');
  });

  it('paragraph 가 여러 개면 공백으로 이어붙인다', () => {
    const input = doc(paragraph(text('첫 문단')), paragraph(text('둘째 문단')));
    expect(toPlainText(input)).toBe('첫 문단 둘째 문단');
  });

  it('모르는 노드는 content 가 있으면 재귀하고 없으면 빈 문자열이다', () => {
    const withContent = doc({ type: 'unknownBlock', content: [paragraph(text('안쪽'))] });
    const leaf = doc(paragraph({ type: 'unknownInline', attrs: {} }));
    expect(toPlainText(withContent)).toBe('안쪽');
    expect(toPlainText(leaf)).toBe('');
  });
});
