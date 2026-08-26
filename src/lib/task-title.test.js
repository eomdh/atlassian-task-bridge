import { describe, it, expect } from 'vitest';
import { titleFromTask, TITLE_MAX_LENGTH } from './task-title.js';
import tasks from './fixtures/tasks.json';

// fixtures/tasks.json 은 데모 사이트에서 2026-08-25 에 측정한 실제 API 응답이다.
// id 196~201 은 직접 만든 회의록 페이지, id 145 는 시드 회의록 템플릿의 빈 체크박스.
const byId = (id) => tasks.find((t) => t.id === id);

// 실측 데이터를 흉내낸 최소 태스크. value 는 API 와 같이 JSON 문자열이어야 한다
const taskWithText = (t) => ({
  id: 999,
  body: {
    atlas_doc_format: {
      representation: 'atlas_doc_format',
      value: JSON.stringify({
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
      }),
    },
  },
});

describe('titleFromTask', () => {
  it('평문 태스크의 제목을 만든다', () => {
    expect(titleFromTask(byId(196))).toBe('로그인 에러 문구 정리');
  });

  it('링크가 든 태스크는 글자만 남기고 공백을 정리한다', () => {
    expect(titleFromTask(byId(198))).toBe('https://developer.atlassian.com 링크 넣기');
  });

  it('서식으로 쪼개진 태스크를 한 줄로 만든다', () => {
    expect(titleFromTask(byId(199))).toBe('굵게 와 기울임 섞기');
  });

  it('멘션이 든 태스크는 @이름을 제목에 남긴다', () => {
    expect(titleFromTask(byId(201))).toBe('@Deokhyeon Eom 담당 확인');
  });

  it('placeholder 만 있는 빈 태스크는 null 이다', () => {
    expect(titleFromTask(byId(145))).toBeNull();
  });

  it('body 가 없으면 null 이다', () => {
    expect(titleFromTask({ id: 1 })).toBeNull();
    expect(titleFromTask({ id: 1, body: {} })).toBeNull();
  });

  it('value 가 깨진 JSON 이면 null 이다', () => {
    const broken = { id: 1, body: { atlas_doc_format: { value: '{"type":"doc",' } } };
    expect(titleFromTask(broken)).toBeNull();
  });

  it('길지만 제한 이내인 항목은 자르지 않는다', () => {
    const title = titleFromTask(byId(200));
    expect(title).toBe(
      '아주 긴 항목을 하나 넣어서 제목 길이 제한에 걸리는지 확인하기 위한 줄인데 이 정도로 길게 이어 쓰면 충분할 것 같습니다'
    );
    expect(title.length).toBeLessThan(TITLE_MAX_LENGTH);
  });

  it('제한을 넘으면 잘라내고 말줄임을 붙인다', () => {
    const long = '가'.repeat(300);
    const title = titleFromTask(taskWithText(long));
    expect(title).toHaveLength(TITLE_MAX_LENGTH);
    expect(title.endsWith('…')).toBe(true);
    expect(title.startsWith('가'.repeat(TITLE_MAX_LENGTH - 1))).toBe(true);
  });

  it('정확히 제한 길이면 그대로 둔다', () => {
    const exact = '나'.repeat(TITLE_MAX_LENGTH);
    expect(titleFromTask(taskWithText(exact))).toBe(exact);
  });

  it('제한은 Jira 이슈 제목 최대 길이인 255 다', () => {
    expect(TITLE_MAX_LENGTH).toBe(255);
  });
});
