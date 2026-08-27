import { describe, it, expect } from 'vitest';
import { taskOrderFromAdf } from './task-order.js';

// tasks API 는 정렬 규칙을 문서에 밝히지 않는다. 실측에서 회의록에 적은 순서와 다르게 왔다.
// 나중에 고친 항목이 뒤로 밀리는데, 읽는 사람은 회의록 순서를 기대한다.
describe('taskOrderFromAdf', () => {
  const taskItem = (localId) => ({ type: 'taskItem', attrs: { localId }, content: [] });

  it('문서에 나온 순서대로 localId 를 모은다', () => {
    const adf = {
      type: 'doc',
      content: [{ type: 'taskList', content: [taskItem('c'), taskItem('a'), taskItem('b')] }],
    };
    expect(taskOrderFromAdf(adf)).toEqual(['c', 'a', 'b']);
  });

  it('여러 목록에 흩어져 있어도 순서를 잇는다', () => {
    // 회의록은 안건마다 액션 아이템 목록이 따로 있는 경우가 흔하다
    const adf = {
      type: 'doc',
      content: [
        { type: 'taskList', content: [taskItem('a')] },
        { type: 'paragraph', content: [{ type: 'text', text: '다음 안건' }] },
        { type: 'taskList', content: [taskItem('b'), taskItem('c')] },
      ],
    };
    expect(taskOrderFromAdf(adf)).toEqual(['a', 'b', 'c']);
  });

  it('중첩된 목록도 나온 자리에서 센다', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            taskItem('a'),
            { type: 'taskList', content: [taskItem('a-1')] },
            taskItem('b'),
          ],
        },
      ],
    };
    expect(taskOrderFromAdf(adf)).toEqual(['a', 'a-1', 'b']);
  });

  it('localId 가 없는 항목은 건너뛴다', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'taskList', content: [{ type: 'taskItem', attrs: {} }, taskItem('b')] },
      ],
    };
    expect(taskOrderFromAdf(adf)).toEqual(['b']);
  });

  it('액션 아이템이 없거나 읽을 수 없으면 빈 배열을 준다', () => {
    // 이때 호출한 쪽은 API 가 준 순서를 그대로 쓴다. 정렬을 못 해도 목록은 보여야 한다
    expect(taskOrderFromAdf({ type: 'doc', content: [] })).toEqual([]);
    expect(taskOrderFromAdf(null)).toEqual([]);
    expect(taskOrderFromAdf('문자열')).toEqual([]);
  });
});
